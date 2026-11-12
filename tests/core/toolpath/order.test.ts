import { describe, expect, it } from 'vitest';
import type { Polyline } from '../../../src/core/geometry/index.ts';
import { orderPoints, orderPolylines } from '../../../src/core/toolpath/index.ts';

function line(x1: number, x2: number, closed = false): Polyline {
  return {
    points: [
      { x: x1, y: 0 },
      { x: x2, y: 0 },
    ],
    closed,
  };
}

describe('orderPolylines', () => {
  it('continues with the nearest path and follows open paths backwards if shorter', () => {
    const far = line(100, 110);
    const near = line(0, 10);
    const backwards = line(30, 12);
    const ordered = orderPolylines([far, near, backwards], { x: 0, y: 0 });
    expect(ordered.map((p) => p.points.map((q) => q.x))).toEqual([
      [0, 10],
      [12, 30],
      [100, 110],
    ]);
  });

  it('never reverses a closed path', () => {
    const closed = line(30, 12, true);
    const [ordered] = orderPolylines([closed], { x: 0, y: 0 });
    expect(ordered?.points.map((q) => q.x)).toEqual([30, 12]);
  });

  it('drops empty paths and keeps all others', () => {
    const empty: Polyline = { points: [], closed: false };
    expect(orderPolylines([empty, line(0, 1), line(5, 6)], { x: 0, y: 0 })).toHaveLength(2);
  });

  it('does not modify its input', () => {
    const input = [line(30, 12)];
    orderPolylines(input, { x: 0, y: 0 });
    expect(input[0]?.points[0]?.x).toBe(30);
  });
});

describe('orderPoints', () => {
  it('visits the nearest remaining point next', () => {
    const points = [
      { x: 50, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: -5, y: 0 },
    ];
    expect(orderPoints(points, { x: 0, y: 0 }).map((p) => p.x)).toEqual([-5, 10, 20, 50]);
  });
});
