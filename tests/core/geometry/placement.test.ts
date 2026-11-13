import { describe, expect, it } from 'vitest';
import {
  applyToGeometry,
  bboxOfGeometry,
  centerOn,
  DEFAULT_PLACEMENT,
  fitInto,
  keepInPlace,
  mirrorAbout,
  placementToTransform,
  rotateAbout,
  scaleAbout,
  transformToPlacement,
  type BBox2,
  type Geometry,
  type Placement,
} from '../../../src/core/geometry/index.ts';

/** An L-shaped, asymmetric figure so that mirroring and rotation are visible. */
const figure: Geometry = {
  polylines: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 0, y: 20 },
      ],
      closed: true,
    },
  ],
  points: [],
};

function placedBox(placement: Placement): BBox2 {
  const box = bboxOfGeometry(applyToGeometry(placementToTransform(placement), figure));
  if (!box) throw new Error('empty');
  return box;
}

function expectBox(placement: Placement, expected: number[]): void {
  const b = placedBox(placement);
  [b.minX, b.minY, b.maxX, b.maxY].forEach((value, i) =>
    expect(value).toBeCloseTo(expected[i] as number, 6),
  );
}

const start: Placement = { ...DEFAULT_PLACEMENT, x: 100, y: 50 };
const center = { x: 120, y: 60 };

describe('transformToPlacement', () => {
  it('is the inverse of placementToTransform', () => {
    const cases: Placement[] = [
      DEFAULT_PLACEMENT,
      { x: 5, y: -3, rotation: 30, scaleX: 2, scaleY: 0.5 },
      { x: 0, y: 0, rotation: -120, scaleX: 1, scaleY: -1 },
      { x: 1, y: 2, rotation: 180, scaleX: 3, scaleY: 3 },
    ];
    for (const placement of cases) {
      const back = transformToPlacement(placementToTransform(placement));
      expect(placementToTransform(back).a).toBeCloseTo(placementToTransform(placement).a, 9);
      expect(back.x).toBeCloseTo(placement.x, 9);
      expect(back.scaleY).toBeCloseTo(placement.scaleY, 9);
      expectBox(back, [...Object.values(placedBox(placement))]);
    }
  });

  it('gives tidy values', () => {
    const turned = rotateAbout(DEFAULT_PLACEMENT, { x: 0, y: 0 }, 90);
    expect(turned).toEqual({ x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 });
    expect(Object.is(rotateAbout(turned, { x: 0, y: 0 }, -90).rotation, 0)).toBe(true);
  });
});

describe('placement tools', () => {
  it('rotates about the centre of the layer', () => {
    // box 40 × 20 around (120, 60) becomes 20 × 40 around the same centre
    expectBox(rotateAbout(start, center, 90), [110, 40, 130, 80]);
    expectBox(rotateAbout(rotateAbout(start, center, 90), center, -90), [100, 50, 140, 70]);
  });

  it('adds rotations up', () => {
    const twice = rotateAbout(rotateAbout(start, center, 30), center, 60);
    expect(twice.rotation).toBeCloseTo(90, 6);
  });

  it('scales uniformly about a fixed point', () => {
    const doubled = scaleAbout(start, center, 2);
    expectBox(doubled, [80, 40, 160, 80]);
    expect(doubled.scaleX).toBe(2);
    expect(doubled.scaleY).toBe(2);
    // the lower left corner as the fixed point
    expectBox(scaleAbout(start, { x: 100, y: 50 }, 0.5), [100, 50, 120, 60]);
  });

  it('ignores unusable scale factors', () => {
    expect(scaleAbout(start, center, 0)).toBe(start);
    expect(scaleAbout(start, center, -2)).toBe(start);
    expect(scaleAbout(start, center, NaN)).toBe(start);
  });

  it('mirrors in place', () => {
    const flipped = mirrorAbout(start, center, 'horizontal');
    expectBox(flipped, [100, 50, 140, 70]);
    // the foot of the L was on the left and is now on the right
    const geometry = applyToGeometry(placementToTransform(flipped), figure);
    const tall = geometry.polylines[0]?.points.filter((p) => Math.abs(p.y - 70) < 1e-6) ?? [];
    expect(Math.min(...tall.map((p) => p.x))).toBeCloseTo(130, 6);
    // mirroring twice restores the original
    expectBox(mirrorAbout(flipped, center, 'horizontal'), [100, 50, 140, 70]);
    expect(mirrorAbout(flipped, center, 'horizontal').scaleY).toBeCloseTo(1, 9);
  });

  it('mirrors a rotated layer correctly', () => {
    const turned = rotateAbout(start, center, 30);
    const flipped = mirrorAbout(turned, center, 'vertical');
    const before = placedBox(turned);
    // the box is mirrored at the horizontal line through the pivot (y = 60)
    expectBox(flipped, [before.minX, 120 - before.maxY, before.maxX, 120 - before.minY]);
    expect(flipped.scaleX * flipped.scaleY).toBeLessThan(0);
  });

  it('keeps the layer in place when a single value of the placement changes', () => {
    const local = { x: 20, y: 10 };
    const turned = keepInPlace(start, { ...start, rotation: 90 }, local);
    expect(turned.rotation).toBe(90);
    expectBox(turned, [110, 40, 130, 80]);
    const stretched = keepInPlace(start, { ...start, scaleX: 2 }, local);
    expectBox(stretched, [80, 50, 160, 70]);
  });

  it('centres on a point', () => {
    expectBox(centerOn(start, placedBox(start), { x: 0, y: 0 }), [-20, -10, 20, 10]);
  });

  it('fits into a box, centred and with a margin', () => {
    const target = { minX: 0, minY: 0, maxX: 400, maxY: 400 };
    expectBox(fitInto(start, placedBox(start), target), [0, 100, 400, 300]);
    expectBox(fitInto(start, placedBox(start), target, 50), [50, 125, 350, 275]);
    const turned = rotateAbout(start, center, 90);
    expectBox(fitInto(turned, placedBox(turned), target), [100, 0, 300, 400]);
  });

  it('leaves the placement alone when there is no room', () => {
    const target = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(fitInto(start, placedBox(start), target, 5)).toBe(start);
  });
});
