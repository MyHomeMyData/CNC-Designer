import { distance, type Vec2 } from '../../core/geometry/index.ts';
import type { Curve, NailSpacing, Row, StringArtParams } from './model.ts';

/** Nails closer than this are one and the same nail, in mm. */
export const MERGE_TOLERANCE = 0.01;
/** Number of pieces an ellipse is cut into for measuring lengths along it. */
const ARC_SAMPLES = 2048;

/** Cosine of an angle in degrees, exact for multiples of 90 degrees. */
export function cosDeg(degrees: number): number {
  const turns = degrees / 90;
  if (Number.isInteger(turns)) return [1, 0, -1, 0][((turns % 4) + 4) % 4] as number;
  return Math.cos((degrees * Math.PI) / 180);
}

/** Sine of an angle in degrees, exact for multiples of 90 degrees. */
export function sinDeg(degrees: number): number {
  return cosDeg(degrees - 90);
}

export function rotatePoint(point: Vec2, degrees: number): Vec2 {
  const cos = cosDeg(degrees);
  const sin = sinDeg(degrees);
  // Adding 0 turns a negative zero into a plain one.
  return { x: point.x * cos - point.y * sin + 0, y: point.x * sin + point.y * cos + 0 };
}

/** The nails of one row, in the order they are counted, starting with nail 0. */
export interface RowNails {
  readonly points: readonly Vec2[];
  /** On a closed row counting goes round in a circle. */
  readonly closed: boolean;
}

/** Number of gaps between nails for a stretch of the given length. */
function gapCount(length: number, row: Row, closed: boolean, pieces = 1): number {
  // A tapering row is spread by number where it cannot taper.
  if (row.nails.mode === 'taper') {
    const gaps = closed ? row.nails.count : row.nails.count - 1;
    return Math.max(1, Math.round(gaps / pieces));
  }
  if (row.nails.mode === 'distance') {
    return Math.max(1, Math.round(length / pieces / row.nails.distance));
  }
  // A closed row has as many gaps as nails, an open one one less.
  const gaps = closed ? row.nails.count : row.nails.count - 1;
  return Math.max(1, Math.round(gaps / pieces));
}

function segmentNails(curve: Extract<Curve, { kind: 'segment' }>, row: Row): RowNails {
  const from = { x: curve.x1, y: curve.y1 };
  const to = { x: curve.x2, y: curve.y2 };
  if (row.nails.mode === 'taper') {
    return {
      points: taperShares(row.nails).map((share) => between(from, to, share)),
      closed: false,
    };
  }
  const gaps = gapCount(distance(from, to), row, false);
  const points: Vec2[] = [];
  for (let i = 0; i <= gaps; i++) points.push(between(from, to, i / gaps));
  return { points, closed: false };
}

function between(a: Vec2, b: Vec2, t: number): Vec2 {
  // The ends are returned as they are, so that rows meet exactly.
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function polygonNails(curve: Extract<Curve, { kind: 'polygon' }>, row: Row): RowNails {
  const corners: Vec2[] = [];
  for (let side = 0; side < curve.sides; side++) {
    const angle = curve.rotation + (360 * side) / curve.sides;
    corners.push({
      x: curve.cx + curve.radius * cosDeg(angle),
      y: curve.cy + curve.radius * sinDeg(angle),
    });
  }
  const first = corners[0] as Vec2;
  const sideLength = distance(first, corners[1] as Vec2);
  // Every side gets the same number of nails, so each corner has one.
  const gaps = gapCount(sideLength * curve.sides, row, true, curve.sides);
  const points: Vec2[] = [];
  corners.forEach((corner, side) => {
    const next = corners[(side + 1) % corners.length] as Vec2;
    for (let i = 0; i < gaps; i++) points.push(between(corner, next, i / gaps));
  });
  return { points, closed: true };
}

function arcNails(curve: Extract<Curve, { kind: 'arc' }>, row: Row): RowNails {
  const { cx, cy, rx, ry, start } = curve;
  const closed = Math.abs(curve.end - start) >= 360;
  const sweep = closed ? Math.sign(curve.end - start) * 360 : curve.end - start;
  const at = (angle: number): Vec2 => ({
    x: cx + rx * cosDeg(angle),
    y: cy + ry * sinDeg(angle),
  });
  if (sweep === 0) return { points: [at(start)], closed: false };

  // Length along the curve up to each sample; on a circle it grows evenly.
  const lengths = [0];
  let previous = at(start);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const point = at(start + (sweep * i) / ARC_SAMPLES);
    lengths.push((lengths[i - 1] as number) + distance(previous, point));
    previous = point;
  }
  const total = lengths[ARC_SAMPLES] as number;
  const gaps = Math.max(closed ? 3 : 1, gapCount(total, row, closed));

  const points: Vec2[] = [];
  let sample = 0;
  const nails = closed ? gaps : gaps + 1;
  for (let i = 0; i < nails; i++) {
    if (i === gaps) {
      points.push(at(start + sweep));
      continue;
    }
    // Find the angle at which the wanted length is reached.
    const wanted = rx === ry ? null : (total * i) / gaps;
    let fraction = i / gaps;
    if (wanted !== null) {
      while (sample < ARC_SAMPLES - 1 && (lengths[sample + 1] as number) < wanted) sample++;
      const low = lengths[sample] as number;
      const high = lengths[sample + 1] as number;
      fraction = (sample + (high > low ? (wanted - low) / (high - low) : 0)) / ARC_SAMPLES;
    }
    points.push(at(start + sweep * fraction));
  }
  return { points, closed };
}

/**
 * Where the nails of a tapering row stand, as shares of the whole length:
 * the first `even` nails at the same distance, then each distance `factor`
 * times the one before, so that the last one is `ratio` times the first.
 */
export function taperShares(spacing: Extract<NailSpacing, { mode: 'taper' }>): number[] {
  const gaps = spacing.count - 1;
  // Distances that stay the same; the first distance always counts as one of them.
  const same = Math.min(Math.max(spacing.even - 1, 1), gaps);
  const steps = gaps - same;
  const factor = steps > 0 ? spacing.ratio ** (1 / steps) : 1;
  const sizes: number[] = [];
  for (let i = 0; i < gaps; i++) sizes.push(i < same ? 1 : factor ** (i - same + 1));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const shares = [0];
  for (const size of sizes) shares.push((shares[shares.length - 1] as number) + size / total);
  shares[shares.length - 1] = 1;
  return shares;
}

/** Points at the given shares of the length of the curve `at(t)`, t from 0 to 1. */
function alongCurve(at: (t: number) => Vec2, shares: readonly number[]): Vec2[] {
  const lengths = [0];
  let previous = at(0);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const point = at(i / ARC_SAMPLES);
    lengths.push((lengths[i - 1] as number) + distance(previous, point));
    previous = point;
  }
  const total = lengths[ARC_SAMPLES] as number;
  let sample = 0;
  return shares.map((share) => {
    if (share <= 0) return at(0);
    if (share >= 1) return at(1);
    const wanted = total * share;
    while (sample < ARC_SAMPLES - 1 && (lengths[sample + 1] as number) < wanted) sample++;
    const low = lengths[sample] as number;
    const high = lengths[sample + 1] as number;
    return at((sample + (high > low ? (wanted - low) / (high - low) : 0)) / ARC_SAMPLES);
  });
}

/** The point at `t` (0 to 1) of a spiral. */
export function spiralPoint(curve: Extract<Curve, { kind: 'spiral' }>, t: number): Vec2 {
  const { cx, cy, r1, r2, start, turn, shape } = curve;
  const radius = r2 + (r1 - r2) * (1 - t) ** shape;
  const angle = start + turn * t;
  return { x: cx + radius * cosDeg(angle), y: cy + radius * sinDeg(angle) };
}

/**
 * On a spiral, a number of nails stand at equal steps of the angle, so
 * they come closer together where the spiral runs nearer to its centre.
 * A distance between nails, and a tapering row, are measured along the curve.
 */
function spiralNails(curve: Extract<Curve, { kind: 'spiral' }>, row: Row): RowNails {
  const at = (t: number) => spiralPoint(curve, t);
  const spacing = row.nails;
  if (spacing.mode === 'count') {
    const gaps = spacing.count - 1;
    const points: Vec2[] = [];
    for (let i = 0; i <= gaps; i++) points.push(at(i / gaps));
    return { points, closed: false };
  }
  if (spacing.mode === 'taper') {
    return { points: alongCurve(at, taperShares(spacing)), closed: false };
  }
  let length = 0;
  let previous = at(0);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const point = at(i / ARC_SAMPLES);
    length += distance(previous, point);
    previous = point;
  }
  const gaps = gapCount(length, row, false);
  const shares: number[] = [];
  for (let i = 0; i <= gaps; i++) shares.push(i / gaps);
  return { points: alongCurve(at, shares), closed: false };
}

/** The nails of a row before repetition, evenly spread along its curve. */
export function rowNails(row: Row): RowNails {
  switch (row.curve.kind) {
    case 'segment':
      return segmentNails(row.curve, row);
    case 'arc':
      return arcNails(row.curve, row);
    case 'polygon':
      return polygonNails(row.curve, row);
    case 'spiral':
      return spiralNails(row.curve, row);
  }
}

export interface Nail {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** All nails of a design, with rows repeated and shared nails merged. */
export interface NailLayout {
  readonly nails: readonly Nail[];
  /** For each row, per repetition, the nails in counting order. */
  readonly rows: ReadonlyMap<string, RowLayout>;
  /** Pairs of nails that stand closer together than allowed. */
  readonly tooClose: readonly (readonly [number, number])[];
}

export interface RowLayout {
  readonly closed: boolean;
  /** `copies[c][i]` is the nail with number `i` in repetition `c`. */
  readonly copies: readonly (readonly number[])[];
}

/** Looks up points that lie within a given distance of each other. */
class PointGrid {
  private readonly cells = new Map<string, number[]>();

  constructor(private readonly cellSize: number) {}

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  add(index: number, point: Vec2): void {
    const key = `${this.cell(point.x)},${this.cell(point.y)}`;
    const cell = this.cells.get(key);
    if (cell) cell.push(index);
    else this.cells.set(key, [index]);
  }

  /** Indices in the cell of the point and the cells around it. */
  near(point: Vec2): number[] {
    const found: number[] = [];
    const cx = this.cell(point.x);
    const cy = this.cell(point.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(`${cx + dx},${cy + dy}`);
        if (cell) found.push(...cell);
      }
    }
    return found;
  }
}

/**
 * Place all nails: every row is repeated around the origin, and nails that
 * fall on the same spot, also from different rows, become one nail.
 */
export function layoutNails(
  params: Pick<StringArtParams, 'rows' | 'repeat' | 'minSpacing'>,
): NailLayout {
  const nails: Nail[] = [];
  const merge = new PointGrid(MERGE_TOLERANCE);
  const rows = new Map<string, RowLayout>();

  const nailAt = (point: Vec2): number => {
    for (const index of merge.near(point)) {
      if (distance(nails[index] as Nail, point) <= MERGE_TOLERANCE) return index;
    }
    const id = nails.length;
    nails.push({ id, x: point.x, y: point.y });
    merge.add(id, point);
    return id;
  };

  for (const row of params.rows) {
    const { points, closed } = rowNails(row);
    const copies: number[][] = [];
    for (let copy = 0; copy < params.repeat; copy++) {
      const angle = (360 * copy) / params.repeat;
      copies.push(points.map((point) => nailAt(copy === 0 ? point : rotatePoint(point, angle))));
    }
    rows.set(row.id, { closed, copies });
  }

  const tooClose: [number, number][] = [];
  if (params.minSpacing > MERGE_TOLERANCE) {
    const grid = new PointGrid(params.minSpacing);
    for (const nail of nails) {
      for (const other of grid.near(nail)) {
        // An allowance of a hundredth of a millimetre, far below what can be
        // drilled: nails meant to stand at the minimum are accepted even if
        // measuring along a curve leaves them a hair closer.
        if (distance(nails[other] as Nail, nail) < params.minSpacing - MERGE_TOLERANCE) {
          tooClose.push([other, nail.id]);
        }
      }
      grid.add(nail.id, nail);
    }
  }
  return { nails, rows, tooClose };
}
