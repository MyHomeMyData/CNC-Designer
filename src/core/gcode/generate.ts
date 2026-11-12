import { error, hasErrors, warning, type Issue } from '../issues.ts';
import {
  EPSILON,
  inRange,
  validateWorkArea,
  validateWorkpiece,
  workAreaContains,
  type MachineLimits,
  type Range,
  type WorkArea,
  type Workpiece,
} from '../machine/index.ts';
import { validateOperation, type Operation } from '../operations/index.ts';
import {
  allMoves,
  buildToolpath,
  findViolations,
  toolpathStats,
  type RapidRates,
  type Toolpath,
  type ToolpathStats,
} from '../toolpath/index.ts';
import { APP_NAME, APP_VERSION } from '../version.ts';
import { commentText, formatCoordinate, formatDuration, formatFeed } from './format.ts';
import type { Program } from './program.ts';

export interface GcodeOptions {
  readonly workArea: WorkArea;
  readonly workpiece?: Workpiece;
  readonly machineLimits?: MachineLimits;
  readonly rapidRates?: RapidRates;
  /** Shown in the file header. Omit for reproducible output. */
  readonly createdAt?: string;
  /** Extra G-code lines inserted after the setup block / at the very end. */
  readonly extraHeader?: readonly string[];
  readonly extraFooter?: readonly string[];
}

export interface GcodeResult {
  /** The G-code file content, or `null` if there are errors. */
  readonly gcode: string | null;
  readonly issues: readonly Issue[];
  readonly toolpath: Toolpath;
  readonly stats: ToolpathStats;
}

/** At most this many out-of-area moves are listed individually. */
const MAX_VIOLATIONS_LISTED = 5;

function rangeText(range: Range): string {
  return `${formatCoordinate(range.min)} .. ${formatCoordinate(range.max)}`;
}

function boxText(box: { x: Range; y: Range; z: Range }): string {
  return `X ${rangeText(box.x)}  Y ${rangeText(box.y)}  Z ${rangeText(box.z)}`;
}

function uniqueOperations(program: Program): Operation[] {
  return [...new Map(program.jobs.map((job) => [job.operation.id, job.operation])).values()];
}

function validate(program: Program, options: GcodeOptions, toolpath: Toolpath): Issue[] {
  const { workArea, workpiece } = options;
  const issues: Issue[] = [...validateWorkArea(workArea, options.machineLimits)];
  if (workpiece) issues.push(...validateWorkpiece(workpiece, workArea));

  const operations = uniqueOperations(program);
  for (const operation of operations) issues.push(...validateOperation(operation, workArea));

  if (toolpath.sections.length === 0) {
    issues.push(error('program.empty', 'The program contains no moves.'));
  }

  const { end } = program;
  if (end.kind === 'moveTo') {
    const highestSafeZ = Math.max(...operations.map((operation) => operation.safeZ));
    if (operations.length > 0 && end.z < highestSafeZ - EPSILON) {
      issues.push(
        error(
          'program.endBelowSafeZ',
          `End position: Z (${end.z}) must not be below safe Z (${highestSafeZ}).`,
        ),
      );
    }
    if (!workAreaContains(workArea, end)) {
      issues.push(error('program.endOutside', 'End position lies outside the work area.'));
    }
  }

  // Report moves outside the work area only if the work area itself is valid;
  // otherwise the messages would only repeat the underlying problem.
  if (!hasErrors(issues)) {
    const violations = findViolations(toolpath, workArea);
    for (const { sectionLabel, move } of violations.slice(0, MAX_VIOLATIONS_LISTED)) {
      const { x, y, z } = move.to;
      issues.push(
        error(
          'program.outsideWorkArea',
          `"${sectionLabel}": move to X${formatCoordinate(x)} Y${formatCoordinate(y)} ` +
            `Z${formatCoordinate(z)} leaves the work area.`,
        ),
      );
    }
    if (violations.length > MAX_VIOLATIONS_LISTED) {
      issues.push(
        error(
          'program.outsideWorkArea',
          `${violations.length - MAX_VIOLATIONS_LISTED} more moves leave the work area.`,
        ),
      );
    }
  }

  if (workpiece) {
    for (const section of toolpath.sections) {
      const outside = section.moves.some(
        (move) =>
          move.kind === 'work' &&
          !(inRange(workpiece.x, move.to.x) && inRange(workpiece.y, move.to.y)),
      );
      if (outside) {
        issues.push(
          warning('program.outsideWorkpiece', `"${section.label}": works outside the workpiece.`),
        );
      }
    }
  }
  return issues;
}

function header(program: Program, options: GcodeOptions, stats: ToolpathStats): string[] {
  const safeZs = [...new Set(uniqueOperations(program).map((operation) => operation.safeZ))];
  const lines = [
    `${APP_NAME} ${APP_VERSION}`,
    `Program: ${commentText(program.name)}`,
    `Tool: ${commentText(program.toolName)}`,
  ];
  if (options.createdAt) lines.push(`Created: ${commentText(options.createdAt)}`);
  lines.push(
    '',
    'The zero point is set by hand at the machine; this program does not',
    'change it. Z = 0 is the workpiece surface, positive Z is above it.',
    'The tool may stand anywhere inside the work area at program start.',
    '',
    `Work area (allowed): ${boxText(options.workArea)}`,
  );
  if (stats.extent) lines.push(`Used by this program: ${boxText(stats.extent)}`);
  lines.push(
    `Safe Z: ${safeZs.map(formatCoordinate).join(', ')}`,
    `Path length: ${stats.workLength.toFixed(1)} mm working, ` +
      `${stats.otherLength.toFixed(1)} mm positioning`,
    `Estimated time: ${formatDuration(stats.minutes)} (h:mm:ss, without acceleration)`,
  );
  return lines.map((line) => (line ? `; ${line}` : ';'));
}

function body(toolpath: Toolpath): string[] {
  const lines: string[] = [];
  let x: number | null = null;
  let y: number | null = null;
  let z: number | null = null;
  let feed: number | null = null;
  let first = true;

  for (const section of toolpath.sections) {
    lines.push('', `; --- ${commentText(section.label)} ---`);
    for (const move of section.moves) {
      const words: string[] = [move.feed === null ? 'G0' : 'G1'];
      const changed = (previous: number | null, next: number) =>
        previous === null || Math.abs(previous - next) > EPSILON;
      // The very first move only sets Z: the tool position is unknown and
      // X/Y must not move before the tool is at safe Z.
      if (!first) {
        if (changed(x, move.to.x)) words.push(`X${formatCoordinate(move.to.x)}`);
        if (changed(y, move.to.y)) words.push(`Y${formatCoordinate(move.to.y)}`);
        x = move.to.x;
        y = move.to.y;
      }
      if (changed(z, move.to.z)) words.push(`Z${formatCoordinate(move.to.z)}`);
      z = move.to.z;
      first = false;
      if (words.length === 1) continue;
      if (move.feed !== null && move.feed !== feed) {
        words.push(`F${formatFeed(move.feed)}`);
        feed = move.feed;
      }
      lines.push(words.join(' '));
    }
  }
  return lines;
}

/**
 * Generate the G-code file of one program for FluidNC (Grbl dialect).
 *
 * The program uses absolute millimetre coordinates relative to the zero
 * point set at the machine. It contains no homing, no change of coordinate
 * system or offsets, and no spindle commands (the router is switched by hand).
 */
export function generateGcode(program: Program, options: GcodeOptions): GcodeResult {
  const toolpath = buildToolpath(program.jobs, program.end);
  const stats = toolpathStats(toolpath, options.rapidRates);
  const issues = validate(program, options, toolpath);
  if (hasErrors(issues) || allMoves(toolpath).length === 0) {
    return { gcode: null, issues, toolpath, stats };
  }

  const lines = [
    ...header(program, options, stats),
    '',
    'G21 ; millimetres',
    'G90 ; absolute coordinates',
    'G94 ; feed rate in mm/min',
    'G17 ; XY plane',
    ...(options.extraHeader ?? []),
    ...body(toolpath),
    '',
    '; --- End of program ---',
    ...(options.extraFooter ?? []),
  ];
  return { gcode: lines.join('\n') + '\n', issues, toolpath, stats };
}
