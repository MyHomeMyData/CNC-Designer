import type { Row, StringArtParams, ThreadPart } from './model.ts';

const BOARD = '#1c1c1e';
const BLUE = '#1f9fc4';
const ORANGE = '#f2a33a';
const TURQUOISE = '#35c4c0';
const ROSE = '#f29c9c';

const base = { minSpacing: 4, nailDiameter: 1.5, background: BOARD };

/** A rule between two rows with the usual settings; `changes` adjust it. */
export function newPart(from: string, to: string, changes: Partial<ThreadPart> = {}): ThreadPart {
  return {
    from,
    to,
    toCopy: 0,
    mode: 'zigzag',
    a: 1,
    b: 0,
    reverse: true,
    start: 0,
    count: null,
    step: 1,
    ...changes,
  };
}

/**
 * A circle with two axes, built from one quarter that is repeated four
 * times: half an axis and a quarter of the circle.
 */
function circleWithAxes(): StringArtParams {
  const radius = 200;
  const nails = 26;
  const rows: Row[] = [
    {
      id: 'axis',
      name: 'Half axis',
      curve: { kind: 'segment', x1: 0, y1: 0, x2: radius, y2: 0 },
      nails: { mode: 'count', count: nails },
    },
    {
      id: 'arc',
      name: 'Quarter circle',
      curve: { kind: 'arc', cx: 0, cy: 0, rx: radius, ry: radius, start: 0, end: 90 },
      nails: { mode: 'count', count: nails },
    },
  ];
  return {
    ...base,
    rows,
    repeat: 4,
    threads: [
      {
        id: 'star',
        name: 'Star',
        colors: [BLUE],
        visible: true,
        // from each half axis to the next one, running against each other
        parts: [newPart('axis', 'axis', { toCopy: 1 })],
      },
      {
        id: 'rim',
        name: 'Rim',
        colors: [ORANGE],
        visible: true,
        parts: [
          // Both rows start at the tip of the half axis: the first line lies
          // on the axis, the last one joins this tip with the next.
          newPart('axis', 'arc', { reverse: false }),
          // The same from the next half axis, towards which the arc runs.
          newPart('arc', 'axis', { toCopy: 1 }),
        ],
      },
    ],
  };
}

/**
 * An eight-pointed star outline. Each side of a point is a row of nails;
 * parabolas fill the inner corners in one colour and the points in another.
 */
function parabolaStar(): StringArtParams {
  const outer = 200;
  const inner = 110;
  const points = 8;
  const half = 180 / points;
  const at = (radius: number, degrees: number) => ({
    x: Math.round(radius * Math.cos((degrees * Math.PI) / 180) * 1000) / 1000,
    y: Math.round(radius * Math.sin((degrees * Math.PI) / 180) * 1000) / 1000,
  });
  const tip = at(outer, 0);
  const corner = at(inner, half);
  const nextTip = at(outer, 2 * half);
  // An odd number: each part then ends on the nail where the next one begins.
  const nails = 19;
  const rows: Row[] = [
    {
      id: 'down',
      name: 'Point to corner',
      curve: { kind: 'segment', x1: tip.x, y1: tip.y, x2: corner.x, y2: corner.y },
      nails: { mode: 'count', count: nails },
    },
    {
      id: 'up',
      name: 'Corner to point',
      curve: { kind: 'segment', x1: corner.x, y1: corner.y, x2: nextTip.x, y2: nextTip.y },
      nails: { mode: 'count', count: nails },
    },
  ];
  return {
    ...base,
    rows,
    repeat: points,
    threads: [
      {
        id: 'corners',
        name: 'Inner corners',
        colors: [TURQUOISE],
        visible: true,
        // The rows meet in the corner: the nail next to the point goes to
        // the nail next to the corner, and so on.
        parts: [newPart('down', 'up', { reverse: false })],
      },
      {
        id: 'points',
        name: 'Points',
        colors: [ROSE],
        visible: true,
        parts: [newPart('up', 'down', { toCopy: 1, reverse: false })],
      },
    ],
  };
}

/** The two times table on a circle: its lines wrap a heart-shaped curve. */
function cardioid(): StringArtParams {
  return {
    ...base,
    rows: [
      {
        id: 'circle',
        name: 'Circle',
        curve: { kind: 'arc', cx: 0, cy: 0, rx: 200, ry: 200, start: 0, end: 360 },
        nails: { mode: 'count', count: 120 },
      },
    ],
    repeat: 1,
    threads: [
      {
        id: 'heart',
        name: 'Times two',
        colors: [ORANGE],
        visible: true,
        parts: [newPart('circle', 'circle', { a: 2, reverse: false })],
      },
    ],
  };
}

export const TEMPLATES: readonly {
  readonly id: string;
  readonly name: string;
  readonly create: () => StringArtParams;
}[] = [
  { id: 'circle-axes', name: 'Circle with axes', create: circleWithAxes },
  { id: 'parabola-star', name: 'Parabola star', create: parabolaStar },
  { id: 'cardioid', name: 'Cardioid', create: cardioid },
];

export const DEFAULT_STRING_ART = circleWithAxes;
