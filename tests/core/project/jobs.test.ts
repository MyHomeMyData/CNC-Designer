import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, type Geometry } from '../../../src/core/geometry/index.ts';
import { parseGcode } from '../../../src/core/gcode/index.ts';
import {
  createDefaultProject,
  fileNamePart,
  generateProject,
  projectJobs,
  type Layer,
  type Project,
} from '../../../src/core/project/index.ts';

const line: Geometry = {
  polylines: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      closed: false,
    },
  ],
  points: [],
};
const dots: Geometry = { polylines: [], points: [{ x: 5, y: 5 }] };

function layer(id: string, changes: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    visible: true,
    moduleId: 'line',
    params: null,
    placement: DEFAULT_PLACEMENT,
    operationId: 'engrave',
    optimizeOrder: false,
    ...changes,
  };
}

/** Stand-in for the module registry: the module id selects the geometry. */
const resolve = (l: Layer): Geometry | null =>
  l.moduleId === 'line' ? line : l.moduleId === 'dots' ? dots : null;

function project(...layers: Layer[]): Project {
  return { ...createDefaultProject(), name: 'Test Stück', layers };
}

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('projectJobs', () => {
  it('creates a job per visible layer with an operation, in layer order', () => {
    const { jobs, issues } = projectJobs(
      project(
        layer('a'),
        layer('hidden', { visible: false }),
        layer('drawing only', { operationId: null }),
        layer('b', { moduleId: 'dots', operationId: 'drill' }),
      ),
      resolve,
    );
    expect(issues).toEqual([]);
    expect(jobs.map((j) => [j.label, j.operation.id])).toEqual([
      ['a', 'engrave'],
      ['b', 'drill'],
    ]);
  });

  it('applies the placement of the layer', () => {
    const placed = layer('a', { placement: { ...DEFAULT_PLACEMENT, x: 100, y: 20, rotation: 90 } });
    const { jobs } = projectJobs(project(placed), resolve);
    const points = jobs[0]?.geometry.polylines[0]?.points ?? [];
    expect(points[0]).toEqual({ x: 100, y: 20 });
    expect(points[1]?.x).toBeCloseTo(100, 9);
    expect(points[1]?.y).toBeCloseTo(30, 9);
  });

  it('reports layers whose geometry or operation is missing', () => {
    const { jobs, issues } = projectJobs(
      project(layer('a', { moduleId: 'unknown' }), layer('b', { operationId: 'gone' })),
      resolve,
    );
    expect(jobs).toEqual([]);
    expect(codes(issues)).toEqual(['layer.noGeometry', 'layer.unknownOperation']);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
  });

  it('warns when the operation cannot use the kind of geometry', () => {
    const { jobs, issues } = projectJobs(
      project(layer('a', { operationId: 'drill' }), layer('b', { moduleId: 'dots' })),
      resolve,
    );
    expect(jobs).toEqual([]);
    expect(codes(issues)).toEqual(['layer.nothingToDo', 'layer.nothingToDo']);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('needs points');
  });
});

describe('generateProject', () => {
  it('writes one numbered file per tool', () => {
    const output = generateProject(
      project(layer('a'), layer('b', { moduleId: 'dots', operationId: 'drill' })),
      resolve,
    );
    expect(output.programs.map((p) => p.fileName)).toEqual([
      'Test-Stuck_1_End-mill-2-mm.gcode',
      'Test-Stuck_2_Drill-2-mm.gcode',
    ]);
    for (const { result } of output.programs) {
      expect(result.issues).toEqual([]);
      expect(parseGcode(result.gcode ?? '').issues).toEqual([]);
    }
  });

  it('does not number a single file', () => {
    const output = generateProject(project(layer('a')), resolve);
    expect(output.programs.map((p) => p.fileName)).toEqual(['Test-Stuck_End-mill-2-mm.gcode']);
  });

  it('uses the work area of the project for the bounds check', () => {
    const outside = layer('a', { placement: { ...DEFAULT_PLACEMENT, x: 795 } });
    const [program] = generateProject(project(outside), resolve).programs;
    expect(program?.result.gcode).toBeNull();
    expect(codes(program?.result.issues ?? [])).toContain('program.outsideWorkArea');
  });

  it('has no programs for an empty project', () => {
    expect(generateProject(project(), resolve).programs).toEqual([]);
  });
});

describe('fileNamePart', () => {
  it('keeps letters and digits and replaces everything else', () => {
    expect(fileNamePart('Türschild Größe 2/3')).toBe('Turschild-Grosse-2-3');
    expect(fileNamePart('  ??  ')).toBe('unnamed');
  });
});
