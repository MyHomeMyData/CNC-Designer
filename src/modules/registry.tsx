import type { ReactNode } from 'react';
import type { Geometry } from '../core/geometry/index.ts';
import type { GeometryResolver } from '../core/project/index.ts';
import { shapesModule } from './shapes/index.ts';
import { svgModule } from './svg/index.ts';
import type { DesignModule } from './types.ts';

/**
 * A design module as the app sees it: with the type of its parameters
 * hidden. Parameters are checked by the module whenever they are used.
 */
export interface RegisteredModule {
  readonly id: string;
  readonly name: string;
  readonly defaultOperationKind: 'follow' | 'drill';
  /** Parameters for a new layer, possibly asking the user; `null` if cancelled. */
  createParams(): Promise<unknown>;
  /** Suggested name for a new layer with these parameters. */
  layerName(params: unknown): string;
  /** Geometry for the given parameters, or `null` if they are unusable. */
  generate(params: unknown): Geometry | null;
  /** Controls for the given parameters, or `null` if they are unusable. */
  renderPanel(params: unknown, onChange: (params: unknown) => void): ReactNode;
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
    renderPanel(raw, onChange) {
      const params = module.parseParams(raw);
      if (params === null) return null;
      return <module.Panel params={params} onChange={onChange} />;
    },
  };
}

/** All design modules of the app. New modules are added here. */
export const MODULES: readonly RegisteredModule[] = [register(shapesModule), register(svgModule)];

export function findModule(id: string): RegisteredModule | undefined {
  return MODULES.find((module) => module.id === id);
}

/** Geometry of a layer in its own coordinates, computed by its module. */
export const resolveLayerGeometry: GeometryResolver = (layer) =>
  findModule(layer.moduleId)?.generate(layer.params) ?? null;
