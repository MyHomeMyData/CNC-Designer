import { describe, expect, it } from 'vitest';
import {
  fitView,
  gridStep,
  MAX_SCALE,
  pan,
  toScreen,
  toWorld,
  zoomAt,
} from '../../src/ui/canvas/view.ts';

const view = { scale: 2, offsetX: 100, offsetY: 300 };

describe('view', () => {
  it('maps Y up in the world to Y down on screen', () => {
    expect(toScreen(view, { x: 10, y: 20 })).toEqual({ x: 120, y: 260 });
    expect(toWorld(view, { x: 120, y: 260 })).toEqual({ x: 10, y: 20 });
  });

  it('fits a box centred with a margin', () => {
    const box = { minX: -200, minY: -200, maxX: 200, maxY: 200 };
    const fitted = fitView(box, 1000, 500, 50);
    expect(fitted.scale).toBe(1);
    expect(toScreen(fitted, { x: 0, y: 0 })).toEqual({ x: 500, y: 250 });
    expect(toScreen(fitted, { x: -200, y: 200 })).toEqual({ x: 300, y: 50 });
  });

  it('copes with an empty box and a tiny canvas', () => {
    const fitted = fitView({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 10, 10);
    expect(fitted.scale).toBe(MAX_SCALE);
    expect(Number.isFinite(fitted.offsetX)).toBe(true);
  });

  it('zooms around the pointer', () => {
    const pixel = { x: 150, y: 200 };
    const before = toWorld(view, pixel);
    const zoomed = zoomAt(view, pixel, 1.5);
    expect(zoomed.scale).toBe(3);
    const after = toWorld(zoomed, pixel);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('limits the zoom', () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 1e9).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, { x: 0, y: 0 }, 1e-9).scale).toBeGreaterThan(0);
  });

  it('pans by pixels', () => {
    expect(pan(view, 5, -7)).toEqual({ scale: 2, offsetX: 105, offsetY: 293 });
  });

  it('chooses round grid spacings', () => {
    expect(gridStep(1)).toBe(50);
    expect(gridStep(4)).toBe(10);
    expect(gridStep(40)).toBe(1);
    expect(gridStep(0.1)).toBe(500);
    expect(gridStep(25)).toBe(2);
  });
});
