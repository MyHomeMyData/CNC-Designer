import { describe, expect, it } from 'vitest';
import { distance, type Vec2 } from '../../src/core/geometry/index.ts';
import {
  parseStringArtParams,
  type Row,
  type StringArtParams,
  type Thread,
  type ThreadPart,
} from '../../src/modules/stringart/model.ts';
import {
  instructionsHtml,
  nameNails,
  rowLetters,
} from '../../src/modules/stringart/instructions.ts';
import { cosDeg, layoutNails, rowNails, sinDeg } from '../../src/modules/stringart/nails.ts';
import { generateStringArt, previewStringArt } from '../../src/modules/stringart/compute.ts';
import {
  applyTemplate,
  starGeometry,
  TEMPLATES,
  twistGeometry,
} from '../../src/modules/stringart/templates.ts';
import { computeStringArt, partLines, partRoutes } from '../../src/modules/stringart/threads.ts';

const segment = (id: string, x2: number, y2: number, count: number): Row => ({
  id,
  name: id,
  curve: { kind: 'segment', x1: 0, y1: 0, x2, y2 },
  nails: { mode: 'count', count },
});

const circle = (id: string, radius: number, count: number): Row => ({
  id,
  name: id,
  curve: { kind: 'arc', cx: 0, cy: 0, rx: radius, ry: radius, start: 0, end: 360 },
  nails: { mode: 'count', count },
});

const part = (changes: Partial<ThreadPart> = {}): ThreadPart => ({
  from: 'a',
  to: 'b',
  toCopy: 0,
  mode: 'zigzag',
  a: 1,
  b: 0,
  reverse: false,
  start: 0,
  count: null,
  step: 1,
  ...changes,
});

const thread = (parts: ThreadPart[], colors = ['#00aacc']): Thread => ({
  id: 't',
  name: 'Thread',
  colors,
  visible: true,
  double: false,
  parts,
});

const design = (changes: Partial<StringArtParams> = {}): StringArtParams => ({
  template: null,
  rows: [],
  threads: [],
  repeat: 1,
  minSpacing: 4,
  nailDiameter: 1.5,
  background: '#202020',
  ...changes,
});

/** Position of every nail on a route, for comparing with expectations. */
function positions(art: ReturnType<typeof computeStringArt>, route: readonly number[]) {
  return route.map((id) => {
    const nail = art.layout.nails[id];
    if (!nail) throw new Error(`no nail ${id}`);
    return [Math.round(nail.x * 1000) / 1000 + 0, Math.round(nail.y * 1000) / 1000 + 0];
  });
}

describe('angles', () => {
  it('are exact at multiples of 90 degrees', () => {
    expect([0, 90, 180, 270, 360, -90].map(cosDeg)).toEqual([1, 0, -1, 0, 1, 0]);
    expect([0, 90, 180, 270, 360, -90].map(sinDeg)).toEqual([0, 1, 0, -1, 0, -1]);
    expect(cosDeg(60)).toBeCloseTo(0.5, 12);
    expect(sinDeg(30)).toBeCloseTo(0.5, 12);
  });
});

describe('nails of a row', () => {
  it('stand evenly on a segment, with one at each end', () => {
    const { points, closed } = rowNails(segment('a', 100, 0, 11));
    expect(closed).toBe(false);
    expect(points.map((p) => p.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(points.every((p) => p.y === 0)).toBe(true);
  });

  it('can be set by distance; the distance is adjusted so that the row is filled evenly', () => {
    const row: Row = { ...segment('a', 100, 0, 2), nails: { mode: 'distance', distance: 9 } };
    const { points } = rowNails(row);
    // 100 / 9 = 11.1: eleven gaps of 9.09 mm
    expect(points).toHaveLength(12);
    expect(points[1]?.x).toBeCloseTo(100 / 11, 9);
    expect(points[11]).toEqual({ x: 100, y: 0 });
    // a distance longer than the row still gives the two ends
    const sparse: Row = { ...row, nails: { mode: 'distance', distance: 500 } };
    expect(rowNails(sparse).points).toHaveLength(2);
  });

  it('go round a circle counter-clockwise, starting on the right', () => {
    const { points, closed } = rowNails(circle('c', 50, 12));
    expect(closed).toBe(true);
    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points[3]).toEqual({ x: 0, y: 50 });
    expect(points[6]).toEqual({ x: -50, y: 0 });
    expect(points[1]?.x).toBeCloseTo(50 * Math.cos(Math.PI / 6), 9);
    expect(points[1]?.y).toBeCloseTo(25, 9);
  });

  it('cover part of a circle, with a nail at each end, in either direction', () => {
    const quarter: Row = {
      ...circle('c', 50, 4),
      curve: { kind: 'arc', cx: 10, cy: 0, rx: 50, ry: 50, start: 0, end: 90 },
    };
    const { points, closed } = rowNails(quarter);
    expect(closed).toBe(false);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 60, y: 0 });
    expect(points[3]).toEqual({ x: 10, y: 50 });
    expect(points[1]?.y).toBeCloseTo(25, 9);
    const clockwise: Row = {
      ...quarter,
      curve: { kind: 'arc', cx: 0, cy: 0, rx: 50, ry: 50, start: 90, end: 0 },
    };
    expect(rowNails(clockwise).points[0]).toEqual({ x: 0, y: 50 });
    expect(rowNails(clockwise).points[3]).toEqual({ x: 50, y: 0 });
  });

  it('are spread by length along an ellipse, not by angle', () => {
    const ellipse: Row = {
      ...circle('e', 1, 40),
      curve: { kind: 'arc', cx: 0, cy: 0, rx: 100, ry: 50, start: 0, end: 360 },
    };
    const { points } = rowNails(ellipse);
    expect(points).toHaveLength(40);
    for (const p of points) expect((p.x / 100) ** 2 + (p.y / 50) ** 2).toBeCloseTo(1, 9);
    const gaps = points.map((p, i) => distance(p, points[(i + 1) % points.length] ?? p));
    // straight distances differ a little where the curve bends more
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.03);
    // spread by angle, the nails would be nearly twice as far apart at the ends
    expect(points[10]?.x).toBeCloseTo(0, 6);
    expect(points[10]?.y).toBeCloseTo(50, 6);
  });

  it('put a nail on every corner of a polygon and the same number on every side', () => {
    const square: Row = {
      id: 'p',
      name: 'p',
      curve: { kind: 'polygon', cx: 0, cy: 0, radius: 100, sides: 4, rotation: 0 },
      nails: { mode: 'count', count: 22 },
    };
    const { points, closed } = rowNails(square);
    expect(closed).toBe(true);
    // 22 nails do not divide by four sides: rounded to six per side
    expect(points).toHaveLength(24);
    expect(points[0]).toEqual({ x: 100, y: 0 });
    expect(points[6]).toEqual({ x: 0, y: 100 });
    expect(points[12]).toEqual({ x: -100, y: 0 });
    expect(points[3]?.x).toBeCloseTo(50, 9);
    expect(points[3]?.y).toBeCloseTo(50, 9);
  });
});

describe('layout of all nails', () => {
  it('repeats rows around the origin and merges nails on the same spot', () => {
    const layout = layoutNails({ rows: [segment('a', 100, 0, 11)], repeat: 4, minSpacing: 4 });
    // four spokes share the nail in the middle
    expect(layout.nails).toHaveLength(4 * 11 - 3);
    const row = layout.rows.get('a');
    expect(row?.closed).toBe(false);
    expect(row?.copies).toHaveLength(4);
    const centre = row?.copies[0]?.[0];
    expect(row?.copies.map((copy) => copy[0])).toEqual([centre, centre, centre, centre]);
    const tip = layout.nails[row?.copies[1]?.[10] ?? -1];
    expect(tip).toMatchObject({ x: 0, y: 100 });
    expect(layout.tooClose).toEqual([]);
  });

  it('merges nails of different rows, e.g. where an axis meets the circle', () => {
    const layout = layoutNails({
      rows: [circle('c', 100, 36), segment('a', 100, 0, 11)],
      repeat: 1,
      minSpacing: 4,
    });
    expect(layout.nails).toHaveLength(36 + 11 - 1);
    expect(layout.rows.get('a')?.copies[0]?.[10]).toBe(layout.rows.get('c')?.copies[0]?.[0]);
  });

  it('reports nails that are closer together than allowed, each pair once', () => {
    const tight = layoutNails({ rows: [segment('a', 30, 0, 11)], repeat: 1, minSpacing: 4 });
    expect(tight.tooClose).toHaveLength(10);
    const exact = layoutNails({ rows: [segment('a', 40, 0, 11)], repeat: 1, minSpacing: 4 });
    expect(exact.tooClose).toEqual([]);
    const unchecked = layoutNails({ rows: [segment('a', 30, 0, 11)], repeat: 1, minSpacing: 0 });
    expect(unchecked.tooClose).toEqual([]);
  });
});

describe('thread between two rows', () => {
  // two rows of five nails at a right angle, sharing the nail in the corner
  const rows = [segment('a', 40, 0, 5), segment('b', 0, 40, 5)];

  it('running against each other, wraps a parabola, there and back', () => {
    const art = computeStringArt(design({ rows, threads: [thread([part({ reverse: true })])] }));
    expect(art.issues).toEqual([]);
    expect(art.threads).toHaveLength(1);
    const strung = art.threads[0];
    expect(positions(art, strung?.route ?? [])).toEqual([
      [0, 0],
      [0, 40],
      [0, 30],
      [10, 0],
      [20, 0],
      [0, 20],
      [0, 10],
      [30, 0],
      [40, 0],
      [0, 0],
    ]);
    expect(strung?.joins).toEqual([]);
    expect(strung?.color).toBe('#00aacc');
    // lines 40 + 31.62 + 28.28 + 31.62 + 40, four steps of 10, a turn round ten nails
    const lines = 40 + 2 * Math.hypot(10, 30) + Math.hypot(20, 20) + 40;
    expect(strung?.length).toBeCloseTo(lines + 40 + 10 * Math.PI * 1.5, 9);
  });

  it('running the same way, makes a ladder; lines from a nail to itself are left out', () => {
    const layout = layoutNails({ rows, repeat: 1, minSpacing: 4 });
    const a = layout.rows.get('a');
    const b = layout.rows.get('b');
    if (!a || !b) throw new Error('rows missing');
    const lines = partLines(part(), a, b, 0);
    // nail 0 is the shared corner
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual([a.copies[0]?.[1], b.copies[0]?.[1]]);
  });

  it('can use part of a row, every second nail, and a fixed number of lines', () => {
    const layout = layoutNails({ rows, repeat: 1, minSpacing: 4 });
    const a = layout.rows.get('a');
    const b = layout.rows.get('b');
    if (!a || !b) throw new Error('rows missing');
    const nailsA = a.copies[0] ?? [];
    const nailsB = b.copies[0] ?? [];
    expect(partLines(part({ start: 1, step: 2, b: 1 }), a, b, 0)).toEqual([
      [nailsA[1], nailsB[2]],
      [nailsA[3], nailsB[4]],
    ]);
    expect(partLines(part({ start: 2, count: 2, reverse: true }), a, b, 0)).toEqual([
      [nailsA[2], nailsB[2]],
      [nailsA[3], nailsB[1]],
    ]);
    // a target beyond the end of an open row gives no line
    expect(partLines(part({ a: 2, start: 1 }), a, b, 0)).toEqual([
      [nailsA[1], nailsB[2]],
      [nailsA[2], nailsB[4]],
    ]);
    // a fan: every nail of one row to one nail of the other
    expect(partLines(part({ a: 0, b: 4 }), a, b, 0).map(([, to]) => to)).toEqual(
      Array(5).fill(nailsB[4]),
    );
  });

  it('can be strung in four ways that make the same lines', () => {
    const layout = layoutNails({ rows, repeat: 1, minSpacing: 4 });
    const a = layout.rows.get('a');
    const b = layout.rows.get('b');
    if (!a || !b) throw new Error('rows missing');
    const rule = part({ reverse: true, start: 1, count: 3 });
    const routes = partRoutes(rule, a, b, 0);
    expect(routes).toHaveLength(4);
    expect(new Set(routes.map((route) => route[0])).size).toBe(4);
    const long = (route: number[]) =>
      route
        .slice(1)
        .map((nail, i) => [route[i] as number, nail].sort((x, y) => x - y).join('-'))
        .filter((_, i) => i % 2 === 0)
        .sort();
    const expected = long(routes[0] ?? []);
    for (const route of routes) expect(long(route)).toEqual(expected);
  });
});

describe('thread on one closed row', () => {
  it('as a chain with a fixed offset draws a star and returns to its start', () => {
    const art = computeStringArt(
      design({
        rows: [circle('c', 50, 5)],
        threads: [thread([part({ from: 'c', to: 'c', mode: 'chain', b: 2 })])],
        minSpacing: 0,
      }),
    );
    const nails = art.layout.rows.get('c')?.copies[0] ?? [];
    expect(art.threads[0]?.route).toEqual([0, 2, 4, 1, 3, 0].map((i) => nails[i]));
    expect(art.issues).toEqual([]);
  });

  it('stops after one round when the offset does not reach every nail', () => {
    const art = computeStringArt(
      design({
        rows: [circle('c', 50, 6)],
        threads: [thread([part({ from: 'c', to: 'c', mode: 'chain', b: 2 })])],
        minSpacing: 0,
      }),
    );
    const nails = art.layout.rows.get('c')?.copies[0] ?? [];
    expect(art.threads[0]?.route).toEqual([0, 2, 4, 0].map((i) => nails[i]));
  });

  it('with a multiple draws the times table pattern', () => {
    const layout = layoutNails({ rows: [circle('c', 50, 10)], repeat: 1, minSpacing: 0 });
    const c = layout.rows.get('c');
    if (!c) throw new Error('row missing');
    const nails = c.copies[0] ?? [];
    const lines = partLines(part({ from: 'c', to: 'c', a: 2 }), c, c, 0);
    // nail 0 would go to itself
    expect(lines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [nails[i], nails[(2 * i) % 10]]));
  });
});

describe('repetition', () => {
  // a spoke from the centre; the thread goes to the next spoke
  const spoke = segment('a', 40, 0, 5);
  const toNext = part({ from: 'a', to: 'a', toCopy: 1, reverse: true });

  it('strings all repetitions with one thread when each part ends where the next begins', () => {
    const art = computeStringArt(design({ rows: [spoke], threads: [thread([toNext])], repeat: 4 }));
    expect(art.issues).toEqual([]);
    expect(art.threads).toHaveLength(1);
    const strung = art.threads[0];
    expect(strung?.joins).toEqual([]);
    // four parts of ten nails, joined on the shared nail in the centre
    expect(strung?.route).toHaveLength(4 * 9 + 1);
    const route = positions(art, strung?.route ?? []);
    expect(route[0]).toEqual([0, 0]);
    expect(route[1]).toEqual([0, 40]);
    expect(route[9]).toEqual([0, 0]);
    expect(route[10]).toEqual([-40, 0]);
    expect(route[36]).toEqual([0, 0]);
  });

  it('gives each colour its own thread, taking turns from one repetition to the next', () => {
    const art = computeStringArt(
      design({
        rows: [spoke],
        threads: [thread([toNext], ['#00aacc', '#ff8899'])],
        repeat: 4,
      }),
    );
    expect(art.threads.map((t) => t.color)).toEqual(['#00aacc', '#ff8899']);
    expect(art.threads.map((t) => t.route.length)).toEqual([19, 19]);
    expect(positions(art, art.threads[1]?.route ?? [])[1]).toEqual([-40, 0]);
  });

  it('chooses the direction of each part so that the thread can go on without a gap', () => {
    // two parts that both start at the tip of the spoke when strung as written
    const rows = [spoke, segment('b', 0, 40, 5)];
    const out = part({ start: 1, reverse: true, b: -1 });
    const art = computeStringArt(design({ rows, threads: [thread([out, out])] }));
    const strung = art.threads[0];
    // the second part is strung backwards, from where the first one ended
    expect(strung?.joins).toEqual([]);
    const route = strung?.route ?? [];
    expect(route[route.length - 1]).toBe(route[0]);
  });

  it('reports where the thread has to cross from one part to the next', () => {
    const rows = [
      segment('a', 40, 0, 5),
      {
        ...segment('b', 0, 0, 5),
        curve: {
          kind: 'segment' as const,
          x1: 100,
          y1: 0,
          x2: 100,
          y2: 40,
        },
      },
      {
        ...segment('c', 0, 0, 5),
        curve: { kind: 'segment' as const, x1: 200, y1: 0, x2: 200, y2: 40 },
      },
    ];
    const art = computeStringArt(
      design({
        rows,
        threads: [thread([part({ from: 'a', to: 'a', a: 0, b: 4 }), part({ from: 'b', to: 'c' })])],
      }),
    );
    const strung = art.threads[0];
    expect(strung?.joins).toHaveLength(1);
    const join = strung?.joins[0];
    expect(join?.length).toBeGreaterThan(50);
    const route = strung?.route ?? [];
    const from = art.layout.nails[route[join?.index ?? 0] ?? -1];
    const to = art.layout.nails[route[(join?.index ?? 0) + 1] ?? -1];
    if (!from || !to) throw new Error('join missing');
    expect(distance(from, to)).toBeCloseTo(join?.length ?? 0, 9);
  });
});

describe('direction of the parts', () => {
  it('is chosen over the whole thread, not part by part', () => {
    // Six nails per spoke: strung as written, the first part would end at
    // a tip where no other part begins. Looking ahead avoids every crossing.
    const art = computeStringArt(
      design({
        rows: [segment('a', 50, 0, 6)],
        threads: [thread([part({ from: 'a', to: 'a', toCopy: 1, reverse: true })])],
        repeat: 4,
      }),
    );
    expect(art.threads[0]?.joins).toEqual([]);
    expect(art.threads[0]?.route).toHaveLength(4 * 11 + 1);
  });
});

describe('templates', () => {
  it('are valid designs without problems and without crossings between parts', () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([
      'circle-axes',
      'parabola-star',
      'spokes-tangents',
      'twisted-polygons',
      'cardioid',
    ]);
    for (const template of TEMPLATES) {
      const params = template.create();
      expect(parseStringArtParams(params), template.id).toEqual(params);
      const art = computeStringArt(params);
      expect(art.issues, template.id).toEqual([]);
      expect(art.threads.length, template.id).toBeGreaterThan(0);
      // only the spokes cannot do without: the thread has to get from one spoke to the next
      if (template.id === 'spokes-tangents') continue;
      for (const strung of art.threads) expect(strung.joins, template.id).toEqual([]);
    }
  });

  it('circle with axes: a circle of 100 nails, two axes, and the centre', () => {
    const params = TEMPLATES[0]?.create();
    if (!params) throw new Error('template missing');
    const art = computeStringArt(params);
    // per quarter 25 new nails on the arc and 24 on the half axis, plus the centre
    expect(art.layout.nails).toHaveLength(4 * 25 + 4 * 24 + 1);
    expect(art.threads.map((t) => t.name)).toEqual(['Star', 'Rim']);
  });
});

describe('template parameters', () => {
  const star = TEMPLATES[1]?.create();
  if (!star || star.template?.id !== 'parabola-star') throw new Error('template missing');
  const template = star.template;

  it('star: triangles of the given height that join on an inner circle', () => {
    const geometry = starGeometry({ ...template, points: 8, outer: 200, height: 100 });
    expect(geometry.inner).toBeCloseTo(100 / Math.cos(Math.PI / 8), 9);
    const halfBase = geometry.inner * Math.sin(Math.PI / 8);
    expect(geometry.leg).toBeCloseTo(Math.hypot(halfBase, 100), 9);
    expect(geometry.opening).toBeCloseTo((2 * Math.atan(halfBase / 100) * 180) / Math.PI, 9);

    const art = computeStringArt(applyTemplate(star, { ...template, points: 6, height: 80 }));
    const radii = art.layout.nails.map((nail) => Math.hypot(nail.x, nail.y));
    expect(Math.max(...radii)).toBeCloseTo(200, 2);
    // the corners are the nails nearest to the centre, on the inner circle
    expect(Math.min(...radii)).toBeCloseTo(120 / Math.cos(Math.PI / 6), 2);
    // 6 tips, 6 corners and 17 more nails on each of the 12 legs
    expect(art.layout.nails).toHaveLength(12 + 12 * 17);
    expect(art.issues).toEqual([]);
    for (const strung of art.threads) expect(strung.joins).toEqual([]);
  });

  it('star with the full height: spokes from the centre', () => {
    const geometry = starGeometry({ ...template, height: template.outer });
    expect(geometry.inner).toBeCloseTo(0, 9);
    expect(geometry.opening).toBeCloseTo(0, 9);
  });

  it('a change keeps names, colours, visibility and the other settings', () => {
    const changed: StringArtParams = {
      ...star,
      background: '#ffffff',
      threads: star.threads.map((thread, index) =>
        index === 0 ? { ...thread, name: 'Mine', colors: ['#123456'], visible: false } : thread,
      ),
    };
    const next = applyTemplate(changed, { ...template, nails: 15 });
    expect(next.template).toEqual({ ...template, nails: 15 });
    expect(next.background).toBe('#ffffff');
    expect(next.threads[0]).toMatchObject({ name: 'Mine', colors: ['#123456'], visible: false });
    expect(next.rows.map((row) => row.nails)).toEqual([
      { mode: 'count', count: 15 },
      { mode: 'count', count: 15 },
    ]);
    // another template starts with its own threads
    const circle = TEMPLATES[0]?.defaults;
    if (!circle) throw new Error('template missing');
    expect(applyTemplate(changed, circle).threads.map((thread) => thread.name)).toEqual([
      'Star',
      'Rim',
    ]);
  });

  it('files without a template are designs of their own', () => {
    const old = Object.fromEntries(Object.entries(star).filter(([key]) => key !== 'template'));
    expect(parseStringArtParams(old)?.template).toBeNull();
    expect(parseStringArtParams({ ...star, template: { ...template, height: -1 } })).toBeNull();
  });

  it('spokes and tangents: six spokes, six rows that touch a circle, two colours', () => {
    const params = TEMPLATES.find((template) => template.id === 'spokes-tangents')?.create();
    if (params?.template?.id !== 'spokes-tangents') throw new Error('template missing');
    const { inner, outer, radius, length } = params.template;
    const art = computeStringArt(params);
    expect(art.issues).toEqual([]);
    expect(art.layout.nails).toHaveLength(12 * 21);
    const radii = art.layout.nails.map((nail) => Math.hypot(nail.x, nail.y));
    expect(Math.min(...radii)).toBeCloseTo(inner, 2);
    // the ends of the tangent rows are the nails furthest from the centre
    expect(Math.max(...radii)).toBeCloseTo(Math.hypot(radius, length / 2), 2);
    // the middle nail of the first tangent row touches the circle halfway between two spokes
    const touch = { x: radius * Math.cos(Math.PI / 6), y: radius * Math.sin(Math.PI / 6) };
    expect(
      art.layout.nails.some((nail) => Math.hypot(nail.x - touch.x, nail.y - touch.y) < 0.01),
    ).toBe(true);
    expect(radii.filter((r) => Math.abs(r - outer) < 0.01)).toHaveLength(6);
    // one thread per colour, three spokes each; it changes spokes twice, along the rim
    expect(art.threads.map((strung) => strung.name)).toEqual(['Fans', 'Fans', 'Star', 'Star']);
    // rose is strung first and lies below turquoise
    expect(art.threads.map((strung) => strung.color)).toEqual([
      '#f29c9c',
      '#35c4c0',
      '#f29c9c',
      '#35c4c0',
    ]);
    const lines = (strung: (typeof art.threads)[number]) => {
      const counts = new Map<string, number>();
      for (let i = 1; i < strung.route.length; i++) {
        const [a, b] = [strung.route[i - 1] as number, strung.route[i] as number].sort(
          (x, y) => x - y,
        );
        counts.set(`${a}-${b}`, (counts.get(`${a}-${b}`) ?? 0) + 1);
      }
      return counts;
    };
    for (const strung of art.threads) {
      // there and back: the thread ends where it began, and every step is
      // made twice (steps along a row that two parts share: four times)
      expect(strung.route[0]).toBe(strung.route[strung.route.length - 1]);
      expect([...lines(strung).values()].every((times) => times % 2 === 0)).toBe(true);
    }
    // the fans of the three spokes of one colour share no nail: the thread
    // changes spokes twice, along the rim, there and back
    for (const strung of art.threads.slice(0, 2)) {
      expect(strung.joins).toHaveLength(4);
      for (const join of strung.joins) expect(join.length).toBeLessThan(80);
    }
    // the star hangs together and needs no such crossing
    for (const strung of art.threads.slice(2)) expect(strung.joins).toEqual([]);
    // between two spokes: 11 lines from the one, 10 from the other, none twice
    const long = art.threads.slice(2).flatMap((strung) =>
      [...lines(strung).keys()].filter((key) => {
        const [a, b] = key.split('-').map(Number) as [number, number];
        const p = art.layout.nails[a];
        const q = art.layout.nails[b];
        // steps along a spoke are 6.5 mm, the lines are much longer
        return p && q ? Math.hypot(p.x - q.x, p.y - q.y) > 20 : false;
      }),
    );
    expect(long).toHaveLength(6 * 21);
    expect(new Set(long).size).toBe(6 * 21);
    for (const strung of art.threads.slice(2)) {
      for (const [key, times] of lines(strung)) if (long.includes(key)) expect(times).toBe(2);
    }
  });

  it('spokes and tangents with one thread per colour: the same lines, no crossings', () => {
    const params = TEMPLATES.find((template) => template.id === 'spokes-tangents')?.create();
    if (params?.template?.id !== 'spokes-tangents') throw new Error('template missing');
    const four = computeStringArt(params);
    const two = computeStringArt(applyTemplate(params, { ...params.template, joined: true }));
    expect(two.issues).toEqual([]);
    expect(two.threads.map((strung) => strung.name)).toEqual(['Fans and star', 'Fans and star']);
    expect(two.threads.map((strung) => strung.color)).toEqual(['#f29c9c', '#35c4c0']);
    const steps = (threads: typeof two.threads, color: string) => {
      const set = new Set<string>();
      for (const strung of threads.filter((candidate) => candidate.color === color)) {
        expect(strung.route[0]).toBe(strung.route[strung.route.length - 1]);
        const crossing = new Set(strung.joins.map((join) => join.index));
        for (let i = 1; i < strung.route.length; i++) {
          if (crossing.has(i - 1)) continue;
          const pair = [strung.route[i - 1] as number, strung.route[i] as number];
          set.add(pair.sort((x, y) => x - y).join('-'));
        }
      }
      return set;
    };
    for (const strung of two.threads) expect(strung.joins).toEqual([]);
    for (const color of ['#f29c9c', '#35c4c0']) {
      expect(steps(two.threads, color)).toEqual(steps(four.threads, color));
    }
    // shorter by the crossings that are no longer needed
    const total = (threads: typeof two.threads) =>
      threads.reduce((sum, strung) => sum + strung.length, 0);
    expect(total(two.threads)).toBeLessThan(total(four.threads));
  });

  it('twisted polygons: the corners stand on spirals that shrink evenly', () => {
    const entry = TEMPLATES.find((candidate) => candidate.id === 'twisted-polygons');
    if (!entry || entry.defaults.id !== 'twisted-polygons') throw new Error('template missing');
    const params = entry.create();
    // brought along by the template: nails stand only 3 mm apart inside
    expect(params.minSpacing).toBe(3);
    expect(params.nailDiameter).toBe(1.2);

    const geometry = twistGeometry(entry.defaults);
    expect(geometry.outerRadius * Math.sqrt(3)).toBeCloseTo(270, 9);
    expect(geometry.innerRadius * Math.sqrt(3)).toBeCloseTo(14, 9);
    expect(geometry.outerGap).toBeCloseTo(12, 0);
    expect(geometry.innerGap).toBeCloseTo(3, 0);

    const art = computeStringArt(params);
    expect(art.issues).toEqual([]);
    expect(art.layout.nails).toHaveLength(150);
    const spiral = art.layout.rows.get('spiral')?.copies ?? [];
    const at = (copy: number, index: number) =>
      art.layout.nails[(spiral[copy] as number[])[index] as number] as { x: number; y: number };
    // The first polygon stands on a corner at the top; each one is equilateral.
    expect(at(0, 0).x).toBeCloseTo(0, 9);
    expect(at(0, 0).y).toBeCloseTo(270 / Math.sqrt(3), 2);
    for (const index of [0, 25, 49]) {
      const side = distance(at(0, index), at(1, index));
      expect(distance(at(1, index), at(2, index))).toBeCloseTo(side, 2);
      expect(side).toBeCloseTo(270 - (256 * index) / 49, 2);
    }
    // Clockwise from the outside in: the second nail lies right of the first.
    expect(at(0, 1).x).toBeGreaterThan(0);
    // the innermost polygon is turned by 210 degrees
    const angle = (point: { x: number; y: number }) =>
      (Math.atan2(point.y, point.x) * 180) / Math.PI;
    expect(angle(at(0, 49))).toBeCloseTo(90 - 210, 6);

    // From the innermost nail outwards, round the spirals: A50 B50 C50 A49 …
    const thread = art.threads[0] as (typeof art.threads)[number];
    const expected: number[] = [];
    for (let index = 49; index >= 0; index--) {
      for (let copy = 0; copy < 3; copy++)
        expected.push((spiral[copy] as number[])[index] as number);
    }
    expect(thread.route).toEqual(expected);
    expect(thread.joins).toEqual([]);
    // the round goes counter-clockwise, the way the spirals open outwards
    const turnOf = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x * b.y - a.y * b.x;
    expect(turnOf(at(0, 10), at(1, 10))).toBeGreaterThan(0);

    const squares = computeStringArt(
      applyTemplate(params, { ...entry.defaults, corners: 4, clockwise: false }),
    );
    expect(squares.layout.nails).toHaveLength(200);
    // turned the other way, the round goes the other way, too
    const squareSpiral = squares.layout.rows.get('spiral')?.copies ?? [];
    expect(squares.threads[0]?.route.slice(0, 4)).toEqual(
      [0, 3, 2, 1].map((copy) => (squareSpiral[copy] as number[])[49]),
    );
  });

  it('a template brings its nail settings only when it is chosen', () => {
    const twisted = TEMPLATES.find((candidate) => candidate.id === 'twisted-polygons');
    const circle = TEMPLATES[0];
    if (!twisted || !circle || twisted.defaults.id !== 'twisted-polygons') {
      throw new Error('template missing');
    }
    const chosen = applyTemplate(circle.create(), twisted.defaults);
    expect([chosen.minSpacing, chosen.nailDiameter]).toEqual([3, 1.2]);
    // changed by the user, kept while the template's parameters change
    const mine = { ...chosen, minSpacing: 2.5 };
    expect(applyTemplate(mine, { ...twisted.defaults, nails: 40 }).minSpacing).toBe(2.5);
    // a template without such settings leaves them as they are
    expect(applyTemplate(mine, circle.defaults).minSpacing).toBe(2.5);
  });

  it('cardioid: the factor sets the rule', () => {
    const params = TEMPLATES.find((template) => template.id === 'cardioid')?.create();
    if (params?.template?.id !== 'cardioid') throw new Error('template missing');
    const next = applyTemplate(params, { ...params.template, factor: 3 });
    expect(next.threads[0]?.parts[0]?.a).toBe(3);
  });
});

describe('geometry and preview', () => {
  it('give the nails as points to drill and one line per thread', () => {
    const params = design({
      rows: [segment('a', 40, 0, 5), segment('b', 0, 40, 5)],
      threads: [thread([part({ reverse: true })]), { ...thread([part()]), visible: false }],
      background: '#101010',
    });
    const geometry = generateStringArt(params);
    expect(geometry.polylines).toEqual([]);
    expect(geometry.points).toHaveLength(9);
    expect(geometry.points[0]).toEqual({ x: 0, y: 0 });
    const preview = previewStringArt(params);
    expect(preview.background).toBe('#101010');
    expect(preview.strokes).toHaveLength(1);
    expect(preview.strokes[0]?.color).toBe('#00aacc');
    expect(preview.strokes[0]?.points).toHaveLength(10);
    expect(preview.strokes[0]?.points[1]).toEqual({ x: 0, y: 40 });
  });
});

describe('rounds', () => {
  it('visit the same nail in every repetition, then the next one', () => {
    const params = design({
      rows: [segment('a', 30, 0, 4)],
      repeat: 3,
      threads: [thread([part({ from: 'a', to: 'a', mode: 'rounds', toCopy: 1, start: 1 })])],
    });
    const art = computeStringArt(params);
    expect(art.issues).toEqual([]);
    const copies = art.layout.rows.get('a')?.copies ?? [];
    const nail = (copy: number, index: number) => (copies[copy] as number[])[index];
    // nail 0 is the shared centre and is left out by `start`
    expect(art.threads[0]?.route).toEqual([
      nail(0, 1),
      nail(1, 1),
      nail(2, 1),
      nail(0, 2),
      nail(1, 2),
      nail(2, 2),
      nail(0, 3),
      nail(1, 3),
      nail(2, 3),
    ]);
    expect(art.threads[0]?.joins).toEqual([]);
  });

  it('need one and the same row at both ends', () => {
    const art = computeStringArt(
      design({
        rows: [segment('a', 30, 0, 4), segment('b', 0, 30, 4)],
        threads: [thread([part({ mode: 'rounds' })])],
      }),
    );
    expect(art.issues).toEqual([
      'Thread "Thread", part 1: a round needs one and the same row at both ends.',
    ]);
  });
});

describe('spiral rows', () => {
  const spiral = (nails: Row['nails'], turn: number): Row => ({
    id: 's',
    name: 's',
    curve: { kind: 'spiral', cx: 10, cy: 0, r1: 100, r2: 0, start: 0, turn },
    nails,
  });

  it('by number: equal steps of the angle, the radius shrinking evenly', () => {
    const { points, closed } = rowNails(spiral({ mode: 'count', count: 5 }, 360));
    expect(closed).toBe(false);
    const expected = [
      [110, 0],
      [10, 75],
      [-40, 0],
      [10, -25],
      [10, 0],
    ];
    points.forEach((point, index) => {
      expect(point.x).toBeCloseTo((expected[index] as number[])[0] as number, 9);
      expect(point.y).toBeCloseTo((expected[index] as number[])[1] as number, 9);
    });
  });

  it('by distance: the same distance along the curve', () => {
    const { points } = rowNails(spiral({ mode: 'distance', distance: 10 }, 0));
    expect(points).toHaveLength(11);
    points.forEach((point, index) => expect(point.x).toBeCloseTo(110 - 10 * index, 6));
    const curled = rowNails(spiral({ mode: 'distance', distance: 10 }, 720)).points;
    const gaps = curled.slice(1).map((point, index) => distance(curled[index] as Vec2, point));
    // Chords of a curve are a little shorter than the distance along it,
    // most of all where the spiral is tight.
    // The distance is adjusted so that the row is filled evenly.
    for (const gap of gaps) expect(gap).toBeLessThan(10.5);
    expect(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length).toBeGreaterThan(9.5);
  });
});

describe('instructions', () => {
  const template = (name: string) =>
    (TEMPLATES.find((entry) => entry.name === name) as (typeof TEMPLATES)[number]).create();

  it('letters go on after Z', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(rowLetters)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('every repetition of a row has its own letters, every nail one name', () => {
    const params = template('Spokes and tangents');
    const art = computeStringArt(params);
    const { rows, names } = nameNails(art.layout, params);
    expect(rows.map((row) => row.letters).join('')).toBe('ABCDEFGHIJKL');
    expect(rows.slice(0, 3).map((row) => `${row.rowName} ${row.copy}`)).toEqual([
      'Spoke 1',
      'Tangent 1',
      'Spoke 2',
    ]);
    expect(names).toHaveLength(252);
    expect(new Set(names).size).toBe(252);
    expect(names[(art.layout.rows.get('spoke')?.copies[0] as number[])[0] as number]).toBe('A1');
    expect(names[(art.layout.rows.get('tangent')?.copies[5] as number[])[20] as number]).toBe(
      'L21',
    );
  });

  it('a nail shared by two rows is named after the first of them', () => {
    const params = template('Parabola star');
    const art = computeStringArt(params);
    const { rows, names } = nameNails(art.layout, params);
    expect(new Set(names).size).toBe(art.layout.nails.length);
    expect(names.every((name) => name !== '')).toBe(true);
    // The corner ends row A and begins row B.
    const corner = (rows[1] as (typeof rows)[number]).nails[0] as number;
    expect(names[corner]).toBe('A19');
  });

  it('list the way of every thread by the names of the nails', () => {
    const params = template('Circle with axes');
    const art = computeStringArt(params);
    const { names } = nameNails(art.layout, params);
    const html = instructionsHtml(params);
    expect(html).toContain('197 nails');
    for (const thread of art.threads) {
      expect(html).toContain(`${(thread.length / 1000).toFixed(1)} m of thread`);
      const listed = [
        ...(html
          .split('<section class="thread">')
          .find((section) => section.includes(`</span>${thread.name}</h2>`))
          ?.matchAll(/(?<=[> ])([A-Z]+\d+)(?=[ <])/g) ?? []),
      ].map((match) => match[1]);
      // The first and the last nail are also named in the sentence above the list.
      expect(listed.slice(2)).toEqual(thread.route.map((nail) => names[nail]));
    }
  });

  it('mark crossings and escape names', () => {
    const params = template('Spokes and tangents');
    const first = params.threads[0] as Thread;
    const html = instructionsHtml({
      ...params,
      threads: [{ ...first, name: 'Fans <1>' }, ...params.threads.slice(1)],
    });
    expect(html).toContain('Fans &lt;1&gt;');
    expect(html).not.toContain('Fans <1>');
    expect(html).toContain('4 crossings (⇢) of up to 74 mm');
    expect(html.match(/⇢<\/b>/g)).toHaveLength(8);
  });

  it('a design without nails or threads still gives a page', () => {
    expect(instructionsHtml(design())).toContain('no nails');
    expect(instructionsHtml(design({ rows: [segment('a', 100, 0, 5)] }))).toContain(
      'no visible threads',
    );
  });
});

describe('problems in a design', () => {
  it('are reported as messages', () => {
    const rows = [segment('a', 30, 0, 11), circle('c', 50, 20)];
    const art = computeStringArt(
      design({
        rows,
        threads: [
          thread([
            part({ from: 'a', to: 'nope' }),
            part({ from: 'a', to: 'c', mode: 'chain' }),
            part({ from: 'a', to: 'a', mode: 'chain' }),
            part({ from: 'a', to: 'a' }),
          ]),
        ],
      }),
    );
    expect(art.issues).toEqual([
      'Thread "Thread", part 1: the row it uses does not exist.',
      'Thread "Thread", part 2: a chain needs one and the same row at both ends.',
      'Thread "Thread", part 3: a chain needs a closed row.',
      'Thread "Thread", part 4: the rule gives no lines.',
      '10 pairs of nails are closer together than 4 mm.',
    ]);
  });

  it('leave out hidden threads', () => {
    const rows = [segment('a', 40, 0, 5), segment('b', 0, 40, 5)];
    const hidden = { ...thread([part()]), visible: false };
    expect(computeStringArt(design({ rows, threads: [hidden] })).threads).toEqual([]);
  });
});

describe('parameters', () => {
  it('are accepted when complete and rejected otherwise', () => {
    const params = design({
      rows: [segment('a', 40, 0, 5)],
      threads: [thread([part({ from: 'a', to: 'a', toCopy: 1 })])],
      repeat: 6,
    });
    expect(parseStringArtParams(params)).toEqual(params);
    expect(parseStringArtParams({ ...params, repeat: 0 })).toBeNull();
    expect(parseStringArtParams({ ...params, background: 'black' })).toBeNull();
    expect(parseStringArtParams({ ...params, extra: 1 })).toBeNull();
    expect(
      parseStringArtParams({ ...params, threads: [{ ...thread([]), colors: [] }] }),
    ).toBeNull();
    expect(parseStringArtParams(null)).toBeNull();
  });
});
