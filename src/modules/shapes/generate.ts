import { z } from 'zod';
import {
  circlePolyline,
  circleSegments,
  type Geometry,
  type Polyline,
  type Vec2,
} from '../../core/geometry/index.ts';
import type { HandleDrag, ModuleHandle } from '../types.ts';

const positive = z.number().finite().positive();
const count = z.number().int().min(1).max(200);

const schema = z.discriminatedUnion('shape', [
  z.strictObject({ shape: z.literal('line'), dx: z.number().finite(), dy: z.number().finite() }),
  z.strictObject({
    shape: z.literal('rectangle'),
    width: positive,
    height: positive,
    /** Radius of all four corners; 0 for sharp corners. Absent in older files. */
    cornerRadius: z.number().finite().min(0).default(0),
  }),
  z.strictObject({ shape: z.literal('circle'), diameter: positive }),
  z.strictObject({
    shape: z.literal('grid'),
    columns: count,
    rows: count,
    spacingX: positive,
    spacingY: positive,
  }),
]);

/**
 * Parameters of the basic shapes, in mm.
 * - `line`: from the layer origin to (dx, dy)
 * - `rectangle`: lower left corner at the layer origin (with rounded
 *   corners: the corner of the box around it)
 * - `circle`: centre at the layer origin
 * - `grid`: points for drilling, first point at the layer origin
 */
export type ShapesParams = z.infer<typeof schema>;
export type ShapeKind = ShapesParams['shape'];

export const SHAPE_DEFAULTS: { readonly [K in ShapeKind]: Extract<ShapesParams, { shape: K }> } = {
  line: { shape: 'line', dx: 100, dy: 0 },
  rectangle: { shape: 'rectangle', width: 100, height: 60, cornerRadius: 0 },
  circle: { shape: 'circle', diameter: 80 },
  grid: { shape: 'grid', columns: 5, rows: 3, spacingX: 20, spacingY: 20 },
};

export function parseShapesParams(raw: unknown): ShapesParams | null {
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

type RectangleParams = Extract<ShapesParams, { shape: 'rectangle' }>;

/** The corner radius that is actually used: at most half of the shorter side. */
export function effectiveCornerRadius(params: RectangleParams): number {
  return Math.min(params.cornerRadius, params.width / 2, params.height / 2);
}

/** Outline of a rectangle, counter-clockwise, starting on the lower edge. */
function rectanglePolyline(params: RectangleParams): Polyline {
  const { width, height } = params;
  const radius = effectiveCornerRadius(params);
  if (!(radius > 0)) {
    return {
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      closed: true,
    };
  }
  // Each corner is a quarter circle; its end points lie exactly on the edges.
  const steps = circleSegments(radius) / 4;
  const centers: readonly Vec2[] = [
    { x: width - radius, y: radius },
    { x: width - radius, y: height - radius },
    { x: radius, y: height - radius },
    { x: radius, y: radius },
  ];
  const points: Vec2[] = [];
  centers.forEach((center, corner) => {
    for (let step = 0; step <= steps; step++) {
      // The first corner (lower right) starts pointing down, at -90 degrees.
      const quarter = corner - 1 + step / steps;
      const exact = step === 0 || step === steps;
      const angle = (quarter * Math.PI) / 2;
      const cos = exact ? Math.round(Math.cos(angle)) : Math.cos(angle);
      const sin = exact ? Math.round(Math.sin(angle)) : Math.sin(angle);
      const point = { x: center.x + radius * cos, y: center.y + radius * sin };
      // Where the radius uses up a whole side, two corners meet in one point.
      const previous = points[points.length - 1];
      if (!previous || !samePoint(previous, point)) points.push(point);
    }
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && samePoint(first, last)) points.pop();
  return { points, closed: true };
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** Smallest side length that pulling an edge can produce, in mm. */
const MIN_SIDE = 0.1;
const tidy = (value: number) => Math.round(value * 10) / 10;

/** A rectangle has one handle in the middle of each edge. */
export function shapeHandles(params: ShapesParams): readonly ModuleHandle[] {
  if (params.shape !== 'rectangle') return [];
  const { width, height } = params;
  return [
    { id: 'left', at: { x: 0, y: height / 2 }, axis: { x: 1, y: 0 } },
    { id: 'right', at: { x: width, y: height / 2 }, axis: { x: 1, y: 0 } },
    { id: 'bottom', at: { x: width / 2, y: 0 }, axis: { x: 0, y: 1 } },
    { id: 'top', at: { x: width / 2, y: height }, axis: { x: 0, y: 1 } },
  ];
}

/**
 * Pull an edge of a rectangle to `to`: the edge follows, the opposite edge
 * stays, so the two edges of the other direction change their length.
 */
export function dragShapeHandle(
  params: ShapesParams,
  handleId: string,
  to: Vec2,
): HandleDrag<ShapesParams> | null {
  if (params.shape !== 'rectangle') return null;
  const { width, height } = params;
  const side = (length: number) => Math.max(MIN_SIDE, tidy(length));
  switch (handleId) {
    case 'right':
      return { params: { ...params, width: side(to.x) }, shift: { x: 0, y: 0 } };
    case 'top':
      return { params: { ...params, height: side(to.y) }, shift: { x: 0, y: 0 } };
    case 'left': {
      const next = side(width - to.x);
      return { params: { ...params, width: next }, shift: { x: width - next, y: 0 } };
    }
    case 'bottom': {
      const next = side(height - to.y);
      return { params: { ...params, height: next }, shift: { x: 0, y: height - next } };
    }
    default:
      return null;
  }
}

export function generateShapes(params: ShapesParams): Geometry {
  switch (params.shape) {
    case 'line':
      return {
        polylines: [
          {
            points: [
              { x: 0, y: 0 },
              { x: params.dx, y: params.dy },
            ],
            closed: false,
          },
        ],
        points: [],
      };
    case 'rectangle':
      return { polylines: [rectanglePolyline(params)], points: [] };
    case 'circle':
      return { polylines: [circlePolyline({ x: 0, y: 0 }, params.diameter / 2)], points: [] };
    case 'grid': {
      const points: Vec2[] = [];
      for (let row = 0; row < params.rows; row++) {
        for (let column = 0; column < params.columns; column++) {
          points.push({ x: column * params.spacingX, y: row * params.spacingY });
        }
      }
      return { polylines: [], points };
    }
  }
}
