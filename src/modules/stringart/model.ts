import { z } from 'zod';

const finite = z.number().finite();
const positive = finite.positive();
const id = z.string().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** The curve a row of nails stands on, in the layer's own coordinates (mm, degrees). */
const curveSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('segment'),
    x1: finite,
    y1: finite,
    x2: finite,
    y2: finite,
  }),
  /**
   * Part of an ellipse (a circle if both radii are equal), counter-clockwise
   * from the angle `start` to the angle `end`. A sweep of 360 degrees or
   * more is the whole ellipse, a closed row.
   */
  z.strictObject({
    kind: z.literal('arc'),
    cx: finite,
    cy: finite,
    rx: positive,
    ry: positive,
    start: finite,
    end: finite,
  }),
  /** Regular polygon; `rotation` is the direction of the first corner. A closed row. */
  z.strictObject({
    kind: z.literal('polygon'),
    cx: finite,
    cy: finite,
    radius: positive,
    sides: z.number().int().min(3).max(24),
    rotation: finite,
  }),
  /**
   * A spiral around (`cx`, `cy`) from the distance `r1` at the angle
   * `start` to `r2` after turning by `turn` degrees (counter-clockwise if
   * positive). An open row. With `shape` 1 the distance changes evenly
   * with the angle; above 1 it shrinks faster at the start and slower
   * towards the end, below 1 the other way round.
   */
  z.strictObject({
    kind: z.literal('spiral'),
    cx: finite,
    cy: finite,
    r1: finite.min(0),
    r2: finite.min(0),
    start: finite,
    turn: finite,
    shape: positive.default(1),
  }),
]);

/** How the nails are spread along the curve: a number of nails, or a distance between them. */
const spacingSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('count'), count: z.number().int().min(2).max(2000) }),
  z.strictObject({ mode: z.literal('distance'), distance: positive }),
  /**
   * `count` nails; the first `even` of them stand at the same distance from
   * each other, then the distance shrinks by the same factor from nail to
   * nail, down to `ratio` times the first distance between the last two.
   * Distances are taken along the curve. Only on straight lines and spirals.
   */
  z.strictObject({
    mode: z.literal('taper'),
    count: z.number().int().min(2).max(2000),
    even: z.number().int().min(1),
    ratio: positive,
  }),
]);

const rowSchema = z.strictObject({
  id,
  name: z.string(),
  curve: curveSchema,
  nails: spacingSchema,
});

/**
 * One rule of a thread: nail `i` of the row `from` is connected to nail
 * `a * i + b` of the row `to`. Nails are counted from 0.
 */
const partSchema = z.strictObject({
  from: id,
  to: id,
  /** The row `to` is taken from the repetition this many steps further on. */
  toCopy: z.number().int().min(0),
  /**
   * `zigzag`: there and back between the two rows, moving on to the next
   * nail at each end. `chain`: on one closed row, each line starts where
   * the last one ended. `rounds`: the same nail of the row `from` in every
   * repetition in turn (going on by `toCopy` repetitions each time), then
   * the next nail, and so on; with `reverse` the nails are counted from the
   * far end of the row. A round goes through all repetitions at once.
   */
  mode: z.enum(['zigzag', 'chain', 'rounds']),
  a: z.number().int(),
  b: z.number().int(),
  /** Count the nails of `to` from its far end. */
  reverse: z.boolean(),
  /** First nail of `from` that is used. */
  start: z.number().int().min(0),
  /** Number of lines; `null` for as many as the rows allow. */
  count: z.number().int().min(1).nullable(),
  /** Use every `step`-th nail of `from`. */
  step: z.number().int().min(1),
});

const threadSchema = z.strictObject({
  id,
  name: z.string(),
  /** One colour, or several that take turns from one repetition to the next. */
  colors: z.array(color).min(1),
  visible: z.boolean(),
  /**
   * Every part is strung there and back again the same way, so each line
   * is two strands and the thread returns to the nail it started from.
   * Absent in older files.
   */
  double: z.boolean().default(false),
  parts: z.array(partSchema),
});

/**
 * A template and its own few parameters. While a design carries one, its
 * rows, threads and repetitions are those the template builds from them.
 */
const templateSchema = z.discriminatedUnion('id', [
  /** A circle and its two axes. `nails` per half axis and per quarter of the circle. */
  z.strictObject({
    id: z.literal('circle-axes'),
    radius: positive,
    nails: z.number().int().min(2).max(500),
  }),
  /**
   * A star of isosceles triangles that point outwards and join without a
   * gap. `outer` is the distance of the tips from the centre, `height` the
   * height of each triangle, `nails` the number of nails per leg.
   */
  z.strictObject({
    id: z.literal('parabola-star'),
    points: z.number().int().min(3).max(72),
    outer: positive,
    height: positive,
    nails: z.number().int().min(2).max(500),
  }),
  /**
   * Rows that point to the centre ("spokes", from `inner` to `outer` away
   * from it) and, halfway between them, as many straight rows of the length
   * `length` that touch a circle of the radius `radius` in their middle.
   */
  z.strictObject({
    id: z.literal('spokes-tangents'),
    count: z.number().int().min(3).max(72),
    inner: positive,
    outer: positive,
    radius: positive,
    length: positive,
    nails: z.number().int().min(2).max(500),
    /** One thread per colour for fans and star together, instead of two. */
    joined: z.boolean().default(false),
  }),
  /**
   * Regular polygons, one inside the other, each a little smaller and
   * turned a little further. Their corners stand on spirals, one per
   * corner, with `nails` nails each. `outer` and `inner` are the side
   * lengths of the outermost and the innermost polygon, `turn` is the angle
   * a spiral turns by from its first nail to its last. How fast the spirals
   * close in follows from the distances between the nails.
   */
  z.strictObject({
    id: z.literal('twisted-polygons'),
    corners: z.number().int().min(3).max(12),
    outer: positive,
    inner: positive,
    turn: finite,
    nails: z.number().int().min(2).max(500),
    /** The first `even` nails of a spiral stand at the same distance `outerGap`. */
    even: z.number().int().min(1),
    /** Distance between the first two nails of a spiral, in mm. */
    outerGap: positive,
    /** Distance between the last two nails, in mm; it shrinks evenly towards it. */
    innerGap: positive,
    clockwise: z.boolean(),
  }),
  /** A times table on a circle: nail i goes to nail `factor` × i. */
  z.strictObject({
    id: z.literal('cardioid'),
    radius: positive,
    nails: z.number().int().min(3).max(2000),
    factor: z.number().int().min(2).max(100),
  }),
]);

export const stringArtSchema = z.strictObject({
  /** `null` for a design of its own, changed by hand. Absent in older files. */
  template: templateSchema.nullable().default(null),
  rows: z.array(rowSchema),
  threads: z.array(threadSchema),
  /** The rows and threads are repeated this many times around the layer origin. */
  repeat: z.number().int().min(1).max(72),
  /** Nails closer together than this are reported, in mm. */
  minSpacing: finite.min(0),
  /** Used for the extra thread length that goes around each nail, in mm. */
  nailDiameter: positive,
  /** Colour of the board in the preview. */
  background: color,
});

export type StringArtParams = z.infer<typeof stringArtSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Curve = z.infer<typeof curveSchema>;
export type NailSpacing = z.infer<typeof spacingSchema>;
export type Row = z.infer<typeof rowSchema>;
export type ThreadPart = z.infer<typeof partSchema>;
export type Thread = z.infer<typeof threadSchema>;

export function parseStringArtParams(raw: unknown): StringArtParams | null {
  const result = stringArtSchema.safeParse(raw);
  return result.success ? result.data : null;
}
