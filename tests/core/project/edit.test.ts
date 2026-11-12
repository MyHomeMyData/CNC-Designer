import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT } from '../../../src/core/geometry/index.ts';
import {
  addLayer,
  addOperation,
  createDefaultProject,
  DEFAULT_DRILL_OPERATION,
  moveLayer,
  nextId,
  removeLayer,
  removeOperation,
  uniqueName,
  updateLayer,
  updateOperation,
  type Layer,
} from '../../../src/core/project/index.ts';

function layer(id: string, operationId: string | null = 'engrave'): Layer {
  return {
    id,
    name: id,
    visible: true,
    moduleId: 'shapes',
    params: {},
    placement: DEFAULT_PLACEMENT,
    operationId,
    optimizeOrder: true,
  };
}

const base = ['a', 'b', 'c'].reduce((p, id) => addLayer(p, layer(id)), createDefaultProject());
const order = (p: typeof base) => p.layers.map((l) => l.id).join('');

describe('ids and names', () => {
  it('creates ids and names that are not in use', () => {
    expect(nextId('layer', [])).toBe('layer-1');
    expect(nextId('layer', ['layer-1', 'layer-3'])).toBe('layer-4');
    expect(nextId('layer', ['layer-2', 'x'])).toBe('layer-3');
    expect(uniqueName('Circle', [])).toBe('Circle');
    expect(uniqueName('Circle', ['Circle', 'Circle 2'])).toBe('Circle 3');
  });
});

describe('layers', () => {
  it('adds, updates and removes without touching the original', () => {
    expect(order(base)).toBe('abc');
    const updated = updateLayer(base, 'b', { name: 'renamed', visible: false });
    expect(updated.layers[1]).toMatchObject({ id: 'b', name: 'renamed', visible: false });
    expect(base.layers[1]?.name).toBe('b');
    expect(order(removeLayer(base, 'b'))).toBe('ac');
    expect(order(base)).toBe('abc');
  });

  it('moves a layer within the working order and stops at the ends', () => {
    expect(order(moveLayer(base, 'b', -1))).toBe('bac');
    expect(order(moveLayer(base, 'b', 1))).toBe('acb');
    expect(moveLayer(base, 'a', -1)).toBe(base);
    expect(moveLayer(base, 'c', 1)).toBe(base);
    expect(moveLayer(base, 'missing', 1)).toBe(base);
  });
});

describe('operations', () => {
  it('adds and updates', () => {
    const added = addOperation(base, { ...DEFAULT_DRILL_OPERATION, id: 'deep', workZ: -9 });
    expect(added.operations.map((o) => o.id)).toEqual(['engrave', 'drill', 'deep']);
    const updated = updateOperation(added, { ...DEFAULT_DRILL_OPERATION, id: 'deep', workZ: -3 });
    expect(updated.operations[2]?.workZ).toBe(-3);
    expect(added.operations[2]?.workZ).toBe(-9);
  });

  it('removing an operation detaches the layers that used it', () => {
    const mixed = addLayer(base, layer('d', 'drill'));
    const removed = removeOperation(mixed, 'engrave');
    expect(removed.operations.map((o) => o.id)).toEqual(['drill']);
    expect(removed.layers.map((l) => l.operationId)).toEqual([null, null, null, 'drill']);
  });
});
