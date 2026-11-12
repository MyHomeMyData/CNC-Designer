import { describe, expect, it } from 'vitest';
import {
  circlePolyline,
  circleSegments,
  distanceToGeometry,
  distanceToSegment,
  polylineLength,
} from '../../../src/core/geometry/index.ts';

describe('circlePolyline', () => {
  it('is closed, starts at the rightmost point and lies on the circle', () => {
    const circle = circlePolyline({ x: 10, y: 5 }, 40);
    expect(circle.closed).toBe(true);
    expect(circle.points[0]).toEqual({ x: 50, y: 5 });
    for (const p of circle.points) {
      expect(Math.hypot(p.x - 10, p.y - 5)).toBeCloseTo(40, 9);
    }
  });

  it('stays within the tolerance of the true circle', () => {
    const radius = 40;
    const tolerance = 0.02;
    const segments = circleSegments(radius, tolerance);
    // largest deviation is at the middle of a segment
    const deviation = radius * (1 - Math.cos(Math.PI / segments));
    expect(deviation).toBeLessThanOrEqual(tolerance);
    expect(polylineLength(circlePolyline({ x: 0, y: 0 }, radius))).toBeCloseTo(
      2 * Math.PI * radius,
      0,
    );
  });

  it('uses more segments for larger circles, within limits', () => {
    expect(circleSegments(100)).toBeGreaterThan(circleSegments(10));
    expect(circleSegments(0.01)).toBe(12);
    expect(circleSegments(1e6)).toBe(720);
  });
});

describe('distances', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('measures to the nearest point of a segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });

  it('measures to paths, closing segments and single points', () => {
    const triangle = { points: [a, b, { x: 0, y: 10 }], closed: true };
    // closed: nearest is the closing edge on the Y axis; open: the slanted edge
    expect(distanceToGeometry({ x: -2, y: 5 }, { polylines: [triangle], points: [] })).toBe(2);
    expect(
      distanceToGeometry(
        { x: -2, y: 5 },
        { polylines: [{ ...triangle, closed: false }], points: [] },
      ),
    ).toBeCloseTo(7 / Math.SQRT2, 9);
    expect(distanceToGeometry({ x: 3, y: 4 }, { polylines: [], points: [a] })).toBe(5);
    expect(distanceToGeometry(a, { polylines: [], points: [] })).toBe(Infinity);
  });
});
