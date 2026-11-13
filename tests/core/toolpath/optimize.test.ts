import { describe, expect, it } from 'vitest';
import {
  circlePolyline,
  polylineLength,
  type Polyline,
  type Vec2,
} from '../../../src/core/geometry/index.ts';
import { joinPolylines, simplifyPolyline, startNear } from '../../../src/core/toolpath/index.ts';

const p = (x: number, y: number): Vec2 => ({ x, y });
const open = (...points: Vec2[]): Polyline => ({ points, closed: false });
const xs = (polyline: Polyline | undefined) => polyline?.points.map((q) => q.x);

describe('simplifyPolyline', () => {
  it('removes points on a straight line', () => {
    const line = open(p(0, 0), p(1, 0), p(2, 0.001), p(3, 0), p(10, 0));
    expect(simplifyPolyline(line).points).toEqual([p(0, 0), p(10, 0)]);
  });

  it('keeps corners and points that matter', () => {
    const path = open(p(0, 0), p(5, 0), p(10, 0), p(10, 5), p(10, 10), p(5, 10.1), p(0, 10));
    expect(simplifyPolyline(path).points).toEqual([
      p(0, 0),
      p(10, 0),
      p(10, 10),
      p(5, 10.1),
      p(0, 10),
    ]);
    expect(simplifyPolyline(path, 0.2).points).toEqual([p(0, 0), p(10, 0), p(10, 10), p(0, 10)]);
  });

  it('keeps a closed path closed and its start point', () => {
    const square: Polyline = {
      points: [p(0, 0), p(5, 0), p(10, 0), p(10, 10), p(0, 10), p(0, 5)],
      closed: true,
    };
    const result = simplifyPolyline(square);
    expect(result.closed).toBe(true);
    expect(result.points).toEqual([p(0, 0), p(10, 0), p(10, 10), p(0, 10)]);
  });

  it('stays within the tolerance on a curve and reduces the point count', () => {
    const circle = circlePolyline(p(0, 0), 50, 0.001);
    const simplified = simplifyPolyline(circle, 0.05);
    expect(simplified.points.length).toBeLessThan(circle.points.length / 2);
    expect(Math.abs(polylineLength(simplified) - polylineLength(circle))).toBeLessThan(0.5);
    for (const q of simplified.points) expect(Math.hypot(q.x, q.y)).toBeCloseTo(50, 6);
  });

  it('leaves short paths alone and copes with very long ones', () => {
    const two = open(p(0, 0), p(1, 1));
    expect(simplifyPolyline(two)).toBe(two);
    const long: Polyline = {
      points: Array.from({ length: 200_000 }, (_, i) => p(i * 0.01, Math.sin(i / 500))),
      closed: false,
    };
    expect(simplifyPolyline(long).points.length).toBeLessThan(long.points.length);
  });
});

describe('joinPolylines', () => {
  it('joins paths that continue each other, in any order and direction', () => {
    const joined = joinPolylines([
      open(p(20, 0), p(30, 0)),
      open(p(0, 0), p(10, 0)),
      open(p(20, 0), p(10, 0)),
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.closed).toBe(false);
    const order = xs(joined[0]) ?? [];
    expect([order.join(), [...order].reverse().join()]).toContain('0,10,20,30');
  });

  it('closes a chain whose ends meet', () => {
    const joined = joinPolylines([
      open(p(0, 0), p(10, 0)),
      open(p(10, 0), p(10, 10)),
      open(p(10, 10), p(0, 10)),
      open(p(0, 10), p(0, 0)),
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.closed).toBe(true);
    expect(joined[0]?.points).toHaveLength(4);
    expect(polylineLength(joined[0] as Polyline)).toBeCloseTo(40, 9);
  });

  it('joins ends within the tolerance only', () => {
    expect(joinPolylines([open(p(0, 0), p(10, 0)), open(p(10.005, 0), p(20, 0))])).toHaveLength(1);
    expect(joinPolylines([open(p(0, 0), p(10, 0)), open(p(10.05, 0), p(20, 0))])).toHaveLength(2);
  });

  it('passes closed paths and single points through and keeps the total length', () => {
    const closed = circlePolyline(p(50, 50), 5);
    const input = [closed, open(p(0, 0), p(10, 0)), open(p(10, 0), p(10, 10)), open(p(7, 7))];
    const joined = joinPolylines(input);
    expect(joined).toContain(closed);
    expect(joined).toHaveLength(3);
    const total = (list: readonly Polyline[]) =>
      list.reduce((sum, q) => sum + polylineLength(q), 0);
    expect(total(joined)).toBeCloseTo(total(input), 9);
  });

  it('does not modify its input', () => {
    const a = open(p(0, 0), p(10, 0));
    const b = open(p(10, 0), p(20, 0));
    joinPolylines([a, b]);
    expect(a.points).toHaveLength(2);
    expect(b.points).toHaveLength(2);
  });
});

describe('startNear', () => {
  const square: Polyline = { points: [p(0, 0), p(10, 0), p(10, 10), p(0, 10)], closed: true };

  it('rotates a closed path to start at the nearest point, keeping its direction', () => {
    expect(startNear(square, p(12, 12)).points).toEqual([p(10, 10), p(0, 10), p(0, 0), p(10, 0)]);
    expect(startNear(square, p(-1, -1))).toBe(square);
  });

  it('leaves open paths alone', () => {
    const line = open(p(0, 0), p(10, 0));
    expect(startNear(line, p(10, 0))).toBe(line);
  });
});
