import { describe, expect, it } from 'vitest';
import {
  bboxOfGeometry,
  bboxOfPoints,
  distance,
  polylineLength,
  unionBBox,
} from '../../../src/core/geometry/index.ts';

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('polylineLength', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('sums the segments of an open polyline', () => {
    expect(polylineLength({ points: square, closed: false })).toBe(30);
  });

  it('includes the closing segment of a closed polyline', () => {
    expect(polylineLength({ points: square, closed: true })).toBe(40);
  });

  it('is zero for empty and single-point polylines', () => {
    expect(polylineLength({ points: [], closed: false })).toBe(0);
    expect(polylineLength({ points: [{ x: 1, y: 1 }], closed: true })).toBe(0);
  });
});

describe('bounding boxes', () => {
  it('returns null for no points', () => {
    expect(bboxOfPoints([])).toBeNull();
    expect(bboxOfGeometry({ polylines: [], points: [] })).toBeNull();
  });

  it('covers negative and positive coordinates', () => {
    expect(
      bboxOfPoints([
        { x: -5, y: 2 },
        { x: 3, y: -7 },
      ]),
    ).toEqual({ minX: -5, minY: -7, maxX: 3, maxY: 2 });
  });

  it('unions boxes and treats null as empty', () => {
    const a = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b = { minX: -1, minY: 0.5, maxX: 0.5, maxY: 3 };
    expect(unionBBox(a, null)).toBe(a);
    expect(unionBBox(null, b)).toBe(b);
    expect(unionBBox(a, b)).toEqual({ minX: -1, minY: 0, maxX: 1, maxY: 3 });
  });

  it('covers polylines and single points of a geometry', () => {
    const box = bboxOfGeometry({
      polylines: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
          ],
          closed: false,
        },
      ],
      points: [{ x: -3, y: 20 }],
    });
    expect(box).toEqual({ minX: -3, minY: 0, maxX: 10, maxY: 20 });
  });
});
