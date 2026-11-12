import { error, warning, type Issue } from '../issues.ts';

/** A closed interval in mm. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * The box a program is allowed to move in, in program coordinates.
 *
 * Program coordinates are relative to the tool zero point, which the
 * operator sets by hand at the machine. Z = 0 is the top surface of the
 * workpiece, positive Z is above it. The point (0, 0, 0) must lie inside
 * the work area.
 *
 * The app cannot know where the zero point sits on the real machine, so it
 * can only check that the box is not larger than the machine.
 */
export interface WorkArea {
  readonly x: Range;
  readonly y: Range;
  readonly z: Range;
}

/** Maximum extent of the work area per axis in mm (MPCNC of this project). */
export interface MachineLimits {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const DEFAULT_MACHINE_LIMITS: MachineLimits = { x: 800, y: 600, z: 150 };

export const DEFAULT_WORK_AREA: WorkArea = {
  x: { min: 0, max: 800 },
  y: { min: 0, max: 600 },
  z: { min: -20, max: 50 },
};

/**
 * The piece of material, used for display and for warnings. Its top surface
 * is always at Z = 0. It may differ from the work area.
 */
export interface Workpiece {
  readonly x: Range;
  readonly y: Range;
  /** Thickness in mm; the workpiece spans Z from -thickness to 0. */
  readonly thickness: number;
}

/** A workpiece that fills the work area in X/Y and reaches down to its lowest Z. */
export function workpieceFromWorkArea(workArea: WorkArea): Workpiece {
  return { x: workArea.x, y: workArea.y, thickness: Math.abs(workArea.z.min) };
}

export function rangeSize(range: Range): number {
  return range.max - range.min;
}

/** Tolerance for comparisons, well below the resolution of the machine. */
export const EPSILON = 1e-6;

export function inRange(range: Range, value: number): boolean {
  return value >= range.min - EPSILON && value <= range.max + EPSILON;
}

export function workAreaContains(
  workArea: WorkArea,
  point: { x: number; y: number; z: number },
): boolean {
  return (
    inRange(workArea.x, point.x) && inRange(workArea.y, point.y) && inRange(workArea.z, point.z)
  );
}

const AXES = ['x', 'y', 'z'] as const;

export function validateWorkArea(
  workArea: WorkArea,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): Issue[] {
  const issues: Issue[] = [];
  for (const axis of AXES) {
    const range = workArea[axis];
    const name = axis.toUpperCase();
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      issues.push(error('workArea.notFinite', `Work area ${name}: limits must be numbers.`));
      continue;
    }
    if (range.min >= range.max) {
      issues.push(
        error('workArea.empty', `Work area ${name}: minimum must be smaller than maximum.`),
      );
      continue;
    }
    if (!inRange(range, 0)) {
      issues.push(
        error(
          'workArea.originOutside',
          `Work area ${name}: the zero point must lie inside ` +
            `(minimum ≤ 0 ≤ maximum), got ${range.min} to ${range.max}.`,
        ),
      );
    }
    if (rangeSize(range) > limits[axis] + EPSILON) {
      issues.push(
        error(
          'workArea.exceedsMachine',
          `Work area ${name}: extent ${rangeSize(range)} mm exceeds ` +
            `the machine travel of ${limits[axis]} mm.`,
        ),
      );
    }
  }
  return issues;
}

export function validateWorkpiece(workpiece: Workpiece, workArea: WorkArea): Issue[] {
  const issues: Issue[] = [];
  for (const axis of ['x', 'y'] as const) {
    const range = workpiece[axis];
    const name = axis.toUpperCase();
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      issues.push(error('workpiece.notFinite', `Workpiece ${name}: limits must be numbers.`));
    } else if (range.min >= range.max) {
      issues.push(
        error('workpiece.empty', `Workpiece ${name}: minimum must be smaller than maximum.`),
      );
    } else if (
      range.min < workArea[axis].min - EPSILON ||
      range.max > workArea[axis].max + EPSILON
    ) {
      issues.push(
        warning(
          'workpiece.outsideWorkArea',
          `Workpiece ${name}: extends beyond the work area and cannot be reached there.`,
        ),
      );
    }
  }
  if (!Number.isFinite(workpiece.thickness) || workpiece.thickness <= 0) {
    issues.push(error('workpiece.thickness', 'Workpiece thickness must be greater than zero.'));
  }
  return issues;
}
