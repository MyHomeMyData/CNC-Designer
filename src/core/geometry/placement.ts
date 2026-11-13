import {
  applyToPoint,
  compose,
  placementToTransform,
  rotation,
  scaling,
  translation,
  type Placement,
  type Transform2D,
} from './transform.ts';
import type { BBox2, Vec2 } from './types.ts';

/**
 * Tools that change how a layer is placed. All of them work on the placed
 * geometry as the user sees it, e.g. "turn it about its centre", and
 * return the placement that achieves this.
 */

/**
 * The placement equal to the given transform. Only works for transforms
 * made of scaling along the layer's own axes, rotation and translation,
 * which is what all tools in this file produce.
 */
export function transformToPlacement(t: Transform2D): Placement {
  const scaleX = Math.hypot(t.a, t.b);
  if (scaleX === 0) return { x: t.e, y: t.f, rotation: 0, scaleX: 0, scaleY: 0 };
  const determinant = t.a * t.d - t.b * t.c;
  // Keep angles readable: 0° instead of -0°, 90° instead of 90.00000000000001°.
  const degrees = (Math.atan2(t.b, t.a) * 180) / Math.PI;
  const tidy = (value: number) => Number(value.toFixed(9)) + 0;
  return {
    x: tidy(t.e),
    y: tidy(t.f),
    rotation: tidy(degrees),
    scaleX: tidy(scaleX),
    // A negative determinant means the layer is mirrored.
    scaleY: tidy(determinant / scaleX),
  };
}

/** Apply `change` to the placed layer, with `pivot` as the fixed point. */
function changeAbout(placement: Placement, pivot: Vec2, change: Transform2D): Placement {
  return transformToPlacement(
    compose(
      placementToTransform(placement),
      translation(-pivot.x, -pivot.y),
      change,
      translation(pivot.x, pivot.y),
    ),
  );
}

export function centerOf(box: BBox2): Vec2 {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** Turn the placed layer counter-clockwise about `pivot`. */
export function rotateAbout(placement: Placement, pivot: Vec2, degrees: number): Placement {
  return changeAbout(placement, pivot, rotation(degrees));
}

/** Scale the placed layer uniformly, keeping `pivot` in place. */
export function scaleAbout(placement: Placement, pivot: Vec2, factor: number): Placement {
  if (!Number.isFinite(factor) || factor <= 0) return placement;
  return changeAbout(placement, pivot, scaling(factor));
}

/**
 * Mirror the placed layer at the vertical (`'horizontal'` flip, left and
 * right swap) or horizontal (`'vertical'` flip) line through `pivot`.
 */
export function mirrorAbout(
  placement: Placement,
  pivot: Vec2,
  direction: 'horizontal' | 'vertical',
): Placement {
  return changeAbout(
    placement,
    pivot,
    direction === 'horizontal' ? scaling(-1, 1) : scaling(1, -1),
  );
}

/**
 * Shift `after` so that the layer's own point `local` ends up where it was
 * under `before`. Used when a single value of the placement is edited and
 * the layer should stay where it is instead of swinging about its origin.
 */
export function keepInPlace(before: Placement, after: Placement, local: Vec2): Placement {
  const was = applyToPoint(placementToTransform(before), local);
  const is = applyToPoint(placementToTransform(after), local);
  return moveBy(after, was.x - is.x, was.y - is.y);
}

/**
 * A direction or distance given in program coordinates, expressed in the
 * layer's own coordinates: the placement's rotation and scale undone.
 */
export function vectorToLocal(placement: Placement, vector: Vec2): Vec2 {
  const angle = (-placement.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: (vector.x * cos - vector.y * sin) / placement.scaleX,
    y: (vector.x * sin + vector.y * cos) / placement.scaleY,
  };
}

export function moveBy(placement: Placement, dx: number, dy: number): Placement {
  return { ...placement, x: placement.x + dx, y: placement.y + dy };
}

/** Move the layer so that the centre of its box `placed` lies on `target`. */
export function centerOn(placement: Placement, placed: BBox2, target: Vec2): Placement {
  const center = centerOf(placed);
  return moveBy(placement, target.x - center.x, target.y - center.y);
}

/**
 * Scale the layer uniformly and move it so that its box `placed` fills
 * `target` as far as the proportions allow, centred, leaving `margin` free.
 */
export function fitInto(placement: Placement, placed: BBox2, target: BBox2, margin = 0): Placement {
  const width = placed.maxX - placed.minX;
  const height = placed.maxY - placed.minY;
  const availableX = target.maxX - target.minX - 2 * margin;
  const availableY = target.maxY - target.minY - 2 * margin;
  if (availableX <= 0 || availableY <= 0) return placement;
  // A layer without extent in one direction is fitted by the other one.
  const factor = Math.min(
    width > 0 ? availableX / width : Infinity,
    height > 0 ? availableY / height : Infinity,
  );
  if (!Number.isFinite(factor)) return centerOn(placement, placed, centerOf(target));
  const pivot = centerOf(placed);
  return centerOn(scaleAbout(placement, pivot, factor), placed, centerOf(target));
}
