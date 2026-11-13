import { distance, distanceToSegment, type Polyline, type Vec2 } from '../geometry/index.ts';

/**
 * Points closer to the path than this are removed before G-code is
 * written. Far below what the machine can resolve, so the result does not
 * change, but files get shorter and the controller has less to do.
 */
export const SIMPLIFY_TOLERANCE = 0.005;

/** Ends of paths closer than this are treated as the same point when joining paths. */
export const JOIN_TOLERANCE = 0.01;

/** Ramer–Douglas–Peucker on an open chain of points; keeps first and last. */
function simplifyChain(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  // Explicit stack instead of recursion: paths can have very many points.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i] as Vec2, points[first] as Vec2, points[last] as Vec2);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/**
 * Remove points that do not change the path by more than `tolerance`.
 * The start point of a closed path is always kept.
 */
export function simplifyPolyline(
  polyline: Polyline,
  tolerance: number = SIMPLIFY_TOLERANCE,
): Polyline {
  const { points, closed } = polyline;
  if (points.length <= 2) return polyline;
  if (!closed) return { points: simplifyChain(points, tolerance), closed };
  // Treat the closed path as a chain that returns to its start.
  const chain = simplifyChain([...points, points[0] as Vec2], tolerance);
  return { points: chain.slice(0, -1), closed };
}

/**
 * Join open paths whose ends meet, so the tool does not lift between them.
 * A chain whose two ends meet becomes a closed path. Paths may be reversed
 * in the process. Closed paths are passed through unchanged.
 */
export function joinPolylines(
  polylines: readonly Polyline[],
  tolerance: number = JOIN_TOLERANCE,
): Polyline[] {
  const result: Polyline[] = [];
  const open: Vec2[][] = [];
  for (const polyline of polylines) {
    if (polyline.closed || polyline.points.length < 2) result.push(polyline);
    else open.push([...polyline.points]);
  }

  // Ends are looked up in a grid of cells the size of the tolerance.
  const cell = (value: number) => Math.round(value / tolerance);
  const key = (x: number, y: number) => `${x},${y}`;
  const ends = new Map<string, { chain: Vec2[]; atStart: boolean }[]>();
  const register = (chain: Vec2[]) => {
    for (const atStart of [true, false]) {
      const p = (atStart ? chain[0] : chain[chain.length - 1]) as Vec2;
      const k = key(cell(p.x), cell(p.y));
      const list = ends.get(k);
      if (list) list.push({ chain, atStart });
      else ends.set(k, [{ chain, atStart }]);
    }
  };
  const unregister = (chain: Vec2[]) => {
    for (const p of [chain[0] as Vec2, chain[chain.length - 1] as Vec2]) {
      const k = key(cell(p.x), cell(p.y));
      const list = ends.get(k)?.filter((entry) => entry.chain !== chain) ?? [];
      if (list.length > 0) ends.set(k, list);
      else ends.delete(k);
    }
  };
  /** Another chain with an end within the tolerance of `p`. */
  const findAt = (p: Vec2, self: Vec2[]) => {
    const cx = cell(p.x);
    const cy = cell(p.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const entry of ends.get(key(cx + dx, cy + dy)) ?? []) {
          if (entry.chain === self) continue;
          const end = entry.atStart ? entry.chain[0] : entry.chain[entry.chain.length - 1];
          if (distance(p, end as Vec2) <= tolerance) return entry;
        }
      }
    }
    return null;
  };

  open.forEach(register);
  const done = new Set<Vec2[]>();
  for (const start of open) {
    if (done.has(start)) continue;
    let chain = start;
    unregister(chain);
    // Extend at the end, then at the start, for as long as something fits.
    for (;;) {
      const atEnd = findAt(chain[chain.length - 1] as Vec2, chain);
      const atStart = atEnd ? null : findAt(chain[0] as Vec2, chain);
      const match = atEnd ?? atStart;
      if (!match) break;
      unregister(match.chain);
      done.add(match.chain);
      // Orient the other chain so that it continues this one; the shared
      // point is taken only once.
      if (atEnd) {
        const next = match.atStart ? match.chain : [...match.chain].reverse();
        chain = [...chain, ...next.slice(1)];
      } else {
        const previous = match.atStart ? [...match.chain].reverse() : match.chain;
        chain = [...previous, ...chain.slice(1)];
      }
    }
    done.add(start);
    const closes =
      chain.length > 3 && distance(chain[0] as Vec2, chain[chain.length - 1] as Vec2) <= tolerance;
    result.push(
      closes ? { points: chain.slice(0, -1), closed: true } : { points: chain, closed: false },
    );
  }
  return result;
}

/** A closed path rewritten to start at its point nearest to `position`. */
export function startNear(polyline: Polyline, position: Vec2): Polyline {
  if (!polyline.closed || polyline.points.length < 2) return polyline;
  let best = 0;
  let bestDistance = Infinity;
  polyline.points.forEach((point, index) => {
    const d = distance(position, point);
    if (d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  if (best === 0) return polyline;
  return {
    points: [...polyline.points.slice(best), ...polyline.points.slice(0, best)],
    closed: true,
  };
}
