import { applyToGeometry, placementToTransform, type Geometry } from '../geometry/index.ts';
import { generateGcode, groupJobsByTool, type GcodeResult, type Program } from '../gcode/index.ts';
import { error, warning, type Issue } from '../issues.ts';
import type { Job } from '../toolpath/index.ts';
import type { Layer, Project } from './types.ts';

/**
 * Computes the geometry of a layer in its own coordinates (before
 * placement), or returns `null` if that is not possible, e.g. because the
 * module is unknown or its parameters are invalid. Supplied by the caller,
 * since the core does not know the design modules.
 */
export type GeometryResolver = (layer: Layer) => Geometry | null;

/** Geometry of a layer in program coordinates. */
export function placedGeometry(layer: Layer, resolve: GeometryResolver): Geometry | null {
  const geometry = resolve(layer);
  return geometry ? applyToGeometry(placementToTransform(layer.placement), geometry) : null;
}

export interface ProjectJobs {
  readonly jobs: readonly Job[];
  readonly issues: readonly Issue[];
}

/** One job per visible layer that has an operation. */
export function projectJobs(project: Project, resolve: GeometryResolver): ProjectJobs {
  const jobs: Job[] = [];
  const issues: Issue[] = [];
  const operations = new Map(project.operations.map((operation) => [operation.id, operation]));

  for (const layer of project.layers) {
    if (!layer.visible || layer.operationId === null) continue;
    const operation = operations.get(layer.operationId);
    if (!operation) {
      issues.push(
        error('layer.unknownOperation', `Layer "${layer.name}": its operation does not exist.`),
      );
      continue;
    }
    const geometry = placedGeometry(layer, resolve);
    if (!geometry) {
      issues.push(
        error('layer.noGeometry', `Layer "${layer.name}": its geometry cannot be computed.`),
      );
      continue;
    }
    const usable =
      operation.kind === 'follow' ? geometry.polylines.length > 0 : geometry.points.length > 0;
    if (!usable) {
      const needs = operation.kind === 'follow' ? 'paths' : 'points';
      issues.push(
        warning(
          'layer.nothingToDo',
          `Layer "${layer.name}": operation "${operation.name}" needs ${needs}, ` +
            'but the layer has none. It is skipped.',
        ),
      );
      continue;
    }
    jobs.push({ label: layer.name, geometry, operation, optimizeOrder: layer.optimizeOrder });
  }
  return { jobs, issues };
}

export interface ProgramOutput {
  readonly fileName: string;
  readonly program: Program;
  readonly result: GcodeResult;
}

export interface ProjectOutput {
  /** One entry per tool, in the order the tools are first used. */
  readonly programs: readonly ProgramOutput[];
  /** Problems that are not tied to a single program. */
  readonly issues: readonly Issue[];
}

/** Turn arbitrary text into a safe part of a file name. */
export function fileNamePart(text: string): string {
  const cleaned = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unnamed';
}

/** Generate the G-code programs of a project, one per tool. */
export function generateProject(
  project: Project,
  resolve: GeometryResolver,
  createdAt?: string,
): ProjectOutput {
  const { jobs, issues } = projectJobs(project, resolve);
  const programs = groupJobsByTool(project.name, jobs, project.end);
  const numbered = programs.length > 1;
  return {
    issues,
    programs: programs.map((program, index) => ({
      fileName:
        fileNamePart(project.name) +
        (numbered ? `_${index + 1}` : '') +
        `_${fileNamePart(program.toolName)}.gcode`,
      program,
      result: generateGcode(program, {
        workArea: project.workArea,
        workpiece: project.workpiece,
        machineLimits: project.machine.limits,
        rapidRates: project.machine.rapidRates,
        ...(createdAt === undefined ? {} : { createdAt }),
      }),
    })),
  };
}
