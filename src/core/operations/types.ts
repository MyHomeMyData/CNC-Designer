import { error, type Issue } from '../issues.ts';
import { EPSILON, type WorkArea } from '../machine/index.ts';

/**
 * How positioning moves (tool not working) are executed:
 * as rapid moves (`G0`, machine maximum) or at a given feed rate (`G1`).
 */
export type TravelSpeed =
  { readonly mode: 'rapid' } | { readonly mode: 'feed'; readonly feed: number };

interface OperationBase {
  readonly id: string;
  readonly name: string;
  /**
   * Name of the tool. Layers whose operations share a tool name end up in
   * the same G-code program.
   */
  readonly toolName: string;
  /** Width of the trace the tool leaves, in mm. Used for the preview only. */
  readonly toolDiameter: number;
  /** Z height for positioning moves, above the surface (> 0). */
  readonly safeZ: number;
  /** Z of the working moves. Negative values are inside the workpiece. */
  readonly workZ: number;
  /** Feed rate for moving down into the work, in mm/min. */
  readonly feedZ: number;
  readonly travel: TravelSpeed;
}

/** Follow paths at a fixed Z, e.g. engraving, pen or brush strokes. */
export interface FollowOperation extends OperationBase {
  readonly kind: 'follow';
  /** Feed rate for working moves in X/Y, in mm/min. */
  readonly feedXY: number;
  /**
   * Maximum depth per pass in mm (> 0). If the working depth is larger, the
   * path is repeated in several passes. `null` means a single pass.
   */
  readonly stepDown: number | null;
}

/** Drill a hole at each point. */
export interface DrillOperation extends OperationBase {
  readonly kind: 'drill';
  /**
   * Depth per peck in mm (> 0). After each peck the tool retracts to clear
   * chips. `null` drills each hole in one go.
   */
  readonly peckDepth: number | null;
}

export type Operation = FollowOperation | DrillOperation;

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Check an operation on its own and against the work area. */
export function validateOperation(operation: Operation, workArea: WorkArea): Issue[] {
  const issues: Issue[] = [];
  const label = `Operation "${operation.name}"`;
  const add = (code: string, message: string) =>
    issues.push(error(`operation.${code}`, `${label}: ${message}`));

  if (!Number.isFinite(operation.safeZ) || !Number.isFinite(operation.workZ)) {
    add('notFinite', 'Z values must be numbers.');
    return issues;
  }
  if (operation.safeZ <= 0) {
    add('safeZNotAbove', `safe Z (${operation.safeZ}) must be above the surface (> 0).`);
  }
  if (operation.safeZ > workArea.z.max + EPSILON) {
    add(
      'safeZOutside',
      `safe Z (${operation.safeZ}) is above the work area maximum (${workArea.z.max}).`,
    );
  }
  if (operation.workZ >= operation.safeZ) {
    add('workZNotBelowSafeZ', `working Z (${operation.workZ}) must be below safe Z.`);
  }
  if (operation.workZ < workArea.z.min - EPSILON) {
    add(
      'workZOutside',
      `working Z (${operation.workZ}) is below the work area minimum (${workArea.z.min}).`,
    );
  }
  if (!positive(operation.feedZ)) add('feedZ', 'Z feed rate must be greater than zero.');
  if (operation.travel.mode === 'feed' && !positive(operation.travel.feed)) {
    add('travelFeed', 'positioning feed rate must be greater than zero.');
  }
  if (!positive(operation.toolDiameter)) {
    add('toolDiameter', 'tool diameter must be greater than zero.');
  }
  if (operation.kind === 'follow') {
    if (!positive(operation.feedXY)) add('feedXY', 'XY feed rate must be greater than zero.');
    if (operation.stepDown !== null && !positive(operation.stepDown)) {
      add('stepDown', 'depth per pass must be greater than zero.');
    }
  } else if (operation.peckDepth !== null && !positive(operation.peckDepth)) {
    add('peckDepth', 'peck depth must be greater than zero.');
  }
  return issues;
}

/**
 * Z levels of the passes needed to reach `workZ` from the surface with at
 * most `step` per pass, shallowest first. The last level is always `workZ`.
 * Work at or above the surface needs a single pass.
 */
export function passLevels(workZ: number, step: number | null): number[] {
  if (step === null || step <= 0 || workZ >= 0) return [workZ];
  const depth = -workZ;
  const count = Math.ceil(depth / step - EPSILON);
  const levels: number[] = [];
  for (let i = 1; i < count; i++) levels.push(-i * step);
  levels.push(workZ);
  return levels;
}
