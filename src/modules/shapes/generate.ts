import { z } from 'zod';
import { circlePolyline, type Geometry, type Vec2 } from '../../core/geometry/index.ts';

const positive = z.number().finite().positive();
const count = z.number().int().min(1).max(200);

const schema = z.discriminatedUnion('shape', [
  z.strictObject({ shape: z.literal('line'), dx: z.number().finite(), dy: z.number().finite() }),
  z.strictObject({ shape: z.literal('rectangle'), width: positive, height: positive }),
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
 * - `rectangle`: lower left corner at the layer origin
 * - `circle`: centre at the layer origin
 * - `grid`: points for drilling, first point at the layer origin
 */
export type ShapesParams = z.infer<typeof schema>;
export type ShapeKind = ShapesParams['shape'];

export const SHAPE_DEFAULTS: { readonly [K in ShapeKind]: Extract<ShapesParams, { shape: K }> } = {
  line: { shape: 'line', dx: 100, dy: 0 },
  rectangle: { shape: 'rectangle', width: 100, height: 60 },
  circle: { shape: 'circle', diameter: 80 },
  grid: { shape: 'grid', columns: 5, rows: 3, spacingX: 20, spacingY: 20 },
};

export function parseShapesParams(raw: unknown): ShapesParams | null {
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
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
      return {
        polylines: [
          {
            points: [
              { x: 0, y: 0 },
              { x: params.width, y: 0 },
              { x: params.width, y: params.height },
              { x: 0, y: params.height },
            ],
            closed: true,
          },
        ],
        points: [],
      };
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
