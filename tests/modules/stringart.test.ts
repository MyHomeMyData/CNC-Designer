import { describe, expect, it } from 'vitest';
import { distance } from '../../src/core/geometry/index.ts';
import {
  parseStringArtParams,
  type Row,
  type StringArtParams,
  type Thread,
  type ThreadPart,
} from '../../src/modules/stringart/model.ts';
import { cosDeg, layoutNails, rowNails, sinDeg } from '../../src/modules/stringart/nails.ts';
import { generateStringArt, previewStringArt } from '../../src/modules/stringart/compute.ts';
import { TEMPLATES } from '../../src/modules/stringart/templates.ts';
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
  parts,
});

const design = (changes: Partial<StringArtParams> = {}): StringArtParams => ({
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
      'cardioid',
    ]);
    for (const template of TEMPLATES) {
      const params = template.create();
      expect(parseStringArtParams(params), template.id).toEqual(params);
      const art = computeStringArt(params);
      expect(art.issues, template.id).toEqual([]);
      expect(art.threads.length, template.id).toBeGreaterThan(0);
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
