import type { Placement } from '../geometry/index.ts';
import type { MachineLimits, WorkArea, Workpiece } from '../machine/index.ts';
import type { Operation } from '../operations/index.ts';
import type { ProgramEnd, RapidRates } from '../toolpath/index.ts';

export const PROJECT_FORMAT = 'cnc-designer-project';

/** Version of the project file format. Increase on incompatible changes. */
export const PROJECT_VERSION = 1;

/**
 * One design element. A layer stores the inputs of the module that created
 * it; its geometry is recomputed from them and never saved.
 */
export interface Layer {
  readonly id: string;
  readonly name: string;
  /** Hidden layers are neither drawn nor exported. */
  readonly visible: boolean;
  /** Identifier of the design module, e.g. `shapes`. */
  readonly moduleId: string;
  /** Module-specific parameters; only the module knows their structure. */
  readonly params: unknown;
  readonly placement: Placement;
  /** Operation applied to this layer, or `null` for a layer that is only drawn. */
  readonly operationId: string | null;
  /** Reorder paths and points to shorten positioning moves. */
  readonly optimizeOrder: boolean;
}

export interface Machine {
  readonly limits: MachineLimits;
  readonly rapidRates: RapidRates;
}

export interface Project {
  readonly format: typeof PROJECT_FORMAT;
  readonly version: number;
  readonly name: string;
  readonly machine: Machine;
  readonly workArea: WorkArea;
  readonly workpiece: Workpiece;
  readonly operations: readonly Operation[];
  /** In working order: the first layer is worked first. */
  readonly layers: readonly Layer[];
  readonly end: ProgramEnd;
}
