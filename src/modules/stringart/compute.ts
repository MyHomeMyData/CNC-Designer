import type { Geometry } from '../../core/geometry/index.ts';
import type { ModulePreview } from '../types.ts';
import type { StringArtParams } from './model.ts';
import { computeStringArt, type StringArt } from './threads.ts';

/** Width of a thread in the preview, in mm. */
const THREAD_WIDTH = 0.5;

// Parameters are immutable and replaced on every change, so one result per
// parameter object serves the geometry, the preview and the panel.
const cache = new WeakMap<StringArtParams, StringArt>();

export function stringArtOf(params: StringArtParams): StringArt {
  let art = cache.get(params);
  if (!art) {
    art = computeStringArt(params);
    cache.set(params, art);
  }
  return art;
}

/** The nails are the points to drill. */
export function generateStringArt(params: StringArtParams): Geometry {
  return {
    polylines: [],
    points: stringArtOf(params).layout.nails.map(({ x, y }) => ({ x, y })),
  };
}

/** The threads as they will lie on the board. */
export function previewStringArt(params: StringArtParams): ModulePreview {
  const { layout, threads } = stringArtOf(params);
  return {
    background: params.background,
    strokes: threads.map((thread) => ({
      color: thread.color,
      width: THREAD_WIDTH,
      points: thread.route.flatMap((id) => {
        const nail = layout.nails[id];
        return nail ? [{ x: nail.x, y: nail.y }] : [];
      }),
    })),
  };
}
