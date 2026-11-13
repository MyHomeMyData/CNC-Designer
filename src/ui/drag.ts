import {
  applyToPoint,
  placementToTransform,
  rotateAbout,
  scaleAbout,
  vectorToLocal,
  type Placement,
  type Vec2,
} from '../core/geometry/index.ts';
import type { RegisteredModule } from '../modules/registry.tsx';

/** What a drag does to a layer, relative to its state when the drag began. */
export type LayerDrag =
  | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'scale'; readonly pivot: Vec2; readonly factor: number }
  | { readonly kind: 'rotate'; readonly pivot: Vec2; readonly degrees: number }
  /** A handle of the shape was pulled by (dx, dy) in program coordinates. */
  | { readonly kind: 'shape'; readonly handleId: string; readonly dx: number; readonly dy: number };

/** State of a layer that a drag can change. */
export interface DragState {
  readonly placement: Placement;
  readonly params: unknown;
}

/** Round to a tenth of a millimetre, so dragging gives tidy positions. */
const tidy = (value: number) => Math.round(value * 10) / 10;

/** The nearest multiple of `step`. */
export function snapTo(value: number, step: number): number {
  // Adding 0 turns a negative zero into a plain one.
  return Math.round(value / step) * step + 0;
}

/**
 * The state of a layer after a drag, computed from its state when the drag
 * began, so rounding does not add up. `snap` is the width of the snap grid
 * in mm, or `null` for free movement. Returns `null` for no change.
 *
 * With a snap grid, moving puts the layer origin on the grid. A pulled edge
 * lands on a grid line; if the layer is turned so that this is not possible,
 * the side that changes becomes a multiple of the grid width instead.
 * Scaling and rotating are not snapped.
 */
export function applyLayerDrag(
  began: DragState,
  module: RegisteredModule | undefined,
  change: LayerDrag,
  snap: number | null,
): DragState | null {
  const { placement, params } = began;
  switch (change.kind) {
    case 'move': {
      const round = snap === null ? tidy : (value: number) => snapTo(value, snap);
      return {
        params,
        placement: {
          ...placement,
          x: round(placement.x + change.dx),
          y: round(placement.y + change.dy),
        },
      };
    }
    case 'scale':
      return { params, placement: scaleAbout(placement, change.pivot, change.factor) };
    case 'rotate':
      return { params, placement: rotateAbout(placement, change.pivot, change.degrees) };
    case 'shape': {
      const handle = module?.handles(params).find(({ id }) => id === change.handleId);
      if (!module || !handle) return null;
      const transform = placementToTransform(placement);
      const origin = applyToPoint(transform, { x: 0, y: 0 });
      const at = applyToPoint(transform, handle.at);
      const tip = applyToPoint(transform, handle.axis);
      // Direction of the pull in program coordinates; its length is the scale.
      const axis = { x: tip.x - origin.x, y: tip.y - origin.y };
      const scale = Math.hypot(axis.x, axis.y);
      if (!(scale > 0)) return null;

      let pull = { x: change.dx, y: change.dy };
      let snapLength: number | undefined;
      if (snap !== null) {
        const tolerance = 1e-9 * scale;
        if (Math.abs(axis.y) <= tolerance) {
          pull = { x: snapTo(at.x + change.dx, snap) - at.x, y: change.dy };
        } else if (Math.abs(axis.x) <= tolerance) {
          pull = { x: change.dx, y: snapTo(at.y + change.dy, snap) - at.y };
        } else {
          snapLength = snap / scale;
        }
      }
      // The module works in the layer's own coordinates.
      const local = vectorToLocal(placement, pull);
      const to = { x: handle.at.x + local.x, y: handle.at.y + local.y };
      const result = module.dragHandle(params, change.handleId, to, snapLength);
      if (!result) return null;
      // The origin moves along when, e.g., the lower or the left edge was pulled.
      const moved = applyToPoint(transform, result.shift);
      return { params: result.params, placement: { ...placement, x: moved.x, y: moved.y } };
    }
  }
}
