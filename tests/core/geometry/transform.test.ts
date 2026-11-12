import { describe, expect, it } from 'vitest';
import {
  applyToGeometry,
  applyToPoint,
  compose,
  DEFAULT_PLACEMENT,
  IDENTITY,
  placementToTransform,
  rotation,
  scaling,
  translation,
  type Vec2,
} from '../../../src/core/geometry/index.ts';

function expectPoint(actual: Vec2, x: number, y: number): void {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
}

describe('basic transforms', () => {
  const p = { x: 2, y: 1 };

  it('identity leaves a point unchanged', () => {
    expectPoint(applyToPoint(IDENTITY, p), 2, 1);
  });

  it('translates', () => {
    expectPoint(applyToPoint(translation(10, -5), p), 12, -4);
  });

  it('scales, uniformly and per axis', () => {
    expectPoint(applyToPoint(scaling(3), p), 6, 3);
    expectPoint(applyToPoint(scaling(2, -1), p), 4, -1);
  });

  it('rotates counter-clockwise', () => {
    expectPoint(applyToPoint(rotation(90), { x: 1, y: 0 }), 0, 1);
    expectPoint(applyToPoint(rotation(180), p), -2, -1);
  });
});

describe('compose', () => {
  it('applies transforms in the order given', () => {
    const p = { x: 1, y: 0 };
    expectPoint(applyToPoint(compose(translation(1, 0), rotation(90)), p), 0, 2);
    expectPoint(applyToPoint(compose(rotation(90), translation(1, 0)), p), 1, 1);
  });

  it('of nothing is the identity', () => {
    expect(compose()).toEqual(IDENTITY);
  });
});

describe('placement', () => {
  it('default placement is the identity', () => {
    expectPoint(applyToPoint(placementToTransform(DEFAULT_PLACEMENT), { x: 7, y: -3 }), 7, -3);
  });

  it('scales first, then rotates, then translates', () => {
    const t = placementToTransform({ x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 1 });
    // (1, 0) -> scale (2, 0) -> rotate (0, 2) -> translate (100, 52)
    expectPoint(applyToPoint(t, { x: 1, y: 0 }), 100, 52);
  });

  it('mirrors with a negative scale factor', () => {
    const t = placementToTransform({ ...DEFAULT_PLACEMENT, scaleX: -1 });
    expectPoint(applyToPoint(t, { x: 5, y: 2 }), -5, 2);
  });
});

describe('applyToGeometry', () => {
  it('transforms polylines and points and keeps the closed flag', () => {
    const result = applyToGeometry(translation(1, 1), {
      polylines: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
          closed: true,
        },
      ],
      points: [{ x: 5, y: 5 }],
    });
    expect(result.polylines[0]?.closed).toBe(true);
    expect(result.polylines[0]?.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(result.points).toEqual([{ x: 6, y: 6 }]);
  });
});
