import { z } from 'zod';
import { error, type Issue } from '../issues.ts';
import { PROJECT_FORMAT, PROJECT_VERSION, type Project } from './types.ts';

const number = z.number().finite();
const range = z.strictObject({ min: number, max: number });

const travel = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('rapid') }),
  z.strictObject({ mode: z.literal('feed'), feed: number }),
]);

const operationBase = {
  id: z.string().min(1),
  name: z.string(),
  toolName: z.string(),
  toolDiameter: number,
  safeZ: number,
  workZ: number,
  feedZ: number,
  travel,
};

const operation = z.discriminatedUnion('kind', [
  z.strictObject({
    ...operationBase,
    kind: z.literal('follow'),
    feedXY: number,
    stepDown: number.nullable(),
  }),
  z.strictObject({ ...operationBase, kind: z.literal('drill'), peckDepth: number.nullable() }),
]);

const layer = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  moduleId: z.string().min(1),
  params: z.unknown(),
  placement: z.strictObject({
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
  }),
  operationId: z.string().nullable(),
  optimizeOrder: z.boolean(),
});

const projectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  version: z.number().int(),
  name: z.string(),
  machine: z.strictObject({
    limits: z.strictObject({ x: number, y: number, z: number }),
    rapidRates: z.strictObject({ xy: number, z: number }),
  }),
  workArea: z.strictObject({ x: range, y: range, z: range }),
  workpiece: z.strictObject({ x: range, y: range, thickness: number }),
  operations: z.array(operation),
  layers: z.array(layer),
  end: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('stay') }),
    z.strictObject({ kind: z.literal('moveTo'), x: number, y: number, z: number }),
  ]),
});

/** Serialise a project as the content of a project file. */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + '\n';
}

export interface ParsedProject {
  /** The project, or `null` if the file cannot be used. */
  readonly project: Project | null;
  readonly issues: readonly Issue[];
}

function fail(code: string, message: string): ParsedProject {
  return { project: null, issues: [error(`project.${code}`, message)] };
}

function duplicates(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

/**
 * Read a project file.
 *
 * Only the structure is checked here. Whether the values make sense for
 * the machine (work area, feeds, …) is checked when G-code is generated,
 * so that a project with such problems can still be opened and fixed.
 */
export function parseProject(text: string): ParsedProject {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('notJson', 'The file is not valid JSON.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('notProject', 'The file is not a CNC-Designer project.');
  }
  const head = data as { format?: unknown; version?: unknown };
  if (head.format !== PROJECT_FORMAT) {
    return fail('notProject', 'The file is not a CNC-Designer project.');
  }
  if (typeof head.version !== 'number' || !Number.isInteger(head.version) || head.version < 1) {
    return fail('version', 'The project file has no valid format version.');
  }
  if (head.version > PROJECT_VERSION) {
    return fail(
      'tooNew',
      `The project was saved by a newer version of the app (file format ${head.version}, ` +
        `this app reads up to ${PROJECT_VERSION}).`,
    );
  }
  // Files of older format versions would be migrated here, step by step.

  const result = projectSchema.safeParse(data);
  if (!result.success) {
    return {
      project: null,
      issues: result.error.issues.map((issue) =>
        error('project.invalid', `${issue.path.join('.') || 'project'}: ${issue.message}`),
      ),
    };
  }
  const project: Project = result.data;

  const issues: Issue[] = [];
  for (const id of duplicates(project.operations.map((op) => op.id))) {
    issues.push(error('project.duplicateId', `Operation id "${id}" is used more than once.`));
  }
  for (const id of duplicates(project.layers.map((l) => l.id))) {
    issues.push(error('project.duplicateId', `Layer id "${id}" is used more than once.`));
  }
  const operationIds = new Set(project.operations.map((op) => op.id));
  for (const l of project.layers) {
    if (l.operationId !== null && !operationIds.has(l.operationId)) {
      issues.push(
        error(
          'project.unknownOperation',
          `Layer "${l.name}" refers to the unknown operation "${l.operationId}".`,
        ),
      );
    }
  }
  return issues.length > 0 ? { project: null, issues } : { project, issues };
}
