import { describe, expect, it } from 'vitest';
import { bboxOfGeometry } from '../../src/core/geometry/index.ts';
import {
  generateShapes,
  parseShapesParams,
  SHAPE_DEFAULTS,
  type ShapeKind,
} from '../../src/modules/shapes/generate.ts';

describe('shapes', () => {
  it('draws a line from the origin', () => {
    const { polylines, points } = generateShapes({ shape: 'line', dx: 30, dy: -10 });
    expect(points).toEqual([]);
    expect(polylines).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 30, y: -10 },
        ],
        closed: false,
      },
    ]);
  });

  it('draws a closed rectangle with its corner at the origin', () => {
    const geometry = generateShapes({ shape: 'rectangle', width: 100, height: 60 });
    expect(geometry.polylines[0]?.closed).toBe(true);
    expect(geometry.polylines[0]?.points).toHaveLength(4);
    expect(bboxOfGeometry(geometry)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 60 });
  });

  it('draws a circle around the origin', () => {
    const box = bboxOfGeometry(generateShapes({ shape: 'circle', diameter: 80 }));
    expect(box?.minX).toBeCloseTo(-40, 1);
    expect(box?.maxX).toBeCloseTo(40, 1);
    expect(box?.maxY).toBeCloseTo(40, 1);
  });

  it('creates a grid of points, row by row', () => {
    const { polylines, points } = generateShapes({
      shape: 'grid',
      columns: 3,
      rows: 2,
      spacingX: 10,
      spacingY: 25,
    });
    expect(polylines).toEqual([]);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 25 },
      { x: 10, y: 25 },
      { x: 20, y: 25 },
    ]);
  });

  it('accepts its own defaults', () => {
    for (const kind of Object.keys(SHAPE_DEFAULTS) as ShapeKind[]) {
      expect(parseShapesParams(SHAPE_DEFAULTS[kind])).toEqual(SHAPE_DEFAULTS[kind]);
    }
  });

  it('rejects unusable parameters', () => {
    expect(parseShapesParams(null)).toBeNull();
    expect(parseShapesParams({ shape: 'star' })).toBeNull();
    expect(parseShapesParams({ shape: 'circle', diameter: 0 })).toBeNull();
    expect(parseShapesParams({ shape: 'circle', diameter: 10, extra: 1 })).toBeNull();
    expect(
      parseShapesParams({ shape: 'grid', columns: 2.5, rows: 1, spacingX: 1, spacingY: 1 }),
    ).toBeNull();
  });
});
