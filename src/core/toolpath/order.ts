import { distance, type Polyline, type Vec2 } from '../geometry/index.ts';
import { startNear } from './optimize.ts';

function first(polyline: Polyline): Vec2 {
  return polyline.points[0] as Vec2;
}

/** Where the tool ends after following the polyline from its first point. */
function last(polyline: Polyline): Vec2 {
  return polyline.closed ? first(polyline) : (polyline.points[polyline.points.length - 1] as Vec2);
}

function reversed(polyline: Polyline): Polyline {
  return { points: [...polyline.points].reverse(), closed: polyline.closed };
}

/**
 * Reorder polylines to shorten positioning moves: starting at `start`, always
 * continue with the polyline whose start is closest (greedy nearest
 * neighbour). Open polylines may be followed backwards. A closed polyline
 * is chosen by its start point and then entered at its nearest point.
 *
 * This is a heuristic, not an optimal tour, but it removes most of the
 * wasted travel of an arbitrary drawing order.
 */
export function orderPolylines(polylines: readonly Polyline[], start: Vec2): Polyline[] {
  const remaining = polylines.filter((polyline) => polyline.points.length > 0);
  const ordered: Polyline[] = [];
  let position = start;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    let bestReversed = false;
    remaining.forEach((polyline, index) => {
      const toStart = distance(position, first(polyline));
      if (toStart < bestDistance) {
        bestIndex = index;
        bestDistance = toStart;
        bestReversed = false;
      }
      if (!polyline.closed) {
        const toEnd = distance(position, last(polyline));
        if (toEnd < bestDistance) {
          bestIndex = index;
          bestDistance = toEnd;
          bestReversed = true;
        }
      }
    });
    const [picked] = remaining.splice(bestIndex, 1) as [Polyline];
    const next = bestReversed ? reversed(picked) : startNear(picked, position);
    ordered.push(next);
    position = last(next);
  }
  return ordered;
}

/** Reorder points by greedy nearest neighbour, starting at `start`. */
export function orderPoints(points: readonly Vec2[], start: Vec2): Vec2[] {
  const remaining = [...points];
  const ordered: Vec2[] = [];
  let position = start;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((point, index) => {
      const d = distance(position, point);
      if (d < bestDistance) {
        bestIndex = index;
        bestDistance = d;
      }
    });
    const [picked] = remaining.splice(bestIndex, 1) as [Vec2];
    ordered.push(picked);
    position = picked;
  }
  return ordered;
}
