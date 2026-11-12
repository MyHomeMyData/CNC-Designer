import type { Operation } from '../operations/index.ts';
import type { Layer, Project } from './types.ts';

/**
 * Pure editing functions: each returns a new project and leaves the given
 * one untouched, which is what undo/redo relies on.
 */

/** An id of the form `prefix-n` that is not in `existing`. */
export function nextId(prefix: string, existing: readonly string[]): string {
  const used = new Set(existing);
  let n = existing.length + 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** A name of the form `Base n` that is not in `existing`; plain `Base` if free. */
export function uniqueName(base: string, existing: readonly string[]): string {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function addLayer(project: Project, layer: Layer): Project {
  return { ...project, layers: [...project.layers, layer] };
}

export function updateLayer(project: Project, id: string, changes: Partial<Layer>): Project {
  return {
    ...project,
    layers: project.layers.map((layer) => (layer.id === id ? { ...layer, ...changes } : layer)),
  };
}

export function removeLayer(project: Project, id: string): Project {
  return { ...project, layers: project.layers.filter((layer) => layer.id !== id) };
}

/** Move a layer one position towards the start (-1) or the end (+1) of the working order. */
export function moveLayer(project: Project, id: string, direction: -1 | 1): Project {
  const index = project.layers.findIndex((layer) => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= project.layers.length) return project;
  const layers = [...project.layers];
  const [layer] = layers.splice(index, 1) as [Layer];
  layers.splice(target, 0, layer);
  return { ...project, layers };
}

export function addOperation(project: Project, operation: Operation): Project {
  return { ...project, operations: [...project.operations, operation] };
}

export function updateOperation(project: Project, operation: Operation): Project {
  return {
    ...project,
    operations: project.operations.map((existing) =>
      existing.id === operation.id ? operation : existing,
    ),
  };
}

/** Remove an operation. Layers that used it keep their geometry but lose the operation. */
export function removeOperation(project: Project, id: string): Project {
  return {
    ...project,
    operations: project.operations.filter((operation) => operation.id !== id),
    layers: project.layers.map((layer) =>
      layer.operationId === id ? { ...layer, operationId: null } : layer,
    ),
  };
}
