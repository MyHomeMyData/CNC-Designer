import type { Vec2 } from '../../core/geometry/index.ts';

/**
 * Mapping between program coordinates (mm, Y up) and canvas pixels (Y down):
 * screen x = offsetX + x · scale, screen y = offsetY − y · scale.
 */
export interface View {
  /** Pixels per millimetre. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 400;

export function toScreen(view: View, point: Vec2): Vec2 {
  return { x: view.offsetX + point.x * view.scale, y: view.offsetY - point.y * view.scale };
}

export function toWorld(view: View, pixel: Vec2): Vec2 {
  return { x: (pixel.x - view.offsetX) / view.scale, y: (view.offsetY - pixel.y) / view.scale };
}

/** A view that shows the given box centred, with a margin in pixels. */
export function fitView(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  margin = 40,
): View {
  const boxWidth = Math.max(box.maxX - box.minX, 1e-6);
  const boxHeight = Math.max(box.maxY - box.minY, 1e-6);
  const available = { x: Math.max(width - 2 * margin, 1), y: Math.max(height - 2 * margin, 1) };
  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min(available.x / boxWidth, available.y / boxHeight)),
  );
  return {
    scale,
    offsetX: width / 2 - ((box.minX + box.maxX) / 2) * scale,
    offsetY: height / 2 + ((box.minY + box.maxY) / 2) * scale,
  };
}

/** Zoom by `factor`, keeping the point under the given pixel in place. */
export function zoomAt(view: View, pixel: Vec2, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const world = toWorld(view, pixel);
  return {
    scale,
    offsetX: pixel.x - world.x * scale,
    offsetY: pixel.y + world.y * scale,
  };
}

export function pan(view: View, dx: number, dy: number): View {
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

/**
 * Spacing of grid lines in mm: the smallest of 1, 2, 5, 10, 20, 50, … whose
 * lines are at least `minPixels` apart on screen.
 */
export function gridStep(scale: number, minPixels = 40): number {
  const raw = minPixels / scale;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const factor of [1, 2, 5, 10]) {
    if (factor * power >= raw - 1e-9) return factor * power;
  }
  return 10 * power;
}
