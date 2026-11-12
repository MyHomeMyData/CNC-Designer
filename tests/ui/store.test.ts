import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT } from '../../src/core/geometry/index.ts';
import { addLayer, createDefaultProject, removeLayer } from '../../src/core/project/index.ts';
import type { Project } from '../../src/core/project/index.ts';
import { createStore } from '../../src/ui/store.ts';

const rename = (name: string) => (project: Project) => ({ ...project, name });

const withLayer = (id: string) => (project: Project) =>
  addLayer(project, {
    id,
    name: id,
    visible: true,
    moduleId: 'shapes',
    params: {},
    placement: DEFAULT_PLACEMENT,
    operationId: null,
    optimizeOrder: true,
  });

describe('store', () => {
  it('starts clean and becomes dirty with the first edit', () => {
    const store = createStore();
    expect(store.getState().dirty).toBe(false);
    store.edit(rename('A'));
    expect(store.getState().project.name).toBe('A');
    expect(store.getState().dirty).toBe(true);
  });

  it('undoes and redoes edits', () => {
    const store = createStore();
    store.edit(rename('A'));
    store.edit(rename('B'));
    store.undo();
    expect(store.getState().project.name).toBe('A');
    store.undo();
    expect(store.getState().project.name).toBe('Untitled');
    store.undo();
    expect(store.getState().project.name).toBe('Untitled');
    store.redo();
    store.redo();
    expect(store.getState().project.name).toBe('B');
    store.redo();
    expect(store.getState().project.name).toBe('B');
  });

  it('drops the redo history after a new edit', () => {
    const store = createStore();
    store.edit(rename('A'));
    store.undo();
    store.edit(rename('C'));
    store.redo();
    expect(store.getState().project.name).toBe('C');
  });

  it('merges quick edits with the same key into one undo step', () => {
    const store = createStore();
    store.edit(rename('T'), 'name', 1000);
    store.edit(rename('Te'), 'name', 1200);
    store.edit(rename('Tes'), 'name', 1400);
    store.undo();
    expect(store.getState().project.name).toBe('Untitled');
  });

  it('does not merge after a pause or with another key', () => {
    const store = createStore();
    store.edit(rename('A'), 'name', 1000);
    store.edit(rename('B'), 'name', 5000);
    store.edit(rename('C'), 'other', 5100);
    store.undo();
    expect(store.getState().project.name).toBe('B');
    store.undo();
    expect(store.getState().project.name).toBe('A');
  });

  it('ignores edits that change nothing', () => {
    const store = createStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.edit((project) => project);
    expect(calls).toBe(0);
    expect(store.getState().dirty).toBe(false);
  });

  it('clears the selection when the selected layer disappears', () => {
    const store = createStore();
    store.edit(withLayer('a'));
    store.select('a');
    store.edit((project) => removeLayer(project, 'a'));
    expect(store.getState().selectedLayerId).toBeNull();
  });

  it('loading a project resets history, selection and the dirty flag', () => {
    const store = createStore();
    store.edit(withLayer('a'));
    store.select('a');
    store.load({ ...createDefaultProject(), name: 'Loaded' });
    const state = store.getState();
    expect(state.project.name).toBe('Loaded');
    expect(state.past).toEqual([]);
    expect(state.selectedLayerId).toBeNull();
    expect(state.dirty).toBe(false);
    expect(state.loadCount).toBe(1);
  });

  it('notifies subscribers and stops after unsubscribing', () => {
    const store = createStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.edit(rename('A'));
    unsubscribe();
    store.edit(rename('B'));
    expect(calls).toBe(1);
  });

  it('markSaved clears the dirty flag', () => {
    const store = createStore();
    store.edit(rename('A'));
    store.markSaved();
    expect(store.getState().dirty).toBe(false);
  });
});
