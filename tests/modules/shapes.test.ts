import { describe, expect, it } from 'vitest';
import { bboxOfGeometry } from '../../src/core/geometry/index.ts';
import {
  dragShapeHandle,
  generateShapes,
  parseShapesParams,
  SHAPE_DEFAULTS,
  shapeHandles,
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
    const geometry = generateShapes({
      shape: 'rectangle',
      width: 100,
      height: 60,
      cornerRadius: 0,
    });
    expect(geometry.polylines[0]?.closed).toBe(true);
    expect(geometry.polylines[0]?.points).toHaveLength(4);
    expect(bboxOfGeometry(geometry)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 60 });
  });

  it('rounds all four corners of a rectangle with the same radius', () => {
    const geometry = generateShapes({
      shape: 'rectangle',
      width: 100,
      height: 60,
      cornerRadius: 10,
    });
    const points = geometry.polylines[0]?.points ?? [];
    expect(geometry.polylines[0]?.closed).toBe(true);
    // the rounding does not change the size
    expect(bboxOfGeometry(geometry)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 60 });
    // the corners themselves are cut off, the ends of the straight edges are exact
    for (const corner of [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ]) {
      expect(points).not.toContainEqual(corner);
    }
    for (const end of [
      { x: 10, y: 0 },
      { x: 90, y: 0 },
      { x: 100, y: 10 },
      { x: 100, y: 50 },
      { x: 90, y: 60 },
      { x: 10, y: 60 },
      { x: 0, y: 50 },
      { x: 0, y: 10 },
    ]) {
      expect(points).toContainEqual(end);
    }
    // every point of a corner lies on its circle
    const center = { x: 90, y: 10 };
    const arc = points.filter((p) => p.x >= 90 && p.y <= 10);
    expect(arc.length).toBeGreaterThan(4);
    for (const p of arc) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(10, 9);
    // no point twice
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      expect(Math.hypot(p.x - (next?.x ?? 0), p.y - (next?.y ?? 0))).toBeGreaterThan(1e-6);
    });
  });

  it('limits the corner radius to half of the shorter side', () => {
    const geometry = generateShapes({
      shape: 'rectangle',
      width: 100,
      height: 40,
      cornerRadius: 500,
    });
    const points = geometry.polylines[0]?.points ?? [];
    expect(bboxOfGeometry(geometry)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 40 });
    expect(points).toContainEqual({ x: 20, y: 0 });
    expect(points).toContainEqual({ x: 80, y: 0 });
    expect(points.filter((p) => p.x === 100)).toEqual([{ x: 100, y: 20 }]);
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      expect(Math.hypot(p.x - (next?.x ?? 0), p.y - (next?.y ?? 0))).toBeGreaterThan(1e-6);
    });
  });

  it('reads rectangles of older projects, which have no corner radius', () => {
    expect(parseShapesParams({ shape: 'rectangle', width: 10, height: 5 })).toEqual({
      shape: 'rectangle',
      width: 10,
      height: 5,
      cornerRadius: 0,
    });
    expect(
      parseShapesParams({ shape: 'rectangle', width: 10, height: 5, cornerRadius: -1 }),
    ).toBeNull();
  });

  it('offers a handle in the middle of each edge of a rectangle only', () => {
    const rectangle = { shape: 'rectangle', width: 100, height: 60, cornerRadius: 0 } as const;
    expect(shapeHandles(rectangle).map(({ id, at }) => [id, at.x, at.y])).toEqual([
      ['left', 0, 30],
      ['right', 100, 30],
      ['bottom', 50, 0],
      ['top', 50, 60],
    ]);
    expect(shapeHandles({ shape: 'circle', diameter: 10 })).toEqual([]);
    expect(dragShapeHandle({ shape: 'circle', diameter: 10 }, 'left', { x: 0, y: 0 })).toBeNull();
    expect(dragShapeHandle(rectangle, 'nope', { x: 0, y: 0 })).toBeNull();
  });

  it('changes one side when an edge is pulled and keeps the opposite edge in place', () => {
    const rectangle = { shape: 'rectangle', width: 100, height: 60, cornerRadius: 5 } as const;
    // movement along the edge has no effect
    expect(dragShapeHandle(rectangle, 'right', { x: 130.04, y: 99 })).toEqual({
      params: { ...rectangle, width: 130 },
      shift: { x: 0, y: 0 },
    });
    expect(dragShapeHandle(rectangle, 'top', { x: -7, y: 45 })).toEqual({
      params: { ...rectangle, height: 45 },
      shift: { x: 0, y: 0 },
    });
    // the left and the lower edge take the origin with them
    expect(dragShapeHandle(rectangle, 'left', { x: -20, y: 0 })).toEqual({
      params: { ...rectangle, width: 120 },
      shift: { x: -20, y: 0 },
    });
    expect(dragShapeHandle(rectangle, 'bottom', { x: 0, y: 25 })).toEqual({
      params: { ...rectangle, height: 35 },
      shift: { x: 0, y: 25 },
    });
    // an edge cannot be pulled past the opposite one
    const flat = dragShapeHandle(rectangle, 'left', { x: 300, y: 0 });
    expect(flat?.params).toEqual({ ...rectangle, width: 0.1 });
    expect(flat?.shift.x).toBeCloseTo(99.9, 9);
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
