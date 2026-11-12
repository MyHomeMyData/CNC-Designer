/**
 * Basic 2D geometry types.
 *
 * All lengths are millimetres. Coordinates follow the machine: X to the
 * right, Y to the back, seen from above.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A chain of straight segments. Curves are flattened before they get here. */
export interface Polyline {
  readonly points: readonly Vec2[];
  /** If true, an implicit segment joins the last point back to the first. */
  readonly closed: boolean;
}

/** The output of a design module: paths to follow and single points (e.g. holes). */
export interface Geometry {
  readonly polylines: readonly Polyline[];
  readonly points: readonly Vec2[];
}

export const EMPTY_GEOMETRY: Geometry = { polylines: [], points: [] };

/** Axis-aligned bounding box. */
export interface BBox2 {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
