import type { Vec2 } from '../geometry/index.ts';
import { rangeSize } from '../machine/index.ts';
import { placedGeometry, type GeometryResolver } from './jobs.ts';
import type { Project } from './types.ts';

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Up to four decimals, without trailing zeros. */
function number(value: number): string {
  return String(Number(value.toFixed(4)) + 0);
}

/** Radius of the circle that marks a single point (e.g. a hole), in mm. */
const POINT_RADIUS = 0.5;

/**
 * The design as an SVG drawing, for further work in other programs such
 * as FreeCAD or Inkscape.
 *
 * The page is the work area, in millimetres. SVG has Y pointing down, so
 * every point (x, y) of the design is written as (x, −y), and the viewBox
 * is placed so that the page shows the work area upright. Written this
 * way, FreeCAD's SVG import, which reads the raw coordinates and flips Y
 * back, puts everything at its project coordinates. Each visible layer
 * becomes a group; paths are drawn as outlines, points as small circles.
 */
export function exportSvg(project: Project, resolve: GeometryResolver): string {
  const { workArea } = project;
  const width = rangeSize(workArea.x);
  const height = rangeSize(workArea.y);
  const at = (p: Vec2) => `${number(p.x)} ${number(-p.y)}`;

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}mm" ` +
      `height="${number(height)}mm" viewBox="${number(workArea.x.min)} ` +
      `${number(-workArea.y.max)} ${number(width)} ${number(height)}">`,
    `  <title>${escapeXml(project.name)}</title>`,
  ];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const geometry = placedGeometry(layer, resolve);
    if (!geometry) continue;
    lines.push(
      `  <g id="${escapeXml(layer.id)}" fill="none" stroke="#000000" stroke-width="0.2">`,
      `    <title>${escapeXml(layer.name)}</title>`,
    );
    for (const { points, closed } of geometry.polylines) {
      if (points.length < 2) continue;
      const d = points.map((p, index) => `${index === 0 ? 'M' : 'L'}${at(p)}`).join(' ');
      lines.push(`    <path d="${d}${closed ? ' Z' : ''}"/>`);
    }
    for (const point of geometry.points) {
      const [cx, cy] = at(point).split(' ');
      lines.push(`    <circle cx="${cx}" cy="${cy}" r="${POINT_RADIUS}"/>`);
    }
    lines.push('  </g>');
  }
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
