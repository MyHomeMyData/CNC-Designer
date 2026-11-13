import svgpath from 'svgpath';
import {
  applyToPoint,
  bboxOfGeometry,
  compose,
  IDENTITY,
  PathBuilder,
  rotation,
  scaling,
  translation,
  type Geometry,
  type Transform2D,
  type Vec2,
} from '../../core/geometry/index.ts';
import { parseXml, type XmlElement } from './xml.ts';

export interface SvgResult {
  /** Paths in mm, Y up, with the lower left corner of the page at the origin. */
  readonly geometry: Geometry;
  /** Reason why the file could not be read at all, or `null`. */
  readonly error: string | null;
  /** Things that were skipped or assumed. */
  readonly warnings: readonly string[];
  /** Page size in mm, or `null` if the file does not state one. */
  readonly page: { readonly width: number; readonly height: number } | null;
}

/** Size of a CSS pixel: 96 per inch. */
export const PIXEL_MM = 25.4 / 96;

const MM_PER_UNIT: Readonly<Record<string, number>> = {
  px: PIXEL_MM,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  mm: 1,
  cm: 10,
  in: 25.4,
};

/**
 * Length in mm, or `null` if it is missing or relative (%, em, …).
 * `plainUnit` is the size in mm of a number without a unit.
 */
function lengthInMm(text: string | undefined, plainUnit: number): number | null {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(text ?? '');
  if (!match) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const factor = unit === '' ? plainUnit : MM_PER_UNIT[unit];
  return factor === undefined ? null : Number(match[1]) * factor;
}

function numbers(text: string | undefined): number[] {
  return (text ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
}

/** Numeric attribute in user units; a unit suffix is ignored. */
function attr(element: XmlElement, name: string, fallback = 0): number {
  const value = parseFloat(element.attributes[name] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

/** The transform described by an SVG `transform` attribute. */
export function parseTransform(text: string | undefined): Transform2D {
  if (!text) return IDENTITY;
  const steps: Transform2D[] = [];
  for (const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = numbers(match[2]);
    const n = (index: number, fallback = 0) => v[index] ?? fallback;
    switch (match[1]) {
      case 'matrix':
        if (v.length === 6) {
          steps.push({ a: n(0), b: n(1), c: n(2), d: n(3), e: n(4), f: n(5) });
        }
        break;
      case 'translate':
        steps.push(translation(n(0), n(1)));
        break;
      case 'scale':
        steps.push(scaling(n(0, 1), n(1, n(0, 1))));
        break;
      case 'rotate':
        // rotate(angle, cx, cy) turns about the point (cx, cy)
        steps.push(compose(translation(-n(1), -n(2)), rotation(n(0)), translation(n(1), n(2))));
        break;
      case 'skewX':
        steps.push({ ...IDENTITY, c: Math.tan((n(0) * Math.PI) / 180) });
        break;
      case 'skewY':
        steps.push({ ...IDENTITY, b: Math.tan((n(0) * Math.PI) / 180) });
        break;
    }
  }
  // In SVG the rightmost transform of the list is applied to a point first.
  return compose(...steps.reverse());
}

function isHidden(element: XmlElement): boolean {
  const { display, visibility, style = '' } = element.attributes;
  return (
    display === 'none' ||
    visibility === 'hidden' ||
    /(^|;)\s*display\s*:\s*none/.test(style) ||
    /(^|;)\s*visibility\s*:\s*hidden/.test(style)
  );
}

/** Path data that draws the given basic shape, or `null` if it draws nothing. */
function shapePath(element: XmlElement): string | null {
  switch (element.name) {
    case 'path':
      return element.attributes.d ?? null;
    case 'line':
      return (
        `M${attr(element, 'x1')} ${attr(element, 'y1')}` +
        `L${attr(element, 'x2')} ${attr(element, 'y2')}`
      );
    case 'polyline':
    case 'polygon': {
      const v = numbers(element.attributes.points);
      if (v.length < 4) return null;
      let d = `M${v[0]} ${v[1]}`;
      for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
      return element.name === 'polygon' ? d + 'Z' : d;
    }
    case 'rect': {
      const x = attr(element, 'x');
      const y = attr(element, 'y');
      const w = attr(element, 'width');
      const h = attr(element, 'height');
      if (w <= 0 || h <= 0) return null;
      // If only one corner radius is given, it applies to both directions.
      const rxGiven = attr(element, 'rx', NaN);
      const ryGiven = attr(element, 'ry', NaN);
      const rx = Math.min(w / 2, Math.max(0, Number.isNaN(rxGiven) ? ryGiven || 0 : rxGiven));
      const ry = Math.min(h / 2, Math.max(0, Number.isNaN(ryGiven) ? rxGiven || 0 : ryGiven));
      if (rx === 0 || ry === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
        `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
        `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const cx = attr(element, 'cx');
      const cy = attr(element, 'cy');
      const rx = element.name === 'circle' ? attr(element, 'r') : attr(element, 'rx');
      const ry = element.name === 'circle' ? rx : attr(element, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return (
        `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}` +
        `A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`
      );
    }
    default:
      return null;
  }
}

const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);
/** Containers whose content is drawn where they stand. */
const GROUPS = new Set(['g', 'svg', 'a', 'switch']);
/** Deepest nesting of `use` references that is followed. */
const MAX_USE_DEPTH = 10;

/**
 * Read the outlines of all visible shapes of an SVG document.
 *
 * Fill and stroke are ignored: every shape contributes its outline as a
 * path. Curves are flattened to within `tolerance` mm. Text is not
 * converted; it has to be turned into paths in the drawing program first.
 *
 * `plainUnit` is the size in mm of numbers without a unit. The SVG standard
 * says a pixel (96 per inch), but some programs, e.g. Sandify, write
 * millimetres without saying so.
 */
export function parseSvg(source: string, tolerance: number, plainUnit = PIXEL_MM): SvgResult {
  const empty: Geometry = { polylines: [], points: [] };
  const xml = parseXml(source);
  if (xml.error !== null) {
    return {
      geometry: empty,
      error: `Not a valid SVG file: ${xml.error}`,
      warnings: [],
      page: null,
    };
  }
  const root = xml.root;
  if (root.name !== 'svg') {
    return {
      geometry: empty,
      error: 'Not an SVG file: the document does not start with an <svg> element.',
      warnings: [],
      page: null,
    };
  }

  const warnings = new Set<string>();
  const builder = new PathBuilder(tolerance);

  const byId = new Map<string, XmlElement>();
  const index = (element: XmlElement): void => {
    if (element.attributes.id) byId.set(element.attributes.id, element);
    element.children.forEach(index);
  };
  index(root);

  // --- Page size and the transform from user units to mm, Y up -------------
  const viewBox = numbers(root.attributes.viewBox);
  const hasViewBox = viewBox.length === 4 && (viewBox[2] ?? 0) > 0 && (viewBox[3] ?? 0) > 0;
  const [minX = 0, minY = 0, boxWidth = 0, boxHeight = 0] = hasViewBox ? viewBox : [];
  let width = lengthInMm(root.attributes.width, plainUnit);
  let height = lengthInMm(root.attributes.height, plainUnit);
  let scaleX = plainUnit;
  let scaleY = plainUnit;
  if (hasViewBox) {
    if (width === null && height === null) {
      width = boxWidth * plainUnit;
      height = boxHeight * plainUnit;
      warnings.add('The file states no size; the setting for plain numbers decides the scale.');
    } else {
      // One missing dimension follows from the other, keeping the proportions.
      width ??= ((height as number) * boxWidth) / boxHeight;
      height ??= (width * boxHeight) / boxWidth;
    }
    scaleX = width / boxWidth;
    scaleY = height / boxHeight;
  }
  const page = width !== null && height !== null ? { width, height } : null;
  if (!page) warnings.add('The file states no page size; the drawing is placed at the origin.');
  const toMm: Transform2D = {
    a: scaleX,
    b: 0,
    c: 0,
    d: -scaleY,
    e: -minX * scaleX,
    f: (page?.height ?? 0) + minY * scaleY,
  };

  // --- Drawing --------------------------------------------------------------
  function drawPath(d: string, ctm: Transform2D): void {
    const at = (x: number, y: number): Vec2 => applyToPoint(ctm, { x, y });
    let path;
    try {
      path = svgpath(d).abs().unarc().unshort();
    } catch {
      warnings.add('A path with unreadable data was skipped.');
      return;
    }
    path.iterate((segment, _index, x, y) => {
      switch (segment[0]) {
        case 'M':
          builder.moveTo(at(segment[1], segment[2]));
          break;
        case 'L':
          builder.lineTo(at(segment[1], segment[2]));
          break;
        case 'H':
          builder.lineTo(at(segment[1], y));
          break;
        case 'V':
          builder.lineTo(at(x, segment[1]));
          break;
        case 'C':
          builder.cubicTo(
            at(segment[1], segment[2]),
            at(segment[3], segment[4]),
            at(segment[5], segment[6]),
          );
          break;
        case 'Q':
          builder.quadraticTo(at(segment[1], segment[2]), at(segment[3], segment[4]));
          break;
        case 'Z':
        case 'z':
          builder.close();
          break;
      }
    });
  }

  function draw(element: XmlElement, parent: Transform2D, useDepth: number): void {
    // Elements of other namespaces (editor metadata) are not part of the drawing.
    if (element.prefix !== '' && element.prefix !== 'svg') return;
    if (isHidden(element)) return;
    const ctm = compose(parseTransform(element.attributes.transform), parent);

    if (SHAPES.has(element.name)) {
      const d = shapePath(element);
      if (d) drawPath(d, ctm);
    } else if (GROUPS.has(element.name)) {
      // A nested <svg> is positioned by x and y; its own viewBox is ignored.
      const offset =
        element.name === 'svg' && element !== root
          ? compose(translation(attr(element, 'x'), attr(element, 'y')), ctm)
          : ctm;
      for (const child of element.children) draw(child, offset, useDepth);
    } else if (element.name === 'use') {
      const href = element.attributes.href ?? element.attributes['xlink:href'] ?? '';
      const target = byId.get(href.replace(/^#/, ''));
      if (!target || useDepth >= MAX_USE_DEPTH) {
        warnings.add('A reference (<use>) could not be resolved and was skipped.');
        return;
      }
      const placed = compose(translation(attr(element, 'x'), attr(element, 'y')), ctm);
      if (target.name === 'symbol') {
        for (const child of target.children) draw(child, placed, useDepth + 1);
      } else {
        draw(target, placed, useDepth + 1);
      }
    } else if (element.name === 'text') {
      warnings.add('Text was skipped. Convert it to paths in the drawing program first.');
    } else if (element.name === 'image') {
      warnings.add('Embedded images were skipped.');
    }
    // Everything else (defs, clipPath, style, metadata, …) draws nothing itself.
  }

  draw(root, toMm, 0);
  let geometry: Geometry = { polylines: builder.build(), points: [] };

  if (!page) {
    // Without a page there is no reference for the position; use the drawing itself.
    const box = bboxOfGeometry(geometry);
    if (box) {
      const shift = translation(-box.minX, -box.minY);
      geometry = {
        polylines: geometry.polylines.map((polyline) => ({
          closed: polyline.closed,
          points: polyline.points.map((point) => applyToPoint(shift, point)),
        })),
        points: [],
      };
    }
  }
  if (geometry.polylines.length === 0) warnings.add('The file contains no paths or shapes.');
  return { geometry, error: null, warnings: [...warnings], page };
}
