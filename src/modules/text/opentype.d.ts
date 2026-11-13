/**
 * The part of opentype.js used by the text module. The library ships
 * without type definitions.
 */
declare module 'opentype.js' {
  export type PathCommand =
    | { type: 'M'; x: number; y: number }
    | { type: 'L'; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'Z' };

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    /** Index in the font; 0 is the placeholder for characters the font lacks. */
    index: number;
    /** Horizontal space the glyph takes, in font units. */
    advanceWidth?: number;
    /** Outline at the given position, with Y pointing down as on screen. */
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export interface Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
    /** Kerning between two glyphs in font units. */
    getKerningValue(left: Glyph, right: Glyph): number;
  }

  /** Read a font in TTF, OTF or WOFF format. Throws if the data is not a font. */
  export function parse(buffer: ArrayBuffer): Font;
}
