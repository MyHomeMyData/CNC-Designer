import type { Geometry, Polyline, Vec2, Vec3 } from '../geometry/index.ts';
import { EPSILON } from '../machine/index.ts';
import { passLevels, type Operation } from '../operations/index.ts';
import { joinPolylines, simplifyPolyline } from './optimize.ts';
import { orderPoints, orderPolylines } from './order.ts';
import type { Move, Toolpath, ToolpathSection } from './types.ts';

/** One layer's worth of work: geometry and the operation applied to it. */
export interface Job {
  readonly label: string;
  readonly geometry: Geometry;
  readonly operation: Operation;
  /**
   * Shorten positioning moves: join paths whose ends meet, reorder paths and
   * points, and enter closed paths at the nearest point. Switch off when the
   * order or direction of the design matters.
   */
  readonly optimizeOrder: boolean;
}

/** What the program does after the last working move. */
export type ProgramEnd =
  /** Lift to safe Z and stop at the last X/Y position. */
  | { readonly kind: 'stay' }
  /** Lift to `z` (at or above safe Z), then move to `x`, `y`. */
  | { readonly kind: 'moveTo'; readonly x: number; readonly y: number; readonly z: number };

/** When re-entering a hole after a peck, rapid down to this far above the cut depth. */
const PECK_CLEARANCE = 1;

/** Collects moves while tracking the tool position. */
class Builder {
  readonly moves: Move[] = [];
  private x = 0;
  private y = 0;
  /** `null` until the first move: the height of the tool is unknown. */
  private z: number | null = null;
  /** False until X/Y have been commanded once: the start position is unknown. */
  private xyKnown = false;

  constructor(position: Vec3 | null) {
    if (position) {
      ({ x: this.x, y: this.y, z: this.z } = position);
      this.xyKnown = true;
    }
  }

  get position(): Vec3 | null {
    return this.xyKnown && this.z !== null ? { x: this.x, y: this.y, z: this.z } : null;
  }

  private push(kind: Move['kind'], to: Vec3, feed: number | null, toolDiameter?: number): void {
    this.moves.push(
      toolDiameter === undefined ? { kind, to, feed } : { kind, to, feed, toolDiameter },
    );
    ({ x: this.x, y: this.y, z: this.z } = to);
  }

  /** Go to `target` in X/Y at height `safeZ`: adjust Z first, then move in X/Y. */
  travelTo(target: Vec2, safeZ: number, feed: number | null): void {
    if (this.z === null || Math.abs(this.z - safeZ) > EPSILON) {
      // While X/Y are still unknown, this Z move happens wherever the tool
      // stands; its X/Y are placeholders taken from the target (see Toolpath).
      const at = this.xyKnown ? { x: this.x, y: this.y } : target;
      this.push('lift', { x: at.x, y: at.y, z: safeZ }, feed);
    }
    if (!this.xyKnown || !sameXY(this.x, this.y, target)) {
      this.push('travel', { x: target.x, y: target.y, z: safeZ }, feed);
      this.xyKnown = true;
    }
  }

  /** Z-only move. `toolDiameter` marks a plunge that cuts, for the preview. */
  zTo(kind: 'plunge' | 'lift', z: number, feed: number | null, toolDiameter?: number): void {
    if (!this.xyKnown) throw new Error('Z move before first positioning');
    if (this.z !== null && Math.abs(this.z - z) <= EPSILON) return;
    this.push(kind, { x: this.x, y: this.y, z }, feed, toolDiameter);
  }

  workTo(target: Vec2, z: number, feed: number, toolDiameter: number): void {
    this.push('work', { x: target.x, y: target.y, z }, feed, toolDiameter);
  }
}

function sameXY(x: number, y: number, b: Vec2): boolean {
  return Math.abs(x - b.x) <= EPSILON && Math.abs(y - b.y) <= EPSILON;
}

function travelFeed(operation: Operation): number | null {
  return operation.travel.mode === 'rapid' ? null : operation.travel.feed;
}

function followPolyline(builder: Builder, polyline: Polyline, operation: Operation): void {
  if (operation.kind !== 'follow') return;
  const points = polyline.points;
  if (points.length === 0) return;
  const start = points[0] as Vec2;
  const travel = travelFeed(operation);
  builder.travelTo(start, operation.safeZ, travel);

  // A path with a single point has no length; it is worked as a dot.
  const levels = passLevels(operation.workZ, operation.stepDown);
  let forward = true;
  for (const level of levels) {
    // Between passes the tool stays in the material and only goes deeper:
    // a closed path ends where it started, an open one is followed back.
    builder.zTo('plunge', level, operation.feedZ, operation.toolDiameter);
    const sequence = forward ? points.slice(1) : points.slice(0, -1).reverse();
    for (const point of sequence) {
      builder.workTo(point, level, operation.feedXY, operation.toolDiameter);
    }
    if (polyline.closed && points.length > 1) {
      builder.workTo(start, level, operation.feedXY, operation.toolDiameter);
    } else {
      forward = !forward;
    }
  }
  builder.zTo('lift', operation.safeZ, travel);
}

function drillPoint(builder: Builder, point: Vec2, operation: Operation): void {
  if (operation.kind !== 'drill') return;
  const travel = travelFeed(operation);
  builder.travelTo(point, operation.safeZ, travel);
  const levels = passLevels(operation.workZ, operation.peckDepth);
  let reached: number | null = null;
  for (const level of levels) {
    if (reached !== null) {
      // Clear chips, then return at positioning speed to just above the
      // depth already cut (same idea as the G83 peck drilling cycle).
      builder.zTo('lift', operation.safeZ, travel);
      const reentry = Math.min(reached + PECK_CLEARANCE, operation.safeZ);
      builder.zTo('plunge', reentry, travel);
    }
    builder.zTo('plunge', level, operation.feedZ, operation.toolDiameter);
    reached = level;
  }
  builder.zTo('lift', operation.safeZ, travel);
}

/**
 * Turn jobs into the toolpath of one program.
 *
 * The tool may stand anywhere when the program starts, so the toolpath
 * always begins by going to safe Z and only then moves in X/Y.
 */
export function buildToolpath(jobs: readonly Job[], end: ProgramEnd = { kind: 'stay' }): Toolpath {
  const sections: ToolpathSection[] = [];
  let position: Vec3 | null = null;
  let lastTravel: number | null = null;

  for (const job of jobs) {
    const builder: Builder = new Builder(position);
    const { geometry, operation } = job;
    // Reference for the nearest-neighbour search. Before the first move the
    // position is unknown; the zero point is the best guess.
    const reference: Vec2 = position ?? { x: 0, y: 0 };
    if (operation.kind === 'follow') {
      const polylines = job.optimizeOrder
        ? orderPolylines(joinPolylines(geometry.polylines), reference)
        : geometry.polylines;
      for (const polyline of polylines) {
        followPolyline(builder, simplifyPolyline(polyline), operation);
      }
    } else {
      const points = job.optimizeOrder ? orderPoints(geometry.points, reference) : geometry.points;
      for (const point of points) drillPoint(builder, point, operation);
    }
    if (builder.moves.length > 0) {
      sections.push({ label: job.label, moves: builder.moves });
      position = builder.position;
      lastTravel = travelFeed(operation);
    }
  }

  if (end.kind === 'moveTo' && position) {
    const builder = new Builder(position);
    builder.travelTo({ x: end.x, y: end.y }, end.z, lastTravel);
    if (builder.moves.length > 0) sections.push({ label: 'End position', moves: builder.moves });
  }
  return { sections };
}
