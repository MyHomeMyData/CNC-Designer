import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bboxOfGeometry, type Geometry } from '../../src/core/geometry/index.ts';
import {
  BUILTIN_FONTS,
  decodeBase64,
  encodeBase64,
  loadFont,
} from '../../src/modules/text/fonts.ts';
import {
  DEFAULT_TEXT_PARAMS,
  generateText,
  parseTextParams,
  type TextParams,
} from '../../src/modules/text/generate.ts';
import { capHeightRatio, layoutText, missingCharacters } from '../../src/modules/text/layout.ts';

const params = (changes: Partial<TextParams> = {}): TextParams => ({
  ...DEFAULT_TEXT_PARAMS,
  ...changes,
});

function box(geometry: Geometry) {
  const b = bboxOfGeometry(geometry);
  if (!b) throw new Error('no geometry');
  return b;
}

describe('fonts', () => {
  it('loads every font that comes with the app', () => {
    for (const { id } of BUILTIN_FONTS) {
      const font = loadFont({ kind: 'builtin', id });
      expect(font, id).not.toBeNull();
      expect(
        missingCharacters(font as NonNullable<typeof font>, 'Jürgen Größe 0-9 äöüÄÖÜß'),
        id,
      ).toEqual([]);
    }
  });

  it('returns null for an unknown font and for data that is not a font', () => {
    expect(loadFont({ kind: 'builtin', id: 'nope' })).toBeNull();
    expect(loadFont({ kind: 'file', name: 'x.ttf', data: btoa('not a font') })).toBeNull();
    expect(generateText(params({ font: { kind: 'builtin', id: 'nope' } })).polylines).toEqual([]);
  });

  it('reads a font file supplied by the user', () => {
    const file = readFileSync(
      new URL(
        '../../node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff',
        import.meta.url,
      ),
    );
    const data = file.toString('base64');
    const geometry = generateText(params({ font: { kind: 'file', name: 'oswald.woff', data } }));
    expect(geometry.polylines.length).toBeGreaterThan(0);
  });

  it('encodes and decodes Base64 without loss', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256);
    const back = new Uint8Array(decodeBase64(encodeBase64(bytes.buffer)));
    expect(back.length).toBe(bytes.length);
    expect(back.every((value, i) => value === bytes[i])).toBe(true);
  });
});

describe('text layout', () => {
  it('makes capital letters exactly as high as requested, standing on the baseline', () => {
    const b = box(generateText(params({ text: 'H', capHeight: 20 })));
    expect(b.minY).toBeCloseTo(0, 2);
    expect(b.maxY).toBeCloseTo(20, 2);
    expect(b.minX).toBeGreaterThanOrEqual(0);
  });

  it('scales with the capital height', () => {
    const small = box(generateText(params({ text: 'Hallo', capHeight: 10 })));
    const large = box(generateText(params({ text: 'Hallo', capHeight: 30 })));
    expect(large.maxX / small.maxX).toBeCloseTo(3, 1);
  });

  it('draws closed outlines, with holes as separate paths', () => {
    const { polylines } = generateText(params({ text: 'O' }));
    expect(polylines).toHaveLength(2);
    expect(polylines.every((p) => p.closed)).toBe(true);
  });

  it('draws nothing for spaces and empty text', () => {
    expect(generateText(params({ text: '' })).polylines).toEqual([]);
    expect(generateText(params({ text: '   ' })).polylines).toEqual([]);
  });

  it('adds letter spacing between letters only', () => {
    const tight = box(generateText(params({ text: 'HHH' })));
    const wide = box(generateText(params({ text: 'HHH', letterSpacing: 5 })));
    expect(wide.maxX - tight.maxX).toBeCloseTo(10, 6);
    expect(wide.minX).toBeCloseTo(tight.minX, 6);
  });

  it('puts further lines below the first one', () => {
    const b = box(generateText(params({ text: 'H\nH', capHeight: 10, lineSpacing: 2 })));
    expect(b.maxY).toBeCloseTo(10, 2);
    expect(b.minY).toBeCloseTo(-20, 2);
  });

  it('aligns lines to the left, the centre or the right of the origin', () => {
    const text = 'HHHH\nH';
    const left = generateText(params({ text, align: 'left' }));
    const center = generateText(params({ text, align: 'center' }));
    const right = generateText(params({ text, align: 'right' }));
    expect(box(left).minX).toBeGreaterThanOrEqual(0);
    expect(box(right).maxX).toBeLessThanOrEqual(0);
    expect(box(center).minX + box(center).maxX).toBeCloseTo(0, 0);
    // the short second line is centred under the long first one
    const second = {
      polylines: center.polylines.filter((p) => (p.points[0]?.y ?? 0) < 0),
      points: [],
    };
    expect(box(second).minX + box(second).maxX).toBeCloseTo(0, 0);
  });

  it('follows the curve tolerance', () => {
    const points = (tolerance: number) =>
      generateText(params({ text: 'S', tolerance })).polylines.reduce(
        (sum, p) => sum + p.points.length,
        0,
      );
    expect(points(0.5)).toBeLessThan(points(0.01));
  });

  it('reports characters the font does not have', () => {
    const font = loadFont({ kind: 'builtin', id: 'roboto' });
    if (!font) throw new Error('font missing');
    expect(missingCharacters(font, 'Aä\n漢字B漢')).toEqual(['漢', '字']);
    expect(capHeightRatio(font)).toBeGreaterThan(0.6);
    expect(capHeightRatio(font)).toBeLessThan(0.8);
    expect(layoutText(font, 'A', DEFAULT_TEXT_PARAMS).polylines.length).toBe(2);
  });
});

describe('text parameters', () => {
  it('accepts the defaults and rejects unusable values', () => {
    expect(parseTextParams(DEFAULT_TEXT_PARAMS)).toEqual(DEFAULT_TEXT_PARAMS);
    expect(parseTextParams(params({ capHeight: 0 }))).toBeNull();
    expect(parseTextParams({ ...DEFAULT_TEXT_PARAMS, align: 'justify' })).toBeNull();
    expect(parseTextParams({ ...DEFAULT_TEXT_PARAMS, font: { kind: 'system' } })).toBeNull();
    expect(parseTextParams({ text: 'x' })).toBeNull();
  });
});
