import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT } from '../../../src/core/geometry/index.ts';
import { validateWorkArea, validateWorkpiece } from '../../../src/core/machine/index.ts';
import { validateOperation } from '../../../src/core/operations/index.ts';
import {
  createDefaultProject,
  parseProject,
  PROJECT_VERSION,
  serializeProject,
  type Layer,
  type Project,
} from '../../../src/core/project/index.ts';

const layer: Layer = {
  id: 'layer-1',
  name: 'Frame',
  visible: true,
  moduleId: 'shapes',
  params: { shape: 'rectangle', width: 100, height: 50 },
  placement: { ...DEFAULT_PLACEMENT, x: 20, rotation: 45 },
  operationId: 'engrave',
  optimizeOrder: true,
};

function sample(): Project {
  return { ...createDefaultProject(), name: 'Türschild', layers: [layer] };
}

/** Parse a modified copy of the sample project. */
function parseModified(change: (data: Record<string, unknown>) => void) {
  const data = JSON.parse(serializeProject(sample())) as Record<string, unknown>;
  change(data);
  return parseProject(JSON.stringify(data));
}

/** First element of a list inside the raw project data. */
function first<T>(list: unknown): T {
  const [item] = list as T[];
  if (item === undefined) throw new Error('list is empty');
  return item;
}

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('default project', () => {
  it('is valid for the machine', () => {
    const project = createDefaultProject();
    expect(validateWorkArea(project.workArea, project.machine.limits)).toEqual([]);
    expect(validateWorkpiece(project.workpiece, project.workArea)).toEqual([]);
    for (const operation of project.operations) {
      expect(validateOperation(operation, project.workArea)).toEqual([]);
    }
  });
});

describe('project file', () => {
  it('survives a round trip unchanged', () => {
    const project = sample();
    const parsed = parseProject(serializeProject(project));
    expect(parsed.issues).toEqual([]);
    expect(parsed.project).toEqual(project);
  });

  it('is readable JSON with format marker and version', () => {
    const data = JSON.parse(serializeProject(sample())) as { format: string; version: number };
    expect(data.format).toBe('cnc-designer-project');
    expect(data.version).toBe(PROJECT_VERSION);
  });

  it('keeps module parameters as they are', () => {
    const parsed = parseProject(serializeProject(sample()));
    expect(parsed.project?.layers[0]?.params).toEqual(layer.params);
  });

  it('rejects text that is not JSON', () => {
    expect(codes(parseProject('G1 X0 Y0').issues)).toEqual(['project.notJson']);
  });

  it('rejects JSON that is not a project', () => {
    expect(codes(parseProject('[1, 2]').issues)).toEqual(['project.notProject']);
    expect(codes(parseProject('{"version": 1}').issues)).toEqual(['project.notProject']);
  });

  it('rejects files from a newer app version with a clear message', () => {
    const parsed = parseModified((data) => {
      data.version = PROJECT_VERSION + 1;
    });
    expect(parsed.project).toBeNull();
    expect(codes(parsed.issues)).toEqual(['project.tooNew']);
    expect(parsed.issues[0]?.message).toContain('newer version');
  });

  it('rejects a missing or broken version', () => {
    expect(
      codes(
        parseModified((data) => {
          data.version = '1';
        }).issues,
      ),
    ).toEqual(['project.version']);
  });

  it('reports where the structure is wrong', () => {
    const parsed = parseModified((data) => {
      (data.workArea as { x: { min: unknown } }).x.min = 'left';
    });
    expect(parsed.project).toBeNull();
    expect(codes(parsed.issues)).toEqual(['project.invalid']);
    expect(parsed.issues[0]?.message).toContain('workArea.x.min');
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    const parsed = parseModified((data) => {
      data.surprise = true;
    });
    expect(codes(parsed.issues)).toEqual(['project.invalid']);
  });

  it('rejects an unknown kind of operation', () => {
    const parsed = parseModified((data) => {
      first<{ kind: string }>(data.operations).kind = 'laser';
    });
    expect(codes(parsed.issues)).toEqual(['project.invalid']);
  });

  it('rejects a layer that refers to a missing operation', () => {
    const parsed = parseModified((data) => {
      first<{ operationId: string }>(data.layers).operationId = 'gone';
    });
    expect(parsed.project).toBeNull();
    expect(codes(parsed.issues)).toEqual(['project.unknownOperation']);
  });

  it('accepts a layer without an operation', () => {
    const parsed = parseModified((data) => {
      first<{ operationId: string | null }>(data.layers).operationId = null;
    });
    expect(parsed.issues).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    const parsed = parseModified((data) => {
      const layers = data.layers as unknown[];
      layers.push(layers[0]);
    });
    expect(codes(parsed.issues)).toEqual(['project.duplicateId']);
  });

  it('opens a project whose values do not fit the machine, so it can be fixed', () => {
    const parsed = parseModified((data) => {
      (data.workArea as { x: { max: number } }).x.max = 5000;
    });
    expect(parsed.issues).toEqual([]);
    expect(parsed.project?.workArea.x.max).toBe(5000);
  });
});
