import { DEFAULT_TOLERANCE } from './curves.ts';
import type { Polyline, Vec2 } from './types.ts';

const MAX_CURVE_SEGMENTS = 500;

/**
 * Number of straight segments needed to approximate a cubic Bézier curve
 * within `tolerance`. Uses the bound on the deviation of a uniformly
 * subdivided curve derived from its second differences.
 */
export function cubicSegments(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number): number {
  const d1 = Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y);
  const d2 = Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y);
  const count = Math.ceil(Math.sqrt((0.75 * Math.max(d1, d2)) / tolerance));
  return Math.min(MAX_CURVE_SEGMENTS, Math.max(1, count));
}

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Builds polylines from drawing commands, the way SVG paths and font
 * outlines describe shapes. Curves are flattened within `tolerance` (mm).
 */
export class PathBuilder {
  private readonly polylines: Polyline[] = [];
  private points: Vec2[] = [];
  private readonly tolerance: number;

  constructor(tolerance: number = DEFAULT_TOLERANCE) {
    this.tolerance = tolerance > 0 ? tolerance : DEFAULT_TOLERANCE;
  }

  private get current(): Vec2 | undefined {
    return this.points[this.points.length - 1];
  }

  private add(point: Vec2): void {
    const last = this.current;
    // Skip points that repeat the previous one; they add nothing to the path.
    if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) return;
    this.points.push(point);
  }

  private finish(closed: boolean): void {
    let points = this.points;
    this.points = [];
    if (closed && points.length > 1) {
      const first = points[0] as Vec2;
      const last = points[points.length - 1] as Vec2;
      // An explicit return to the start is redundant in a closed polyline.
      if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
        points = points.slice(0, -1);
      }
    }
    // A sub-path without any extent draws nothing.
    if (points.length > 1) this.polylines.push({ points, closed });
  }

  /** Start a new sub-path at `point`. */
  moveTo(point: Vec2): void {
    this.finish(false);
    this.points.push(point);
  }

  lineTo(point: Vec2): void {
    this.add(point);
  }

  /** Cubic Bézier curve from the current point with control points `c1`, `c2` to `end`. */
  cubicTo(c1: Vec2, c2: Vec2, end: Vec2): void {
    const start = this.current;
    if (!start) return;
    const count = cubicSegments(start, c1, c2, end, this.tolerance);
    for (let i = 1; i < count; i++) this.add(cubicPoint(start, c1, c2, end, i / count));
    this.add(end);
  }

  /** Quadratic Bézier curve from the current point with control point `c` to `end`. */
  quadraticTo(c: Vec2, end: Vec2): void {
    const start = this.current;
    if (!start) return;
    // A quadratic curve is the cubic curve with these control points.
    this.cubicTo(
      { x: start.x + (2 / 3) * (c.x - start.x), y: start.y + (2 / 3) * (c.y - start.y) },
      { x: end.x + (2 / 3) * (c.x - end.x), y: end.y + (2 / 3) * (c.y - end.y) },
      end,
    );
  }

  /** Close the current sub-path. Further drawing continues from its start. */
  close(): void {
    const start = this.points[0];
    this.finish(true);
    if (start) this.points.push(start);
  }

  /** All sub-paths drawn so far. The builder can not be used afterwards. */
  build(): Polyline[] {
    this.finish(false);
    return this.polylines;
  }
}
