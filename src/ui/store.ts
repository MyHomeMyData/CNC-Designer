import { useSyncExternalStore } from 'react';
import { createDefaultProject, type Project } from '../core/project/index.ts';

/**
 * Application state: the project being edited, its undo history and the
 * selection. Projects are immutable; every edit replaces the project, and
 * the previous one goes onto the undo stack.
 */
export interface AppState {
  readonly project: Project;
  readonly past: readonly Project[];
  readonly future: readonly Project[];
  readonly selectedLayerId: string | null;
  /** True if there are changes that have not been saved to a file. */
  readonly dirty: boolean;
  /** Increases whenever a different project is loaded. */
  readonly loadCount: number;
}

const HISTORY_LIMIT = 200;
/** Edits with the same merge key within this time become one undo step. */
const MERGE_WINDOW_MS = 1500;

export function createStore(initial: Project = createDefaultProject()) {
  let state: AppState = {
    project: initial,
    past: [],
    future: [],
    selectedLayerId: null,
    dirty: false,
    loadCount: 0,
  };
  const listeners = new Set<() => void>();
  let lastMergeKey: string | null = null;
  let lastEditTime = 0;

  function set(next: AppState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  return {
    getState: (): AppState => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Apply a change to the project. Consecutive edits with the same
     * `mergeKey` (e.g. typing in one text field) form a single undo step.
     */
    edit(change: (project: Project) => Project, mergeKey?: string, now = Date.now()): void {
      const project = change(state.project);
      if (project === state.project) return;
      const merge =
        mergeKey !== undefined &&
        mergeKey === lastMergeKey &&
        now - lastEditTime < MERGE_WINDOW_MS &&
        state.past.length > 0;
      lastMergeKey = mergeKey ?? null;
      lastEditTime = now;
      const selectedLayerId = project.layers.some((layer) => layer.id === state.selectedLayerId)
        ? state.selectedLayerId
        : null;
      set({
        ...state,
        project,
        past: merge ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
        selectedLayerId,
        dirty: true,
      });
    },

    undo(): void {
      const previous = state.past.at(-1);
      if (!previous) return;
      lastMergeKey = null;
      set({
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        dirty: true,
      });
    },

    redo(): void {
      const [next, ...rest] = state.future;
      if (!next) return;
      lastMergeKey = null;
      set({
        ...state,
        project: next,
        past: [...state.past, state.project],
        future: rest,
        dirty: true,
      });
    },

    select(layerId: string | null): void {
      if (layerId !== state.selectedLayerId) set({ ...state, selectedLayerId: layerId });
    },

    /** Replace the project, e.g. after opening a file. Clears the history. */
    load(project: Project): void {
      lastMergeKey = null;
      set({
        project,
        past: [],
        future: [],
        selectedLayerId: null,
        dirty: false,
        loadCount: state.loadCount + 1,
      });
    },

    markSaved(): void {
      if (state.dirty) set({ ...state, dirty: false });
    },
  };
}

export type Store = ReturnType<typeof createStore>;

/** The store of the running app. */
export const store = createStore();

/** Subscribe a component to a part of the state. The selector must return a stable value. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
