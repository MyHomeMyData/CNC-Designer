import { z } from 'zod';
import { DEFAULT_TOLERANCE, type Geometry } from '../../core/geometry/index.ts';
import { parseSvg, PIXEL_MM, type SvgResult } from './parse.ts';

const schema = z.strictObject({
  /** Name of the imported file, for display. */
  fileName: z.string(),
  /** The complete SVG document. Geometry is recomputed from it. */
  source: z.string(),
  /** Largest allowed deviation when curves are turned into straight segments, in mm. */
  tolerance: z.number().finite().positive(),
  /** What a number without a unit means in this file. */
  plainUnit: z.enum(['px', 'mm']),
});

export type SvgParams = z.infer<typeof schema>;

export const EMPTY_SVG_PARAMS: SvgParams = {
  fileName: '',
  source: '',
  tolerance: DEFAULT_TOLERANCE,
  plainUnit: 'px',
};

/**
 * Guess what plain numbers mean in a file. Sandify writes millimetres
 * without a unit and marks its files with the class `svg-paper`.
 */
export function guessPlainUnit(source: string): SvgParams['plainUnit'] {
  return /<svg[^>]*\bclass\s*=\s*["'][^"']*\bsvg-paper\b/.test(source) ? 'mm' : 'px';
}

export function parseSvgParams(raw: unknown): SvgParams | null {
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Reading a large file takes time, so the latest results are remembered. */
const CACHE_SIZE = 8;
const cache: { params: SvgParams; result: SvgResult }[] = [];

export function readSvg(params: SvgParams): SvgResult {
  const hit = cache.find(
    ({ params: cached }) =>
      cached.tolerance === params.tolerance &&
      cached.plainUnit === params.plainUnit &&
      cached.source === params.source,
  );
  if (hit) return hit.result;
  const result = parseSvg(
    params.source,
    params.tolerance,
    params.plainUnit === 'mm' ? 1 : PIXEL_MM,
  );
  cache.unshift({ params, result });
  cache.length = Math.min(cache.length, CACHE_SIZE);
  return result;
}

export function generateSvg(params: SvgParams): Geometry {
  if (params.source === '') return { polylines: [], points: [] };
  return readSvg(params).geometry;
}
