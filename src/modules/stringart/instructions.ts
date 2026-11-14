import type { Vec2 } from '../../core/geometry/index.ts';
import { stringArtOf } from './compute.ts';
import type { StringArtParams } from './model.ts';
import type { Nail, NailLayout } from './nails.ts';
import type { StrungThread } from './threads.ts';

/** Letters for the row number `index`: A to Z, then AA, AB and so on. */
export function rowLetters(index: number): string {
  let letters = '';
  for (let rest = index; rest >= 0; rest = Math.floor(rest / 26) - 1) {
    letters = String.fromCharCode(65 + (rest % 26)) + letters;
  }
  return letters;
}

/** One row of nails as it stands on the board: one repetition of a row of the design. */
export interface NamedRow {
  readonly letters: string;
  /** Name of the row in the design. */
  readonly rowName: string;
  /** Number of the repetition, starting with 1. */
  readonly copy: number;
  /** The nails in counting order; nail `nails[i]` is number `i + 1` of this row. */
  readonly nails: readonly number[];
  readonly closed: boolean;
}

export interface NailNames {
  readonly rows: readonly NamedRow[];
  /**
   * The name of every nail: the letters of its row and its number there,
   * starting with 1. A nail that belongs to several rows is named after
   * the first of them.
   */
  readonly names: readonly string[];
}

/**
 * Name the nails for the instructions. Every repetition of a row gets its
 * own letters, repetition after repetition, so rows that stand next to
 * each other on the board follow each other in the alphabet.
 */
export function nameNails(
  layout: NailLayout,
  params: Pick<StringArtParams, 'rows' | 'repeat'>,
): NailNames {
  const rows: NamedRow[] = [];
  const names: string[] = layout.nails.map(() => '');
  for (let copy = 0; copy < params.repeat; copy++) {
    for (const row of params.rows) {
      const placed = layout.rows.get(row.id);
      const nails = placed?.copies[copy];
      if (!placed || !nails) continue;
      const letters = rowLetters(rows.length);
      rows.push({ letters, rowName: row.name, copy: copy + 1, nails, closed: placed.closed });
      nails.forEach((nail, index) => {
        if (names[nail] === '') names[nail] = `${letters}${index + 1}`;
      });
    }
  }
  return { rows, names };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const fixed = (value: number) => (Math.round(value * 100) / 100 + 0).toString();

/** How many nails apart the numbers on the template stand. */
const NUMBER_EVERY = 5;
/** How many nails of a thread's way stand in one line of the list. */
const NAILS_PER_LINE = 10;

interface Frame {
  readonly minX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  /** The longer side, the measure for the size of the lettering. */
  readonly extent: number;
}

function frameOf(nails: readonly Nail[]): Frame {
  const xs = nails.map((nail) => nail.x);
  const ys = nails.map((nail) => nail.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const extent = Math.max(maxX - minX, maxY - minY, 1);
  const margin = extent * 0.06;
  return {
    minX: minX - margin,
    maxY: maxY + margin,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
    extent,
  };
}

/** The drawing looks at the board from above: y points up, unlike in SVG. */
function onPaper(frame: Frame, point: Vec2): Vec2 {
  return { x: point.x - frame.minX, y: frame.maxY - point.y };
}

function svgOpen(frame: Frame, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fixed(frame.width)} ${fixed(frame.height)}" role="img" aria-label="${label}">`;
}

/** The nails with the letters of their rows and a number at every fifth nail. */
function templateSvg(layout: NailLayout, named: NailNames, nailDiameter: number): string {
  const frame = frameOf(layout.nails);
  const numberSize = frame.extent / 85;
  const letterSize = frame.extent / 50;
  const radius = Math.max(nailDiameter / 2, frame.extent / 500);
  const centre = {
    x: layout.nails.reduce((sum, nail) => sum + nail.x, 0) / layout.nails.length,
    y: layout.nails.reduce((sum, nail) => sum + nail.y, 0) / layout.nails.length,
  };
  const parts: string[] = [svgOpen(frame, 'Nail template')];

  for (const nail of layout.nails) {
    const at = onPaper(frame, nail);
    parts.push(`<circle cx="${fixed(at.x)}" cy="${fixed(at.y)}" r="${fixed(radius)}"/>`);
  }

  const text = (at: Vec2, size: number, content: string, className: string) => {
    const paper = onPaper(frame, at);
    // Moved down by a third of its size, the text sits centred on the point.
    parts.push(
      `<text class="${className}" x="${fixed(paper.x)}" y="${fixed(paper.y + size * 0.35)}" font-size="${fixed(size)}">${content}</text>`,
    );
  };

  for (const row of named.rows) {
    const points = row.nails.map((id) => layout.nails[id] as Nail);
    const count = points.length;
    if (count === 0) continue;
    /** Direction of the row at nail `index`, as a unit vector. */
    const along = (index: number): Vec2 => {
      const before = points[row.closed ? (index - 1 + count) % count : Math.max(index - 1, 0)];
      const after = points[row.closed ? (index + 1) % count : Math.min(index + 1, count - 1)];
      const dx = (after as Nail).x - (before as Nail).x;
      const dy = (after as Nail).y - (before as Nail).y;
      const length = Math.hypot(dx, dy);
      return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    };
    /** To the side of the row, on the side away from the middle of the design. */
    const aside = (index: number): Vec2 => {
      const direction = along(index);
      const side = { x: -direction.y, y: direction.x };
      const point = points[index] as Nail;
      const outward = side.x * (point.x - centre.x) + side.y * (point.y - centre.y);
      return outward < 0 ? { x: -side.x, y: -side.y } : side;
    };

    points.forEach((point, index) => {
      const number = index + 1;
      const isEnd = !row.closed && number === count;
      if (number !== 1 && number % NUMBER_EVERY !== 0 && !isEnd) return;
      // A nail shared with an earlier row carries that row's number only.
      if (named.names[row.nails[index] as number] !== `${row.letters}${number}`) return;
      // The last nail of an open row gets no number if one stands right next to it.
      if (isEnd && number % NUMBER_EVERY !== 0 && number % NUMBER_EVERY < 3) return;
      const side = aside(index);
      const offset = radius + numberSize;
      text(
        { x: point.x + side.x * offset, y: point.y + side.y * offset },
        numberSize,
        String(number),
        'number',
      );
    });

    // The letters stand at nail 1: before the beginning of an open row,
    // further out than the numbers on a closed one.
    const first = points[0] as Nail;
    const direction = row.closed ? aside(0) : along(0);
    const sign = row.closed ? 1 : -1;
    const offset = radius + (row.closed ? numberSize * 2 + letterSize : letterSize);
    text(
      { x: first.x + sign * direction.x * offset, y: first.y + sign * direction.y * offset },
      letterSize,
      row.letters,
      'letters',
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** The finished piece: the threads in their colours on the board. */
function pictureSvg(
  layout: NailLayout,
  threads: readonly StrungThread[],
  background: string,
): string {
  const frame = frameOf(layout.nails);
  const parts: string[] = [
    svgOpen(frame, 'The finished piece'),
    `<rect width="${fixed(frame.width)}" height="${fixed(frame.height)}" fill="${escapeHtml(background)}"/>`,
  ];
  for (const thread of threads) {
    const points = thread.route
      .map((id) => onPaper(frame, layout.nails[id] as Nail))
      .map((point) => `${fixed(point.x)},${fixed(point.y)}`)
      .join(' ');
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${escapeHtml(thread.color)}" stroke-width="${fixed(frame.extent / 800)}" stroke-opacity="0.8"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

function metres(length: number): string {
  return `${(length / 1000).toFixed(1)} m`;
}

/** The way of one thread, nail by nail, in numbered lines. */
function threadSection(thread: StrungThread, names: readonly string[]): string {
  const crossings = new Set(thread.joins.map((join) => join.index));
  const lines: string[] = [];
  for (let start = 0; start < thread.route.length; start += NAILS_PER_LINE) {
    const cells = thread.route.slice(start, start + NAILS_PER_LINE).map((nail, offset) => {
      const name = names[nail] ?? '?';
      // The crossing leads from this nail to the next one.
      return crossings.has(start + offset) ? `${name} <b title="crossing">⇢</b>` : name;
    });
    lines.push(`<li><span class="step">${start + 1}</span> ${cells.join(' ')}</li>`);
  }
  const first = names[thread.route[0] as number] ?? '?';
  const last = names[thread.route[thread.route.length - 1] as number] ?? '?';
  const crossingNote =
    thread.joins.length > 0
      ? ` ${thread.joins.length} ${thread.joins.length === 1 ? 'crossing' : 'crossings'} (⇢) of up to ${Math.max(...thread.joins.map((join) => join.length)).toFixed(0)} mm.`
      : '';
  return [
    '<section class="thread">',
    `<h2><span class="swatch" style="background:${escapeHtml(thread.color)}"></span>${escapeHtml(thread.name)}</h2>`,
    `<p>${metres(thread.length)} of thread, plus what the two knots need. `,
    `Tie it to <strong>${first}</strong>; it ends at <strong>${last}</strong> `,
    `after ${thread.route.length} nails.${crossingNote}</p>`,
    `<ol class="steps">${lines.join('')}</ol>`,
    '</section>',
  ].join('');
}

const STYLE = `
  @page { size: A4; margin: 12mm; }
  body { font: 10pt/1.4 system-ui, sans-serif; color: #000; background: #fff; margin: 0 auto; padding: 8mm; max-width: 186mm; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  h2 { font-size: 12pt; margin: 6mm 0 1mm; }
  p { margin: 0 0 2mm; }
  svg { display: block; width: 100%; max-height: 235mm; }
  .template { break-after: page; }
  .template circle { fill: #000; }
  .template text { text-anchor: middle; font-family: system-ui, sans-serif; }
  .template .number { fill: #444; }
  .template .letters { fill: #b00020; font-weight: bold; }
  .picture svg { max-height: 90mm; }
  .rows { columns: 3; padding: 0; margin: 0 0 2mm; list-style: none; font-size: 9pt; }
  .swatch { print-color-adjust: exact; -webkit-print-color-adjust: exact; display: inline-block; width: 3.5mm; height: 3.5mm; margin-right: 2mm; border: 0.2mm solid #000; vertical-align: -0.5mm; }
  .steps { columns: 2; column-gap: 8mm; list-style: none; padding: 0; margin: 0; font: 8pt/1.5 ui-monospace, monospace; }
  .steps li { break-inside: avoid; white-space: nowrap; }
  .steps li:nth-child(5n) { margin-bottom: 1.5mm; }
  .step { display: inline-block; width: 4.5em; color: #777; text-align: right; margin-right: 1em; }
  .print { margin: 0 0 4mm; }
  @media print { body { padding: 0; } .print { display: none; } }
`;

/**
 * The instructions for stringing the design as a web page of its own, made
 * for printing: a drawing of the nails with their names, and for every
 * thread the nails in the order it goes round them. Sizes are those of the
 * design before the layer is placed and scaled.
 */
export function instructionsHtml(params: StringArtParams): string {
  const { layout, threads } = stringArtOf(params);
  const named = nameNails(layout, params);
  const body: string[] = [
    '<h1>String art: instructions</h1>',
    '<button class="print" type="button" onclick="window.print()">Print</button>',
  ];
  if (layout.nails.length === 0) {
    body.push('<p>This design has no nails.</p>');
  } else {
    const frame = frameOf(layout.nails);
    const margin = frame.extent * 0.06;
    body.push(
      '<section class="template">',
      `<p>${layout.nails.length} nails; they span ${(frame.width - 2 * margin).toFixed(0)} × ${(frame.height - 2 * margin).toFixed(0)} mm. `,
      'Every row of nails has letters, standing at its nail 1; the nails of a row are counted from there, ',
      `and every ${NUMBER_EVERY}th one carries its number. `,
      'A nail that belongs to two rows is named after the row that comes first in the alphabet.</p>',
      templateSvg(layout, named, params.nailDiameter),
      '</section>',
      '<section class="picture">',
      '<h2>The finished piece</h2>',
      pictureSvg(layout, threads, params.background),
      '</section>',
      '<h2>Rows</h2>',
      '<ul class="rows">',
      ...named.rows.map(
        (row) =>
          `<li><strong>${row.letters}</strong> ${escapeHtml(row.rowName)}${params.repeat > 1 ? ` ${row.copy}` : ''}, ${row.nails.length} nails</li>`,
      ),
      '</ul>',
    );
    if (threads.length === 0) body.push('<p>This design has no visible threads.</p>');
    else {
      body.push(
        '<p>The threads in the order they are strung; the first one lies at the bottom. ',
        'Each list gives the nails the thread goes round, one after the other; ',
        'the grey number is the count of the first nail in its line.</p>',
        ...threads.map((thread) => threadSection(thread, named.names)),
      );
    }
  }
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>String art: instructions</title>',
    `<style>${STYLE}</style>`,
    '</head><body>',
    ...body,
    '</body></html>',
  ].join('\n');
}
