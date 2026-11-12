import type { Geometry, Polyline, Vec2 } from './types.ts';

/**
 * 2D affine transform as the matrix
 *
 *     | a c e |
 *     | b d f |
 *     | 0 0 1 |
 *
 * mapping (x, y) to (a·x + c·y + e, b·x + d·y + f). This is the same layout
 * SVG and the canvas API use.
 */
export interface Transform2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function translation(dx: number, dy: number): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

export function scaling(sx: number, sy: number = sx): Transform2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Counter-clockwise rotation about the origin (seen from above). */
export function rotation(degrees: number): Transform2D {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/**
 * Combine transforms so that they apply in the order given:
 * `compose(first, second)` applies `first`, then `second`.
 */
export function compose(...transforms: readonly Transform2D[]): Transform2D {
  let result = IDENTITY;
  for (const t of transforms) {
    result = {
      a: t.a * result.a + t.c * result.b,
      b: t.b * result.a + t.d * result.b,
      c: t.a * result.c + t.c * result.d,
      d: t.b * result.c + t.d * result.d,
      e: t.a * result.e + t.c * result.f + t.e,
      f: t.b * result.e + t.d * result.f + t.f,
    };
  }
  return result;
}

export function applyToPoint(t: Transform2D, p: Vec2): Vec2 {
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}

export function applyToPolyline(t: Transform2D, polyline: Polyline): Polyline {
  return { points: polyline.points.map((p) => applyToPoint(t, p)), closed: polyline.closed };
}

export function applyToGeometry(t: Transform2D, geometry: Geometry): Geometry {
  return {
    polylines: geometry.polylines.map((polyline) => applyToPolyline(t, polyline)),
    points: geometry.points.map((p) => applyToPoint(t, p)),
  };
}

/** How a layer's geometry is placed in the design. */
export interface Placement {
  /** Translation in mm, applied last. */
  readonly x: number;
  readonly y: number;
  /** Counter-clockwise rotation in degrees about the geometry's own origin. */
  readonly rotation: number;
  /** Scale factors, applied first. A negative factor mirrors. */
  readonly scaleX: number;
  readonly scaleY: number;
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/** Scale, then rotate, then translate. */
export function placementToTransform(placement: Placement): Transform2D {
  return compose(
    scaling(placement.scaleX, placement.scaleY),
    rotation(placement.rotation),
    translation(placement.x, placement.y),
  );
}
