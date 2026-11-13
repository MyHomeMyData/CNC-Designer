import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, type Geometry } from '../../../src/core/geometry/index.ts';
import {
  createDefaultProject,
  exportSvg,
  type Layer,
  type Project,
} from '../../../src/core/project/index.ts';
import { parseSvg } from '../../../src/modules/svg/parse.ts';

const shape: Geometry = {
  polylines: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10.12345 },
      ],
      closed: true,
    },
    {
      points: [
        { x: 0, y: 20 },
        { x: 5, y: 25 },
      ],
      closed: false,
    },
  ],
  points: [{ x: 50, y: 50 }],
};

function layer(id: string, changes: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    visible: true,
    moduleId: 'shape',
    params: null,
    placement: DEFAULT_PLACEMENT,
    operationId: null,
    optimizeOrder: false,
    ...changes,
  };
}

const project = (...layers: Layer[]): Project => ({
  ...createDefaultProject(),
  name: 'Schild <1> & "2"',
  workArea: { x: { min: -100, max: 100 }, y: { min: -50, max: 150 }, z: { min: -5, max: 20 } },
  layers,
});

const resolve = (l: Layer) => (l.moduleId === 'shape' ? shape : null);

describe('exportSvg', () => {
  it('writes a page the size of the work area in millimetres', () => {
    const svg = exportSvg(project(layer('a')), resolve);
    expect(svg).toContain('width="200mm" height="200mm" viewBox="-100 -150 200 200"');
  });

  it('writes project coordinates with Y negated, so that FreeCAD restores them', () => {
    const svg = exportSvg(project(layer('a')), resolve);
    expect(svg).toContain('<path d="M0 0 L30 0 L30 -10.1235 Z"/>');
    expect(svg).toContain('<path d="M0 -20 L5 -25"/>');
    expect(svg).toContain('<circle cx="50" cy="-50" r="0.5"/>');
  });

  it('reads back to the same geometry, measured from the corner of the work area', () => {
    const placed = layer('a', { placement: { ...DEFAULT_PLACEMENT, x: 10, y: 5, rotation: 30 } });
    const result = parseSvg(exportSvg(project(placed), resolve), 0.001);
    expect(result.error).toBeNull();
    expect(result.warnings).toEqual([]);
    const [triangle] = result.geometry.polylines;
    expect(triangle?.closed).toBe(true);
    // first point: (10, 5) in the project is (110, 55) from the corner (-100, -50)
    expect(triangle?.points[0]?.x).toBeCloseTo(110, 3);
    expect(triangle?.points[0]?.y).toBeCloseTo(55, 3);
    // 2 paths and the circle that marks the point
    expect(result.geometry.polylines).toHaveLength(3);
  });

  it('writes one group per visible layer that has geometry', () => {
    const svg = exportSvg(
      project(layer('a'), layer('hidden', { visible: false }), layer('broken', { moduleId: 'x' })),
      resolve,
    );
    expect(svg.match(/<g /g)).toHaveLength(1);
  });

  it('escapes names', () => {
    const svg = exportSvg(project(layer('a', { name: 'A & <B>' })), resolve);
    expect(svg).not.toContain('A & <B>');
    expect(parseSvg(svg, 0.01).error).toBeNull();
  });

  it('is a valid empty drawing without layers', () => {
    const result = parseSvg(exportSvg(project(), resolve), 0.01);
    expect(result.error).toBeNull();
    expect(result.geometry.polylines).toEqual([]);
  });
});
