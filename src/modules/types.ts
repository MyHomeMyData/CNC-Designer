import type { ComponentType } from 'react';
import type { Geometry, Vec2 } from '../core/geometry/index.ts';

export interface PanelProps<P> {
  readonly params: P;
  /**
   * Report changed parameters. Consecutive changes with the same `mergeKey`
   * (e.g. typing in one text field) become a single undo step.
   */
  readonly onChange: (params: P, mergeKey?: string) => void;
}

/** A coloured line of a module's own preview, in the layer's own coordinates. */
export interface PreviewStroke {
  readonly points: readonly Vec2[];
  /** CSS colour. */
  readonly color: string;
  /** Width in mm. */
  readonly width: number;
}

/** What a module shows in addition to its geometry, e.g. threads between nails. */
export interface ModulePreview {
  /** Colour of the workpiece under this design, or `null` to leave it as it is. */
  readonly background: string | null;
  readonly strokes: readonly PreviewStroke[];
}

/** A handle on the shape itself that changes a parameter when pulled. */
export interface ModuleHandle {
  /** Stable within one module, e.g. "right". */
  readonly id: string;
  /** Position in the layer's own coordinates. */
  readonly at: Vec2;
  /** Direction in which pulling has an effect, in the layer's own coordinates. */
  readonly axis: Vec2;
}

/** Result of pulling a handle. */
export interface HandleDrag<P> {
  readonly params: P;
  /**
   * How far the layer origin has to move, in the layer's own coordinates,
   * so that the part of the shape that was not pulled stays where it is.
   */
  readonly shift: Vec2;
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
  /**
   * Create the parameters of a new layer with the help of the user, e.g. by
   * asking for a file. Resolves to `null` if the user cancels. Modules
   * without this start from `defaultParams`.
   */
  createParams?(): Promise<P | null>;
  /** Suggested name for a new layer with these parameters. */
  layerName?(params: P): string;
  /** Check parameters read from a project file; `null` if they are unusable. */
  parseParams(raw: unknown): P | null;
  /** Compute the geometry in the layer's own coordinates. Must be a pure function. */
  generate(params: P): Geometry;
  /** An impression of the finished piece beyond the geometry; a pure function. */
  preview?(params: P): ModulePreview;
  /** Handles shown on the selected layer. Modules without this have none. */
  handles?(params: P): readonly ModuleHandle[];
  /**
   * Parameters after the handle `handleId` was pulled to the point `to`
   * (layer coordinates), starting from `params`; `null` for no change.
   * With `snapLength`, the length that changes is to be a multiple of it;
   * this is given when `to` itself could not be put on the snap grid.
   */
  dragHandle?(params: P, handleId: string, to: Vec2, snapLength?: number): HandleDrag<P> | null;
  /** Controls for editing the parameters. */
  readonly Panel: ComponentType<PanelProps<P>>;
}
