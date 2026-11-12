import type { Polyline, Vec2 } from './types.ts';

/** Default maximum deviation between a curve and its polyline, in mm. */
export const DEFAULT_TOLERANCE = 0.02;

const MIN_CIRCLE_SEGMENTS = 12;
const MAX_CIRCLE_SEGMENTS = 720;

/**
 * Number of straight segments needed so that a circle of the given radius
 * deviates from its polygon by at most `tolerance`. Always a multiple of four.
 */
export function circleSegments(radius: number, tolerance: number = DEFAULT_TOLERANCE): number {
  if (!(radius > 0) || !(tolerance > 0) || tolerance >= radius) return MIN_CIRCLE_SEGMENTS;
  const needed = Math.ceil(Math.PI / Math.acos(1 - tolerance / radius));
  // A multiple of four puts points exactly on the extremes in X and Y, so
  // the polygon is as wide and as high as the circle.
  const count = Math.ceil(needed / 4) * 4;
  return Math.min(MAX_CIRCLE_SEGMENTS, Math.max(MIN_CIRCLE_SEGMENTS, count));
}

/** A circle as a closed polyline, starting at the rightmost point, counter-clockwise. */
export function circlePolyline(
  center: Vec2,
  radius: number,
  tolerance: number = DEFAULT_TOLERANCE,
): Polyline {
  const count = circleSegments(radius, tolerance);
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return { points, closed: true };
}
