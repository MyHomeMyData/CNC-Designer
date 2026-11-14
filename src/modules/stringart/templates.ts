import type { Row, StringArtParams, Template, Thread, ThreadPart } from './model.ts';

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

type Built = Pick<StringArtParams, 'rows' | 'threads' | 'repeat'>;

function thread(id: string, name: string, color: string, parts: ThreadPart[]): Thread {
  return { id, name, colors: [color], visible: true, parts };
}

/**
 * A circle with two axes, built from one quarter that is repeated four
 * times: half an axis and a quarter of the circle.
 */
function circleWithAxes(template: Extract<Template, { id: 'circle-axes' }>): Built {
  const { radius, nails } = template;
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
    rows,
    repeat: 4,
    threads: [
      // from each half axis to the next one, running against each other
      thread('star', 'Star', BLUE, [newPart('axis', 'axis', { toCopy: 1 })]),
      thread('rim', 'Rim', ORANGE, [
        // Both rows start at the tip of the half axis: the first line lies
        // on the axis, the last one joins this tip with the next.
        newPart('axis', 'arc', { reverse: false }),
        // The same from the next half axis, towards which the arc runs.
        newPart('arc', 'axis', { toCopy: 1 }),
      ]),
    ],
  };
}

/** What follows from the parameters of the star, in mm and degrees. */
export function starGeometry(template: Extract<Template, { id: 'parabola-star' }>): {
  /** Distance of the inner corners, where two triangles meet, from the centre. */
  readonly inner: number;
  /** Angle between the two legs at the tip. */
  readonly opening: number;
  /** Length of a leg. */
  readonly leg: number;
} {
  const { points, outer, height } = template;
  const half = Math.PI / points;
  // The base of a triangle is a chord of the inner circle, `outer - height`
  // away from the centre.
  const inner = (outer - height) / Math.cos(half);
  const halfBase = inner * Math.sin(half);
  return {
    inner,
    opening: (2 * Math.atan2(halfBase, height) * 180) / Math.PI,
    leg: Math.hypot(halfBase, height),
  };
}

/**
 * A star outline of isosceles triangles. Each leg is a row of nails;
 * parabolas fill the inner corners in one colour and the tips in another.
 */
function parabolaStar(template: Extract<Template, { id: 'parabola-star' }>): Built {
  const { points, outer, nails } = template;
  const { inner } = starGeometry(template);
  const half = 180 / points;
  const at = (radius: number, degrees: number) => ({
    x: Math.round(radius * Math.cos((degrees * Math.PI) / 180) * 1000) / 1000 + 0,
    y: Math.round(radius * Math.sin((degrees * Math.PI) / 180) * 1000) / 1000 + 0,
  });
  const tip = at(outer, 0);
  const corner = at(inner, half);
  const nextTip = at(outer, 2 * half);
  const rows: Row[] = [
    {
      id: 'down',
      name: 'Tip to corner',
      curve: { kind: 'segment', x1: tip.x, y1: tip.y, x2: corner.x, y2: corner.y },
      nails: { mode: 'count', count: nails },
    },
    {
      id: 'up',
      name: 'Corner to tip',
      curve: { kind: 'segment', x1: corner.x, y1: corner.y, x2: nextTip.x, y2: nextTip.y },
      nails: { mode: 'count', count: nails },
    },
  ];
  return {
    rows,
    repeat: points,
    threads: [
      // The rows meet in the corner: the nail next to the tip goes to the
      // nail next to the corner, and so on.
      thread('corners', 'Inner corners', TURQUOISE, [newPart('down', 'up', { reverse: false })]),
      thread('points', 'Tips', ROSE, [newPart('up', 'down', { toCopy: 1, reverse: false })]),
    ],
  };
}

/**
 * Spokes and, halfway between them, rows that touch a circle. Every spoke
 * is joined to the two rows next to it and, with its inner half, to the
 * spokes on both sides; the colours take turns from spoke to spoke.
 */
function spokesAndTangents(template: Extract<Template, { id: 'spokes-tangents' }>): Built {
  const { count, inner, outer, radius, length, nails } = template;
  const half = Math.PI / count;
  const round = (value: number) => Math.round(value * 1000) / 1000 + 0;
  // The row touches the circle at the angle `half` and runs on in the
  // direction of growing angles, from the end next to this spoke.
  const end = (along: number) => ({
    x: round(radius * Math.cos(half) - along * Math.sin(half)),
    y: round(radius * Math.sin(half) + along * Math.cos(half)),
  });
  const near = end(-length / 2);
  const far = end(length / 2);
  const rows: Row[] = [
    {
      id: 'spoke',
      name: 'Spoke',
      curve: { kind: 'segment', x1: inner, y1: 0, x2: outer, y2: 0 },
      nails: { mode: 'count', count: nails },
    },
    {
      id: 'tangent',
      name: 'Tangent',
      curve: { kind: 'segment', x1: near.x, y1: near.y, x2: far.x, y2: far.y },
      nails: { mode: 'count', count: nails },
    },
  ];
  return {
    rows,
    repeat: count,
    threads: [
      {
        id: 'fans',
        name: 'Fans',
        colors: [TURQUOISE, ROSE],
        visible: true,
        parts: [
          // First the row of the repetition before this one, counted from
          // its far end, which lies next to this spoke.
          newPart('spoke', 'tangent', { toCopy: count - 1 }),
          // Then the row on the other side: the inner end of the spoke goes
          // to the near end of that row, the outer end to its far end.
          newPart('spoke', 'tangent', { reverse: false }),
        ],
      },
      {
        // The inner half of each spoke goes to the outer half of the spokes
        // on both sides, running against each other. With the same from the
        // neighbours, in the other colour, each pair of spokes carries a
        // whole parabola: it closes the round holes towards the centre and
        // leaves a star there. With an odd number of nails the line between
        // the two middle nails is strung in both colours.
        id: 'star',
        name: 'Star',
        colors: [TURQUOISE, ROSE],
        visible: true,
        parts: [
          newPart('spoke', 'spoke', { toCopy: count - 1, count: Math.ceil(nails / 2) }),
          newPart('spoke', 'spoke', { toCopy: 1, count: Math.ceil(nails / 2) }),
        ],
      },
    ],
  };
}

/** A times table on a circle; with the factor 2 its lines wrap a heart-shaped curve. */
function cardioid(template: Extract<Template, { id: 'cardioid' }>): Built {
  const { radius, nails, factor } = template;
  return {
    rows: [
      {
        id: 'circle',
        name: 'Circle',
        curve: { kind: 'arc', cx: 0, cy: 0, rx: radius, ry: radius, start: 0, end: 360 },
        nails: { mode: 'count', count: nails },
      },
    ],
    repeat: 1,
    threads: [
      thread('heart', 'Times table', ORANGE, [
        newPart('circle', 'circle', { a: factor, reverse: false }),
      ]),
    ],
  };
}

function build(template: Template): Built {
  switch (template.id) {
    case 'circle-axes':
      return circleWithAxes(template);
    case 'parabola-star':
      return parabolaStar(template);
    case 'spokes-tangents':
      return spokesAndTangents(template);
    case 'cardioid':
      return cardioid(template);
  }
}

/**
 * The design with rows, threads and repetitions built anew from `template`.
 * Names, colours and visibility of threads the design already has are kept, and
 * so are the settings that do not belong to the template.
 */
export function applyTemplate(params: StringArtParams, template: Template): StringArtParams {
  const built = build(template);
  const same = params.template?.id === template.id;
  return {
    ...params,
    ...built,
    template,
    threads: built.threads.map((fresh) => {
      const old = same ? params.threads.find((candidate) => candidate.id === fresh.id) : undefined;
      return old ? { ...fresh, name: old.name, colors: old.colors, visible: old.visible } : fresh;
    }),
  };
}

function create(template: Template): StringArtParams {
  return { ...base, template, ...build(template) };
}

export const TEMPLATES: readonly {
  readonly id: Template['id'];
  readonly name: string;
  readonly defaults: Template;
  readonly create: () => StringArtParams;
}[] = (
  [
    { name: 'Circle with axes', defaults: { id: 'circle-axes', radius: 200, nails: 26 } },
    {
      name: 'Parabola star',
      // An odd number of nails: each part then ends on the nail where the next one begins.
      defaults: { id: 'parabola-star', points: 8, outer: 200, height: 100, nails: 19 },
    },
    {
      name: 'Spokes and tangents',
      defaults: {
        id: 'spokes-tangents',
        count: 6,
        inner: 55,
        outer: 185,
        radius: 200,
        length: 145,
        nails: 21,
      },
    },
    { name: 'Cardioid', defaults: { id: 'cardioid', radius: 200, nails: 120, factor: 2 } },
  ] as const
).map((entry) => ({ ...entry, id: entry.defaults.id, create: () => create(entry.defaults) }));

export const DEFAULT_STRING_ART = (): StringArtParams =>
  create({ id: 'circle-axes', radius: 200, nails: 26 });
