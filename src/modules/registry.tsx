import type { ReactNode } from 'react';
import type { Geometry, Vec2 } from '../core/geometry/index.ts';
import type { GeometryResolver } from '../core/project/index.ts';
import { gcodeModule } from './gcode/index.ts';
import { shapesModule } from './shapes/index.ts';
import { svgModule } from './svg/index.ts';
import { textModule } from './text/index.ts';
import { stringArtModule } from './stringart/index.ts';
import type { DesignModule, HandleDrag, ModuleHandle, ModulePreview } from './types.ts';

/**
 * A design module as the app sees it: with the type of its parameters
 * hidden. Parameters are checked by the module whenever they are used.
 */
export interface RegisteredModule {
  readonly id: string;
  readonly name: string;
  readonly defaultOperationKind: 'follow' | 'drill';
  /** Where a new layer is put: origin at the zero point or at the centre of the workpiece. */
  readonly newLayerAt: 'zero' | 'centre';
  /** Parameters for a new layer, possibly asking the user; `null` if cancelled. */
  createParams(): Promise<unknown>;
  /** Suggested name for a new layer with these parameters. */
  layerName(params: unknown): string;
  /** Geometry for the given parameters, or `null` if they are unusable. */
  generate(params: unknown): Geometry | null;
  /** The module's own preview in the layer's own coordinates, or `null` for none. */
  preview(params: unknown): ModulePreview | null;
  /** Handles on the shape itself, in the layer's own coordinates. */
  handles(params: unknown): readonly ModuleHandle[];
  /** Parameters after a handle was pulled to `to`; `null` for no change. */
  dragHandle(
    params: unknown,
    handleId: string,
    to: Vec2,
    snapLength?: number,
  ): HandleDrag<unknown> | null;
  /** Controls for the given parameters, or `null` if they are unusable. */
  renderPanel(params: unknown, onChange: (params: unknown, mergeKey?: string) => void): ReactNode;
}

function register<P>(module: DesignModule<P>): RegisteredModule {
  // Parameters are immutable objects that are replaced on every change, so
  // results can be remembered per parameter object.
  const cache = new WeakMap<object, Geometry | null>();
  const compute = (raw: unknown): Geometry | null => {
    const params = module.parseParams(raw);
    return params === null ? null : module.generate(params);
  };
  return {
    id: module.id,
    name: module.name,
    defaultOperationKind: module.defaultOperationKind,
    newLayerAt: module.newLayerAt ?? 'zero',
    createParams: async () =>
      module.createParams ? await module.createParams() : module.defaultParams(),
    layerName(raw) {
      const params = module.parseParams(raw);
      return (params !== null && module.layerName?.(params)) || module.name;
    },
    generate(raw) {
      if (typeof raw !== 'object' || raw === null) return compute(raw);
      if (!cache.has(raw)) cache.set(raw, compute(raw));
      return cache.get(raw) ?? null;
    },
    preview(raw) {
      const params = module.parseParams(raw);
      return (params !== null && module.preview?.(params)) || null;
    },
    handles(raw) {
      const params = module.parseParams(raw);
      return (params !== null && module.handles?.(params)) || [];
    },
    dragHandle(raw, handleId, to, snapLength) {
      const params = module.parseParams(raw);
      return (params !== null && module.dragHandle?.(params, handleId, to, snapLength)) || null;
    },
    renderPanel(raw, onChange) {
      const params = module.parseParams(raw);
      if (params === null) return null;
      return <module.Panel params={params} onChange={onChange} />;
    },
  };
}

/** All design modules of the app. New modules are added here. */
export const MODULES: readonly RegisteredModule[] = [
  register(shapesModule),
  register(svgModule),
  register(gcodeModule),
  register(textModule),
  register(stringArtModule),
];

export function findModule(id: string): RegisteredModule | undefined {
  return MODULES.find((module) => module.id === id);
}

/** Geometry of a layer in its own coordinates, computed by its module. */
export const resolveLayerGeometry: GeometryResolver = (layer) =>
  findModule(layer.moduleId)?.generate(layer.params) ?? null;
