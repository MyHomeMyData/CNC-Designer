import type { ComponentType } from 'react';
import type { Geometry } from '../core/geometry/index.ts';

export interface PanelProps<P> {
  readonly params: P;
  readonly onChange: (params: P) => void;
}

/**
 * A design module covers one use case. It turns its own parameters into
 * geometry and provides the controls to edit those parameters. The app
 * around it knows nothing about what a module does.
 *
 * `P` must be plain JSON data, since it is stored in the project file.
 */
export interface DesignModule<P> {
  /** Stable identifier, stored in project files. */
  readonly id: string;
  /** Name shown to the user. */
  readonly name: string;
  /** Kind of operation that suits a new layer of this module. */
  readonly defaultOperationKind: 'follow' | 'drill';
  defaultParams(): P;
  /** Check parameters read from a project file; `null` if they are unusable. */
  parseParams(raw: unknown): P | null;
  /** Compute the geometry in the layer's own coordinates. Must be a pure function. */
  generate(params: P): Geometry;
  /** Controls for editing the parameters. */
  readonly Panel: ComponentType<PanelProps<P>>;
}
