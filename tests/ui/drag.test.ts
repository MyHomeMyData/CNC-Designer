import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, type Placement } from '../../src/core/geometry/index.ts';
import { findModule } from '../../src/modules/registry.tsx';
import { applyLayerDrag, snapTo, type DragState } from '../../src/ui/drag.ts';
import { DEFAULT_SNAP, parseSnapSettings, snapStep } from '../../src/ui/snap.ts';

const shapes = findModule('shapes');
const rectangle = { shape: 'rectangle', width: 100, height: 60, cornerRadius: 0 };

function state(placement: Partial<Placement> = {}, params: unknown = rectangle): DragState {
  return { placement: { ...DEFAULT_PLACEMENT, ...placement }, params };
}

describe('snapTo', () => {
  it('gives the nearest multiple, also for negative values', () => {
    expect(snapTo(14.9, 10)).toBe(10);
    expect(snapTo(15, 10)).toBe(20);
    expect(snapTo(-14, 10)).toBe(-10);
    expect(snapTo(-3, 10)).toBe(0);
    expect(Object.is(snapTo(-3, 10), 0)).toBe(true);
    expect(snapTo(7.4, 1)).toBe(7);
  });
});

describe('moving a layer', () => {
  const began = state({ x: 3.3, y: 47 });

  it('rounds to a tenth of a millimetre without a snap grid', () => {
    const next = applyLayerDrag(began, shapes, { kind: 'move', dx: 10.04, dy: -0.26 }, null);
    expect(next?.placement.x).toBeCloseTo(13.3, 9);
    expect(next?.placement.y).toBeCloseTo(46.7, 9);
    expect(next?.params).toBe(began.params);
  });

  it('puts the layer origin on the snap grid', () => {
    const next = applyLayerDrag(began, shapes, { kind: 'move', dx: 10.04, dy: -0.26 }, 10);
    expect(next?.placement).toMatchObject({ x: 10, y: 50 });
    const fine = applyLayerDrag(began, shapes, { kind: 'move', dx: 10.04, dy: -0.26 }, 1);
    expect(fine?.placement).toMatchObject({ x: 13, y: 47 });
  });

  it('keeps rotation and scale', () => {
    const turned = state({ x: 1, y: 1, rotation: 30, scaleX: 2, scaleY: -1 });
    const next = applyLayerDrag(turned, shapes, { kind: 'move', dx: 22, dy: 0 }, 5);
    expect(next?.placement).toEqual({ x: 25, y: 0, rotation: 30, scaleX: 2, scaleY: -1 });
  });
});

describe('scaling and rotating', () => {
  it('are not snapped', () => {
    const began = state({ x: 3, y: 4 });
    const pivot = { x: 3, y: 4 };
    const scaled = applyLayerDrag(began, shapes, { kind: 'scale', pivot, factor: 1.23 }, 10);
    expect(scaled?.placement.scaleX).toBeCloseTo(1.23, 9);
    expect(scaled?.placement.x).toBeCloseTo(3, 9);
    const turned = applyLayerDrag(began, shapes, { kind: 'rotate', pivot, degrees: 12.3 }, 10);
    expect(turned?.placement.rotation).toBeCloseTo(12.3, 9);
  });
});

describe('pulling an edge of a rectangle', () => {
  const pull = (handleId: string, dx: number, dy: number) =>
    ({ kind: 'shape', handleId, dx, dy }) as const;

  it('follows the pointer without a snap grid', () => {
    const next = applyLayerDrag(state({ x: 3 }), shapes, pull('right', 12.34, 50), null);
    expect(next?.params).toEqual({ ...rectangle, width: 112.3 });
    expect(next?.placement).toMatchObject({ x: 3, y: 0 });
  });

  it('puts the pulled edge on a grid line, wherever the rectangle stands', () => {
    // right edge at 103, pulled to about 115: lands on 120, so the width is 117
    const right = applyLayerDrag(state({ x: 3 }), shapes, pull('right', 12.34, 50), 10);
    expect(right?.params).toEqual({ ...rectangle, width: 117 });
    expect(right?.placement).toMatchObject({ x: 3, y: 0 });
    // lower edge at 7, pulled to about 19: lands on 20, the upper edge stays at 67
    const bottom = applyLayerDrag(state({ y: 7 }), shapes, pull('bottom', 0, 12), 10);
    expect(bottom?.params).toEqual({ ...rectangle, height: 47 });
    expect(bottom?.placement.y).toBeCloseTo(20, 9);
  });

  it('works on a rectangle turned by 90 degrees and on a scaled one', () => {
    // turned by 90 degrees the "right" edge is the upper one, at Y = 100
    const turned = applyLayerDrag(state({ rotation: 90 }), shapes, pull('right', 0, 27), 10);
    expect(turned?.params).toEqual({ ...rectangle, width: 130 });
    // at twice the size the right edge is at X = 200; pulled to 240 the width is 120
    const scaled = applyLayerDrag(
      state({ scaleX: 2, scaleY: 2 }),
      shapes,
      pull('right', 38, 0),
      10,
    );
    expect(scaled?.params).toEqual({ ...rectangle, width: 120 });
  });

  it('makes the side a multiple of the grid when the rectangle is turned otherwise', () => {
    const began = state({ x: 3, y: 4, rotation: 30 });
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const right = applyLayerDrag(began, shapes, pull('right', 27 * cos, 27 * sin), 10);
    expect((right?.params as { width: number }).width).toBeCloseTo(130, 9);
    expect(right?.placement).toMatchObject({ x: 3, y: 4 });
    // the left edge takes the origin along its own direction
    const left = applyLayerDrag(began, shapes, pull('left', -27 * cos, -27 * sin), 10);
    expect((left?.params as { width: number }).width).toBeCloseTo(130, 9);
    expect(left?.placement.x).toBeCloseTo(3 - 30 * cos, 9);
    expect(left?.placement.y).toBeCloseTo(4 - 30 * sin, 9);
    // never less than one grid width
    const flat = applyLayerDrag(began, shapes, pull('right', -500 * cos, -500 * sin), 10);
    expect((flat?.params as { width: number }).width).toBeCloseTo(10, 9);
  });

  it('does nothing for a handle the shape does not have', () => {
    expect(applyLayerDrag(state(), shapes, pull('nope', 1, 1), 10)).toBeNull();
    const circle = state({}, { shape: 'circle', diameter: 10 });
    expect(applyLayerDrag(circle, shapes, pull('right', 1, 1), 10)).toBeNull();
    expect(applyLayerDrag(state(), undefined, pull('right', 1, 1), 10)).toBeNull();
  });
});

describe('snap settings', () => {
  it('start switched on with 10 mm', () => {
    expect(DEFAULT_SNAP).toEqual({ enabled: true, step: 10 });
    expect(parseSnapSettings(null)).toEqual(DEFAULT_SNAP);
  });

  it('accept whole millimetres from 1 upwards', () => {
    expect(snapStep(5)).toBe(5);
    expect(snapStep(2.6)).toBe(3);
    expect(snapStep(0)).toBe(1);
    expect(snapStep(-4)).toBe(1);
    expect(snapStep(100000)).toBe(500);
    expect(snapStep(Number.NaN)).toBe(10);
  });

  it('are read back as stored, and unusable data gives the defaults', () => {
    expect(parseSnapSettings('{"enabled":false,"step":25}')).toEqual({ enabled: false, step: 25 });
    expect(parseSnapSettings('{"step":0.2}')).toEqual({ enabled: true, step: 1 });
    expect(parseSnapSettings('not json')).toEqual(DEFAULT_SNAP);
    expect(parseSnapSettings('7')).toEqual(DEFAULT_SNAP);
    expect(parseSnapSettings('{"enabled":"yes","step":"5"}')).toEqual(DEFAULT_SNAP);
  });
});
