import { describe, expect, it } from 'vitest';
import { distanceToGeometry, PathBuilder, type Vec2 } from '../../../src/core/geometry/index.ts';

const p = (x: number, y: number): Vec2 => ({ x, y });

describe('PathBuilder', () => {
  it('builds open and closed sub-paths from lines', () => {
    const builder = new PathBuilder();
    builder.moveTo(p(0, 0));
    builder.lineTo(p(10, 0));
    builder.moveTo(p(0, 5));
    builder.lineTo(p(10, 5));
    builder.lineTo(p(10, 15));
    builder.close();
    expect(builder.build()).toEqual([
      { points: [p(0, 0), p(10, 0)], closed: false },
      { points: [p(0, 5), p(10, 5), p(10, 15)], closed: true },
    ]);
  });

  it('drops the repeated start point of a closed path and repeated points', () => {
    const builder = new PathBuilder();
    builder.moveTo(p(0, 0));
    builder.lineTo(p(10, 0));
    builder.lineTo(p(10, 0));
    builder.lineTo(p(10, 10));
    builder.lineTo(p(0, 0));
    builder.close();
    expect(builder.build()).toEqual([{ points: [p(0, 0), p(10, 0), p(10, 10)], closed: true }]);
  });

  it('ignores sub-paths without extent', () => {
    const builder = new PathBuilder();
    builder.moveTo(p(1, 1));
    builder.moveTo(p(2, 2));
    builder.close();
    expect(builder.build()).toEqual([]);
  });

  it('continues from the start point after closing', () => {
    const builder = new PathBuilder();
    builder.moveTo(p(0, 0));
    builder.lineTo(p(10, 0));
    builder.lineTo(p(10, 10));
    builder.close();
    builder.lineTo(p(-5, -5));
    expect(builder.build()[1]).toEqual({ points: [p(0, 0), p(-5, -5)], closed: false });
  });

  it('flattens a cubic curve within the tolerance', () => {
    // Quarter circle of radius 100 approximated by one cubic Bézier curve.
    const k = 55.22847498;
    const tolerance = 0.02;
    const builder = new PathBuilder(tolerance);
    builder.moveTo(p(100, 0));
    builder.cubicTo(p(100, k), p(k, 100), p(0, 100));
    const [curve] = builder.build();
    expect(curve?.points.at(0)).toEqual(p(100, 0));
    expect(curve?.points.at(-1)).toEqual(p(0, 100));
    for (const point of curve?.points ?? []) {
      // the Bézier approximation of a circle is itself accurate to 0.03 %
      expect(Math.abs(Math.hypot(point.x, point.y) - 100)).toBeLessThan(0.03);
    }
    // The polyline stays close to the curve between its points as well.
    const onCurve = p(100 * Math.cos(0.4), 100 * Math.sin(0.4));
    expect(
      distanceToGeometry(onCurve, { polylines: curve ? [curve] : [], points: [] }),
    ).toBeLessThan(0.03 + tolerance);
  });

  it('uses fewer points with a coarser tolerance and one segment for a straight curve', () => {
    const count = (tolerance: number) => {
      const builder = new PathBuilder(tolerance);
      builder.moveTo(p(100, 0));
      builder.cubicTo(p(100, 55), p(55, 100), p(0, 100));
      return builder.build()[0]?.points.length ?? 0;
    };
    expect(count(1)).toBeLessThan(count(0.01));
    const straight = new PathBuilder();
    straight.moveTo(p(0, 0));
    straight.cubicTo(p(10, 0), p(20, 0), p(30, 0));
    expect(straight.build()[0]?.points).toEqual([p(0, 0), p(30, 0)]);
  });

  it('draws a quadratic curve through its known midpoint', () => {
    const builder = new PathBuilder(0.001);
    builder.moveTo(p(0, 0));
    builder.quadraticTo(p(50, 100), p(100, 0));
    const [curve] = builder.build();
    // the midpoint of this parabola is (50, 50)
    expect(
      distanceToGeometry(p(50, 50), { polylines: curve ? [curve] : [], points: [] }),
    ).toBeLessThan(0.01);
  });

  it('ignores curves without a starting point', () => {
    const builder = new PathBuilder();
    builder.cubicTo(p(1, 1), p(2, 2), p(3, 3));
    expect(builder.build()).toEqual([]);
  });
});
