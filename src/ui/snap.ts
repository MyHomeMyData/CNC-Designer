/** The snap grid for dragging. A convenience of this browser, not part of the project. */
export interface SnapSettings {
  readonly enabled: boolean;
  /** Width of the grid in whole millimetres. */
  readonly step: number;
}

export const DEFAULT_SNAP: SnapSettings = { enabled: true, step: 10 };
const MAX_STEP = 500;
const STORAGE_KEY = 'cnc-designer.snap';

/** A usable grid width for whatever was typed: whole millimetres, at least 1. */
export function snapStep(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SNAP.step;
  return Math.min(MAX_STEP, Math.max(1, Math.round(value)));
}

/** Read stored settings; anything unusable gives the defaults. */
export function parseSnapSettings(text: string | null): SnapSettings {
  if (text === null) return DEFAULT_SNAP;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return DEFAULT_SNAP;
    const { enabled, step } = raw as { enabled?: unknown; step?: unknown };
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SNAP.enabled,
      step: typeof step === 'number' ? snapStep(step) : DEFAULT_SNAP.step,
    };
  } catch {
    return DEFAULT_SNAP;
  }
}

// Storage can be unavailable, e.g. in a private window; the app works without it.
export function loadSnapSettings(): SnapSettings {
  try {
    return parseSnapSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SNAP;
  }
}

export function saveSnapSettings(settings: SnapSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered, then.
  }
}
