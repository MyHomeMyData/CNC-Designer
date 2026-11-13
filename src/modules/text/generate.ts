import { z } from 'zod';
import { DEFAULT_TOLERANCE, type Geometry } from '../../core/geometry/index.ts';
import { loadFont } from './fonts.ts';
import { layoutText } from './layout.ts';

const schema = z.strictObject({
  /** The text; line breaks start new lines. */
  text: z.string(),
  font: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('builtin'), id: z.string() }),
    z.strictObject({ kind: z.literal('file'), name: z.string(), data: z.string() }),
  ]),
  /** Height of a capital letter in mm. */
  capHeight: z.number().finite().positive(),
  /** Extra space between letters in mm. */
  letterSpacing: z.number().finite(),
  /** Distance between baselines as a multiple of the capital height. */
  lineSpacing: z.number().finite().positive(),
  align: z.enum(['left', 'center', 'right']),
  tolerance: z.number().finite().positive(),
});

export type TextParams = z.infer<typeof schema>;

export const DEFAULT_TEXT_PARAMS: TextParams = {
  text: 'Text',
  font: { kind: 'builtin', id: 'roboto' },
  capHeight: 20,
  letterSpacing: 0,
  lineSpacing: 1.6,
  align: 'left',
  tolerance: DEFAULT_TOLERANCE,
};

export function parseTextParams(raw: unknown): TextParams | null {
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Outlines of the text; nothing if the font cannot be used. */
export function generateText(params: TextParams): Geometry {
  const font = loadFont(params.font);
  return font ? layoutText(font, params.text, params) : { polylines: [], points: [] };
}
