import type { Font, Glyph } from 'opentype.js';
import { PathBuilder, type Geometry } from '../../core/geometry/index.ts';

export interface TextStyle {
  /** Height of a capital letter in mm. */
  readonly capHeight: number;
  /** Extra space between letters in mm; may be negative. */
  readonly letterSpacing: number;
  /** Distance between baselines as a multiple of the capital height. */
  readonly lineSpacing: number;
  readonly align: 'left' | 'center' | 'right';
  /** Largest allowed deviation when curves are flattened, in mm. */
  readonly tolerance: number;
}

/** Any size will do for measuring; outlines scale linearly with it. */
const MEASURE_SIZE = 1000;

/**
 * Height of a capital letter for a font size of 1, measured on the letter H
 * (or the tallest of a few others if the font has no H).
 */
export function capHeightRatio(font: Font): number {
  for (const char of ['H', 'I', 'E', 'X', '1']) {
    const glyph = font.charToGlyph(char);
    if (glyph.index === 0) continue;
    let top = 0;
    for (const command of glyph.getPath(0, 0, MEASURE_SIZE).commands) {
      // Font outlines come with Y pointing down, so "up" is negative.
      if (command.type !== 'Z') top = Math.max(top, -command.y);
    }
    if (top > 0) return top / MEASURE_SIZE;
  }
  // No usable letter: assume the common proportion of about 70 %.
  return 0.7;
}

/** Characters of the text that the font has no glyph for. */
export function missingCharacters(font: Font, text: string): string[] {
  const missing = new Set<string>();
  for (const char of text) {
    if (char !== '\n' && char !== '\r' && font.charToGlyph(char).index === 0) missing.add(char);
  }
  return [...missing];
}

/**
 * Outlines of the text as paths.
 *
 * The origin is on the baseline of the last line that has text: at its left
 * end, its middle or its right end, depending on the alignment. Earlier
 * lines stand above it, so the origin marks the lower edge of the whole
 * block (apart from descenders, as in g or p).
 */
export function layoutText(font: Font, text: string, style: TextStyle): Geometry {
  const fontSize = style.capHeight / capHeightRatio(font);
  const unit = fontSize / font.unitsPerEm;
  const builder = new PathBuilder(style.tolerance);

  const lines = text.split(/\r?\n/);
  // Empty lines at the end take no part in the placement.
  let lastLine = lines.length - 1;
  while (lastLine > 0 && (lines[lastLine] ?? '').trim() === '') lastLine -= 1;

  lines.forEach((line, lineIndex) => {
    // One glyph per character. The library's own text shaping (ligatures)
    // fails on some fonts, and for engraving plain letters are what is wanted.
    const glyphs = [...line].map((char) => font.charToGlyph(char));
    // Position of each glyph on the line, starting at 0.
    const positions: number[] = [];
    let x = 0;
    glyphs.forEach((glyph: Glyph, index) => {
      positions.push(x);
      x += (glyph.advanceWidth ?? 0) * unit;
      const next = glyphs[index + 1];
      if (next) x += font.getKerningValue(glyph, next) * unit + style.letterSpacing;
    });
    const offset = style.align === 'left' ? 0 : style.align === 'center' ? -x / 2 : -x;
    const baseline = (lastLine - lineIndex) * style.capHeight * style.lineSpacing;

    glyphs.forEach((glyph, index) => {
      const left = offset + (positions[index] ?? 0);
      // Turn Y upwards and move the line to its baseline.
      const y = (value: number) => baseline - value;
      // The contours of a glyph are always closed shapes, but not every font
      // format says so explicitly. Each contour is therefore closed here.
      let open = false;
      for (const c of glyph.getPath(left, 0, fontSize).commands) {
        switch (c.type) {
          case 'M':
            if (open) builder.close();
            builder.moveTo({ x: c.x, y: y(c.y) });
            open = true;
            break;
          case 'L':
            builder.lineTo({ x: c.x, y: y(c.y) });
            break;
          case 'C':
            builder.cubicTo(
              { x: c.x1, y: y(c.y1) },
              { x: c.x2, y: y(c.y2) },
              { x: c.x, y: y(c.y) },
            );
            break;
          case 'Q':
            builder.quadraticTo({ x: c.x1, y: y(c.y1) }, { x: c.x, y: y(c.y) });
            break;
          case 'Z':
            builder.close();
            open = false;
            break;
        }
      }
      if (open) builder.close();
    });
  });
  return { polylines: builder.build(), points: [] };
}
