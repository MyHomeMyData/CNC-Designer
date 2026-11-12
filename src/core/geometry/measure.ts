import type { BBox2, Geometry, Polyline, Vec2 } from './types.ts';

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Length of a polyline, including the closing segment of a closed one. */
export function polylineLength(polyline: Polyline): number {
  const { points, closed } = polyline;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distance(points[i - 1] as Vec2, points[i] as Vec2);
  }
  if (closed && points.length > 1) {
    length += distance(points[points.length - 1] as Vec2, points[0] as Vec2);
  }
  return length;
}

/** Bounding box of a set of points, or `null` if there are none. */
export function bboxOfPoints(points: Iterable<Vec2>): BBox2 | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const p of points) {
    any = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

export function unionBBox(a: BBox2 | null, b: BBox2 | null): BBox2 | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Bounding box of all polylines and points, or `null` for empty geometry. */
export function bboxOfGeometry(geometry: Geometry): BBox2 | null {
  let box = bboxOfPoints(geometry.points);
  for (const polyline of geometry.polylines) {
    box = unionBBox(box, bboxOfPoints(polyline.points));
  }
  return box;
}
