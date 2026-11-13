import { describe, expect, it } from 'vitest';
import { applyToPoint, bboxOfGeometry, type Vec2 } from '../../src/core/geometry/index.ts';
import { guessPlainUnit, generateSvg, parseSvgParams } from '../../src/modules/svg/generate.ts';
import { parseSvg, parseTransform } from '../../src/modules/svg/parse.ts';

const TOLERANCE = 0.02;

/** A document of 100 × 50 mm whose user units are millimetres. */
function mm(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">${content}</svg>`;
}

function read(source: string) {
  const result = parseSvg(source, TOLERANCE);
  expect(result.error).toBeNull();
  return result;
}

function rounded(points: readonly Vec2[] | undefined): number[][] {
  return (points ?? []).map((p) => [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))]);
}

function box(source: string) {
  const b = bboxOfGeometry(read(source).geometry);
  if (!b) throw new Error('no geometry');
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Number(v.toFixed(2)));
}

describe('parseSvg: page and units', () => {
  it('reads millimetres and turns Y upwards, origin at the lower left of the page', () => {
    const result = read(mm('<path d="M 10 5 L 30 5 L 30 20"/>'));
    expect(result.page).toEqual({ width: 100, height: 50 });
    expect(result.warnings).toEqual([]);
    expect(result.geometry.polylines).toHaveLength(1);
    expect(rounded(result.geometry.polylines[0]?.points)).toEqual([
      [10, 45],
      [30, 45],
      [30, 30],
    ]);
  });

  it('scales user units to the stated size', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 200 100">
      <rect x="0" y="0" width="200" height="100"/></svg>`;
    expect(box(svg)).toEqual([0, 0, 50.8, 25.4]);
  });

  it('respects the origin of the viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="-50 -25 100 50">
      <line x1="-50" y1="-25" x2="50" y2="25"/></svg>`;
    expect(rounded(read(svg).geometry.polylines[0]?.points)).toEqual([
      [0, 50],
      [100, 0],
    ]);
  });

  it('treats plain numbers as pixels at 96 per inch', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="192">
      <line x1="0" y1="0" x2="96" y2="192"/></svg>`;
    const result = read(svg);
    expect(result.page).toEqual({ width: 25.4, height: 50.8 });
    expect(rounded(result.geometry.polylines[0]?.points)).toEqual([
      [0, 50.8],
      [25.4, 0],
    ]);
  });

  it('derives a missing dimension from the viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" viewBox="0 0 200 100">
      <rect width="200" height="100"/></svg>`;
    expect(read(svg).page).toEqual({ width: 100, height: 50 });
  });

  it('assumes pixels and says so when only a viewBox is given', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96"/></svg>`;
    const result = read(svg);
    expect(result.page).toEqual({ width: 25.4, height: 25.4 });
    expect(result.warnings.join(' ')).toContain('states no size');
  });

  it('can read plain numbers as millimetres, as Sandify writes them', () => {
    const svg = `<svg width="388" height="706" viewBox="0 0 388 706" xmlns="http://www.w3.org/2000/svg" class="svg-paper">
      <g><path d="M 0 0 L 388 706"/></g></svg>`;
    const result = parseSvg(svg, TOLERANCE, 1);
    expect(result.page).toEqual({ width: 388, height: 706 });
    expect(rounded(result.geometry.polylines[0]?.points)).toEqual([
      [0, 706],
      [388, 0],
    ]);
    expect(guessPlainUnit(svg)).toBe('mm');
    expect(guessPlainUnit(mm(''))).toBe('px');
  });

  it('keeps explicit units when plain numbers are millimetres', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 10 10">
      <rect width="10" height="10"/></svg>`;
    expect(parseSvg(svg, TOLERANCE, 1).page).toEqual({ width: 25.4, height: 25.4 });
  });

  it('places the drawing at the origin when there is no page size at all', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect x="960" y="960" width="96" height="48"/></svg>`;
    const result = read(svg);
    expect(result.page).toBeNull();
    expect(result.warnings.join(' ')).toContain('no page size');
    expect(box(svg)).toEqual([0, 0, 25.4, 12.7]);
  });
});

describe('parseSvg: shapes', () => {
  it('reads a rectangle as a closed path', () => {
    const [rect] = read(mm('<rect x="10" y="10" width="20" height="5"/>')).geometry.polylines;
    expect(rect?.closed).toBe(true);
    expect(rounded(rect?.points)).toEqual([
      [10, 40],
      [30, 40],
      [30, 35],
      [10, 35],
    ]);
  });

  it('rounds the corners of a rectangle', () => {
    const source = mm('<rect x="10" y="10" width="40" height="20" rx="5"/>');
    const [rect] = read(source).geometry.polylines;
    expect(box(source)).toEqual([10, 20, 50, 40]);
    expect(rect?.points.length).toBeGreaterThan(20);
    // the corner point itself is cut off
    expect(rect?.points.some((p) => Math.hypot(p.x - 10, p.y - 40) < 1)).toBe(false);
  });

  it('reads circles and ellipses within the tolerance', () => {
    const [circle] = read(mm('<circle cx="50" cy="25" r="20"/>')).geometry.polylines;
    expect(circle?.closed).toBe(true);
    for (const p of circle?.points ?? []) {
      expect(Math.abs(Math.hypot(p.x - 50, p.y - 25) - 20)).toBeLessThan(0.03);
    }
    expect(box(mm('<ellipse cx="50" cy="25" rx="30" ry="10"/>'))).toEqual([20, 15, 80, 35]);
  });

  it('reads lines, polylines and polygons', () => {
    const { polylines } = read(
      mm(`<line x1="0" y1="0" x2="10" y2="0"/>
          <polyline points="0,10 10,10 10,20"/>
          <polygon points="20,0 30,0 30,10"/>`),
    ).geometry;
    expect(polylines.map((p) => [p.points.length, p.closed])).toEqual([
      [2, false],
      [3, false],
      [3, true],
    ]);
  });

  it('reads every kind of path command', () => {
    const d =
      'M 10 10 h 10 v 10 H 10 Z m 30 0 l 10 0 q 5 5 0 10 t 0 10 c 5 0 5 10 0 10 s -5 10 0 10';
    const { polylines } = read(mm(`<path d="${d}"/>`)).geometry;
    expect(polylines).toHaveLength(2);
    expect(polylines[0]?.closed).toBe(true);
    expect(rounded(polylines[0]?.points)).toEqual([
      [10, 40],
      [20, 40],
      [20, 30],
      [10, 30],
    ]);
    // the second sub-path starts relative to the start of the first
    expect(rounded(polylines[1]?.points.slice(0, 2))).toEqual([
      [40, 40],
      [50, 40],
    ]);
    // five segments of 10 mm each lead straight down the page to its lower edge
    expect(rounded(polylines[1]?.points.slice(-1))).toEqual([[50, 0]]);
  });

  it('reads elliptical arcs', () => {
    // half circle of radius 10 from (40, 25) to (60, 25), bulging towards the top of the page
    const [arc] = read(mm('<path d="M 40 25 A 10 10 0 0 1 60 25"/>')).geometry.polylines;
    for (const p of arc?.points ?? []) {
      expect(Math.abs(Math.hypot(p.x - 50, p.y - 25) - 10)).toBeLessThan(0.03);
    }
    expect(Math.max(...(arc?.points ?? []).map((p) => p.y))).toBeCloseTo(35, 1);
  });

  it('treats coordinates after a move as lines', () => {
    const [path] = read(mm('<path d="M 0 0 10 0 10 10"/>')).geometry.polylines;
    expect(path?.points).toHaveLength(3);
  });
});

describe('parseSvg: structure', () => {
  it('applies nested transforms from the inside out', () => {
    const source = mm(
      `<g transform="translate(50 25)"><g transform="rotate(90)"><g transform="scale(2)">
         <line x1="0" y1="0" x2="5" y2="0"/>
       </g></g></g>`,
    );
    // (5,0) -> scale (10,0) -> rotate 90° in SVG (clockwise on screen) (0,10) -> translate (50,35)
    expect(rounded(read(source).geometry.polylines[0]?.points)).toEqual([
      [50, 25],
      [50, 15],
    ]);
  });

  it('applies a transform list right to left and a transform on the shape itself', () => {
    const source = mm('<line transform="translate(10 0) scale(2)" x1="0" y1="0" x2="5" y2="0"/>');
    expect(rounded(read(source).geometry.polylines[0]?.points)).toEqual([
      [10, 50],
      [20, 50],
    ]);
  });

  it('skips hidden elements and definitions', () => {
    const { polylines } = read(
      mm(`<defs><rect id="d" width="5" height="5"/></defs>
          <g display="none"><rect width="5" height="5"/></g>
          <g style="fill:none; display: none"><rect width="5" height="5"/></g>
          <rect visibility="hidden" width="5" height="5"/>
          <clipPath id="c"><rect width="5" height="5"/></clipPath>
          <rect x="1" y="1" width="5" height="5"/>`),
    ).geometry;
    expect(polylines).toHaveLength(1);
  });

  it('resolves use references, also to definitions and symbols', () => {
    const source = mm(
      `<defs><rect id="r" width="10" height="5"/><symbol id="s"><circle r="2"/></symbol></defs>
       <use href="#r" x="20" y="10"/>
       <use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#r" transform="translate(50 0)"/>
       <use href="#s" x="80" y="40"/>`,
    );
    const { polylines } = read(source).geometry;
    expect(polylines).toHaveLength(3);
    expect(rounded(polylines[0]?.points)[0]).toEqual([20, 40]);
    expect(rounded(polylines[1]?.points)[0]).toEqual([50, 50]);
    const circle = bboxOfGeometry({ polylines: polylines.slice(2), points: [] });
    expect(circle?.minX).toBeCloseTo(78, 1);
    expect(circle?.maxY).toBeCloseTo(12, 1);
  });

  it('warns about broken and endless references instead of failing', () => {
    const broken = read(mm('<use href="#missing"/><rect width="1" height="1"/>'));
    expect(broken.warnings.join(' ')).toContain('<use>');
    const endless = read(mm('<g id="a"><use href="#a"/><rect width="1" height="1"/></g>'));
    expect(endless.warnings.join(' ')).toContain('<use>');
    expect(endless.geometry.polylines.length).toBeGreaterThan(0);
  });

  it('warns about text and images, once each', () => {
    const { warnings } = read(
      mm(
        '<text x="1" y="1">a</text><text>b</text><image href="x.png"/><rect width="1" height="1"/>',
      ),
    );
    expect(warnings.filter((w) => w.includes('Text'))).toHaveLength(1);
    expect(warnings.filter((w) => w.includes('images'))).toHaveLength(1);
  });

  it('ignores editor metadata as written by Inkscape', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg"
        xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
        xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
        width="210mm" height="297mm" viewBox="0 0 210 297">
      <sodipodi:namedview id="nv" inkscape:zoom="1"><inkscape:page x="0" y="0"/></sodipodi:namedview>
      <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
        <path style="fill:none;stroke:#000" d="m 10,287 h 20" id="path1"/>
      </g></svg>`;
    const result = read(source);
    expect(result.warnings).toEqual([]);
    expect(rounded(result.geometry.polylines[0]?.points)).toEqual([
      [10, 10],
      [30, 10],
    ]);
  });

  it('skips a path with unreadable data and keeps the rest', () => {
    const result = read(mm('<path d="M 0 0 L banana"/><rect width="2" height="2"/>'));
    expect(result.geometry.polylines.length).toBeGreaterThan(0);
  });

  it('says so when the file contains nothing to draw', () => {
    expect(read(mm('')).warnings.join(' ')).toContain('no paths');
  });
});

describe('parseSvg: unusable files', () => {
  it('rejects text that is not XML', () => {
    const result = parseSvg('G1 X0 Y0', TOLERANCE);
    expect(result.error).toContain('Not a valid SVG file');
    expect(result.geometry.polylines).toEqual([]);
  });

  it('rejects XML that is not SVG', () => {
    expect(parseSvg('<html><body/></html>', TOLERANCE).error).toContain('Not an SVG file');
  });

  it('rejects an empty file', () => {
    expect(parseSvg('', TOLERANCE).error).not.toBeNull();
  });
});

describe('parseTransform', () => {
  const apply = (text: string, x: number, y: number) => {
    const p = applyToPoint(parseTransform(text), { x, y });
    return [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))];
  };

  it('reads all transform functions', () => {
    expect(apply('translate(5)', 1, 1)).toEqual([6, 1]);
    expect(apply('translate(5, -2)', 1, 1)).toEqual([6, -1]);
    expect(apply('scale(2)', 1, 3)).toEqual([2, 6]);
    expect(apply('scale(2 -1)', 1, 3)).toEqual([2, -3]);
    expect(apply('rotate(90)', 1, 0)).toEqual([0, 1]);
    expect(apply('rotate(90 10 10)', 10, 0)).toEqual([20, 10]);
    expect(apply('matrix(1 0 0 1 3 4)', 1, 1)).toEqual([4, 5]);
    expect(apply('skewX(45)', 0, 2)).toEqual([2, 2]);
    expect(apply('skewY(45)', 2, 0)).toEqual([2, 2]);
  });

  it('is the identity for missing or unreadable text', () => {
    expect(apply('', 3, 4)).toEqual([3, 4]);
    expect(apply('wobble(3)', 3, 4)).toEqual([3, 4]);
  });
});

describe('svg module', () => {
  const params = {
    fileName: 'a.svg',
    source: mm('<rect width="10" height="10"/>'),
    tolerance: 0.02,
    plainUnit: 'px' as const,
  };

  it('generates geometry from its parameters and nothing without a file', () => {
    expect(generateSvg(params).polylines).toHaveLength(1);
    expect(generateSvg({ ...params, source: '' }).polylines).toEqual([]);
  });

  it('returns the same result object for the same input', () => {
    expect(generateSvg({ ...params })).toBe(generateSvg({ ...params }));
  });

  it('checks parameters read from a project file', () => {
    expect(parseSvgParams(params)).toEqual(params);
    expect(parseSvgParams({ ...params, tolerance: 0 })).toBeNull();
    expect(parseSvgParams({ ...params, plainUnit: 'inch' })).toBeNull();
    expect(parseSvgParams({ fileName: 'a.svg' })).toBeNull();
  });
});
