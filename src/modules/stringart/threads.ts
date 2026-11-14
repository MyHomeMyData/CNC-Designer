import { distance } from '../../core/geometry/index.ts';
import type { StringArtParams, Thread, ThreadPart } from './model.ts';
import { layoutNails, type Nail, type NailLayout, type RowLayout } from './nails.ts';

/** A line of thread between two nails. */
export type Line = readonly [from: number, to: number];

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Nail number `index` of a row, or `null` if an open row has no such nail. */
function nailOf(nails: readonly number[], closed: boolean, index: number): number | null {
  if (closed) return nails[modulo(index, nails.length)] ?? null;
  return nails[index] ?? null;
}

/**
 * The lines one part of a thread makes in one repetition, in the order of
 * the rule. Lines that would need a nail an open row does not have, and
 * lines from a nail to itself, are left out.
 */
export function partLines(part: ThreadPart, from: RowLayout, to: RowLayout, copy: number): Line[] {
  const copies = from.copies.length;
  const p = from.copies[copy] ?? [];
  const q = to.copies[(copy + part.toCopy) % copies] ?? [];
  if (p.length === 0 || q.length === 0) return [];

  // Without a given number, a closed row is gone round once.
  const limit =
    part.count ?? (from.closed ? Math.ceil(p.length / part.step) : Number.POSITIVE_INFINITY);
  const lines: Line[] = [];
  for (let k = 0; k < limit; k++) {
    const i = part.start + k * part.step;
    if (!from.closed && i >= p.length) break;
    const target = part.a * i + part.b;
    const start = nailOf(p, from.closed, i);
    const end = nailOf(q, to.closed, part.reverse ? q.length - 1 - target : target);
    if (start !== null && end !== null && start !== end) lines.push([start, end]);
  }
  return lines;
}

/** Leave out a nail that directly follows itself. */
function withoutRepeats(nails: readonly number[]): number[] {
  return nails.filter((nail, index) => index === 0 || nail !== nails[index - 1]);
}

/**
 * The ways one part can be strung with a single thread; the lines are the
 * same in each. There and back between two rows, the thread can begin at
 * either end of the rule and on either row.
 */
export function partRoutes(
  part: ThreadPart,
  from: RowLayout,
  to: RowLayout,
  copy: number,
): number[][] {
  if (part.mode === 'chain') {
    const route = chainRoute(part, from, copy);
    return route.length > 1 ? [route, [...route].reverse()] : [];
  }
  const lines = partLines(part, from, to, copy);
  if (lines.length === 0) return [];
  const routes: number[][] = [];
  for (const ordered of [lines, [...lines].reverse()]) {
    for (const startOnFrom of [true, false]) {
      const route: number[] = [];
      ordered.forEach(([a, b], index) => {
        // Every second line runs the other way, so the thread only has to
        // step to the neighbouring nail in between.
        const forward = (index % 2 === 0) === startOnFrom;
        route.push(forward ? a : b, forward ? b : a);
      });
      routes.push(withoutRepeats(route));
    }
  }
  return routes;
}

/** On one closed row: each line starts where the last one ended. */
function chainRoute(part: ThreadPart, row: RowLayout, copy: number): number[] {
  const nails = row.copies[copy] ?? [];
  if (!row.closed || nails.length === 0) return [];
  const count = nails.length;
  const first = modulo(part.start, count);
  const limit = part.count ?? count;
  const route = [nails[first] as number];
  let index = first;
  for (let k = 0; k < limit; k++) {
    const target = part.a * index + part.b;
    index = modulo(part.reverse ? count - 1 - target : target, count);
    route.push(nails[index] as number);
    // Back at the beginning: the figure is complete.
    if (part.count === null && index === first) break;
  }
  return withoutRepeats(route);
}

/** One thread as it is strung: a single piece from the first knot to the last. */
export interface StrungThread {
  readonly threadId: string;
  readonly name: string;
  readonly color: string;
  /** The nails in the order the thread goes round them. */
  readonly route: readonly number[];
  /**
   * Places where the thread has to cross from the end of one part to the
   * start of the next: `route[index]` to `route[index + 1]`.
   */
  readonly joins: readonly { readonly index: number; readonly length: number }[];
  /** Length of the thread in mm, including one turn round every nail. */
  readonly length: number;
}

export interface StringArt {
  readonly layout: NailLayout;
  readonly threads: readonly StrungThread[];
  /** Problems in the design, as messages for the user. */
  readonly issues: readonly string[];
}

function routeLength(route: readonly number[], nails: readonly Nail[], nailDiameter: number) {
  let length = route.length * Math.PI * nailDiameter;
  for (let i = 1; i < route.length; i++) {
    length += distance(nails[route[i - 1] as number] as Nail, nails[route[i] as number] as Nail);
  }
  return length;
}

/**
 * String one colour of a thread: its parts, one repetition after the
 * other, as a single piece. Each part can be strung in several directions;
 * the combination with the shortest crossings between parts is chosen.
 */
function stringThread(
  thread: Thread,
  colorIndex: number,
  layout: NailLayout,
  repeat: number,
  nailDiameter: number,
): StrungThread | null {
  const { nails, rows } = layout;
  // The possible routes of each part, in the order the parts are strung.
  const pieces: number[][][] = [];
  for (let copy = colorIndex; copy < repeat; copy += thread.colors.length) {
    for (const part of thread.parts) {
      const from = rows.get(part.from);
      const to = rows.get(part.to);
      if (!from || !to) continue;
      const routes = partRoutes(part, from, to, copy);
      if (routes.length > 0) pieces.push(routes);
    }
  }
  if (pieces.length === 0) return null;
  if (thread.double) {
    return stringDouble(
      thread,
      colorIndex,
      pieces.map((routes) => routes[0] as number[]),
      nails,
      nailDiameter,
    );
  }

  const gap = (before: number[], after: number[]) =>
    distance(nails[before[before.length - 1] as number] as Nail, nails[after[0] as number] as Nail);

  // Shortest total crossing length up to each route of each part, and the
  // route of the part before that it is reached from.
  const cost: number[][] = [];
  const cameFrom: number[][] = [];
  pieces.forEach((routes, piece) => {
    const previous = pieces[piece - 1];
    cost.push([]);
    cameFrom.push([]);
    routes.forEach((route, variant) => {
      let best = 0;
      let bestFrom = -1;
      if (previous) {
        best = Number.POSITIVE_INFINITY;
        previous.forEach((before, index) => {
          const total = ((cost[piece - 1] as number[])[index] as number) + gap(before, route);
          // On a tie the earlier route wins: parts are strung as written where possible.
          if (total < best - 1e-9) {
            best = total;
            bestFrom = index;
          }
        });
      }
      (cost[piece] as number[])[variant] = best;
      (cameFrom[piece] as number[])[variant] = bestFrom;
    });
  });

  const last = cost[cost.length - 1] as number[];
  let variant = last.reduce(
    (best, value, index) => (value < (last[best] as number) - 1e-9 ? index : best),
    0,
  );
  const chosen: number[][] = [];
  for (let piece = pieces.length - 1; piece >= 0; piece--) {
    chosen.unshift((pieces[piece] as number[][])[variant] as number[]);
    variant = (cameFrom[piece] as number[])[variant] as number;
  }

  const route: number[] = [];
  const joins: { index: number; length: number }[] = [];
  for (const next of chosen) {
    const end = route[route.length - 1];
    if (end === undefined) {
      route.push(...next);
    } else if (next[0] === end) {
      route.push(...next.slice(1));
    } else {
      joins.push({ index: route.length - 1, length: gap(route, next) });
      route.push(...next);
    }
  }
  if (route.length < 2) return null;
  return {
    threadId: thread.id,
    name: thread.name,
    color: thread.colors[colorIndex] as string,
    route,
    joins,
    length: routeLength(route, nails, nailDiameter),
  };
}

/**
 * String one colour of a thread with every part there and back again.
 * Each part then is a round trip that can begin at any of its nails, so a
 * part is hung into the thread at the first nail they share: the thread
 * arrives there, makes the round trip and carries on. Parts that share no
 * nail are reached over the shortest way, there and back as well. The
 * whole thread ends on the nail it began at.
 */
function stringDouble(
  thread: Thread,
  colorIndex: number,
  parts: readonly number[][],
  nails: readonly Nail[],
  nailDiameter: number,
): StrungThread | null {
  const roundTrip = (route: readonly number[]) => [...route, ...[...route].reverse().slice(1)];
  /** A round trip turned so that it begins and ends at its nail number `at`. */
  const beginningAt = (trip: readonly number[], at: number) => [
    ...trip.slice(at, -1),
    ...trip.slice(0, at),
    trip[at] as number,
  ];
  const span = (a: number, b: number) => distance(nails[a] as Nail, nails[b] as Nail);

  const waiting = parts.filter((route) => route.length > 1).map(roundTrip);
  const route = waiting.shift();
  if (!route) return null;
  const bridges = new Set<string>();
  while (waiting.length > 0) {
    const reached = new Set(route);
    const shared = waiting.findIndex((trip) => trip.some((nail) => reached.has(nail)));
    if (shared >= 0) {
      const [trip] = waiting.splice(shared, 1) as [number[]];
      const index = route.findIndex((nail) => trip.includes(nail));
      route.splice(index, 1, ...beginningAt(trip, trip.indexOf(route[index] as number)));
      continue;
    }
    // Nothing shares a nail with the thread so far: take the nearest part.
    let best = { trip: 0, index: 0, at: 0, length: Number.POSITIVE_INFINITY };
    waiting.forEach((trip, tripIndex) => {
      route.forEach((nail, index) => {
        trip.forEach((other, at) => {
          const length = span(nail, other);
          if (length < best.length - 1e-9) best = { trip: tripIndex, index, at, length };
        });
      });
    });
    const [trip] = waiting.splice(best.trip, 1) as [number[]];
    const here = route[best.index] as number;
    bridges.add(`${here}-${trip[best.at] as number}`);
    route.splice(best.index + 1, 0, ...beginningAt(trip, best.at), here);
  }

  const joins: { index: number; length: number }[] = [];
  for (let index = 0; index + 1 < route.length; index++) {
    const a = route[index] as number;
    const b = route[index + 1] as number;
    if (bridges.has(`${a}-${b}`) || bridges.has(`${b}-${a}`)) {
      joins.push({ index, length: span(a, b) });
    }
  }
  return {
    threadId: thread.id,
    name: thread.name,
    color: thread.colors[colorIndex] as string,
    route,
    joins,
    length: routeLength(route, nails, nailDiameter),
  };
}

/** Work out the whole design: where the nails stand and how each thread runs. */
export function computeStringArt(params: StringArtParams): StringArt {
  const layout = layoutNails(params);
  const issues: string[] = [];
  const threads: StrungThread[] = [];

  for (const thread of params.threads) {
    thread.parts.forEach((part, index) => {
      const label = `Thread "${thread.name}", part ${index + 1}`;
      const from = layout.rows.get(part.from);
      const to = layout.rows.get(part.to);
      if (!from || !to) {
        issues.push(`${label}: the row it uses does not exist.`);
      } else if (part.mode === 'chain' && (part.from !== part.to || part.toCopy % params.repeat)) {
        issues.push(`${label}: a chain needs one and the same row at both ends.`);
      } else if (part.mode === 'chain' && !from.closed) {
        issues.push(`${label}: a chain needs a closed row.`);
      } else if (partRoutes(part, from, to, 0).length === 0) {
        issues.push(`${label}: the rule gives no lines.`);
      }
    });
    if (!thread.visible) continue;
    thread.colors.forEach((_, colorIndex) => {
      const strung = stringThread(thread, colorIndex, layout, params.repeat, params.nailDiameter);
      if (strung) threads.push(strung);
    });
  }

  if (layout.tooClose.length > 0) {
    const count = layout.tooClose.length;
    issues.push(
      `${count} ${count === 1 ? 'pair of nails is' : 'pairs of nails are'} closer together than ${params.minSpacing} mm.`,
    );
  }
  return { layout, threads, issues };
}
