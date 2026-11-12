import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_AREA,
  validateWorkArea,
  validateWorkpiece,
  workAreaContains,
  workpieceFromWorkArea,
  type WorkArea,
} from '../../../src/core/machine/index.ts';

const centered: WorkArea = {
  x: { min: -200, max: 200 },
  y: { min: -200, max: 200 },
  z: { min: -10, max: 90 },
};

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateWorkArea', () => {
  it('accepts the default and a centered work area', () => {
    expect(validateWorkArea(DEFAULT_WORK_AREA)).toEqual([]);
    expect(validateWorkArea(centered)).toEqual([]);
  });

  it('accepts the full machine travel', () => {
    const full: WorkArea = {
      x: { min: -400, max: 400 },
      y: { min: 0, max: 600 },
      z: { min: -50, max: 100 },
    };
    expect(validateWorkArea(full)).toEqual([]);
  });

  it('rejects a work area that does not contain the zero point', () => {
    const issues = validateWorkArea({ ...centered, x: { min: 100, max: 300 } });
    expect(codes(issues)).toEqual(['workArea.originOutside']);
    expect(issues[0]?.severity).toBe('error');
  });

  it('accepts the zero point on the boundary', () => {
    expect(validateWorkArea({ ...centered, z: { min: 0, max: 50 } })).toEqual([]);
  });

  it('rejects an extent larger than the machine', () => {
    expect(codes(validateWorkArea({ ...centered, x: { min: -401, max: 400 } }))).toEqual([
      'workArea.exceedsMachine',
    ]);
    expect(codes(validateWorkArea({ ...centered, z: { min: -51, max: 100 } }))).toEqual([
      'workArea.exceedsMachine',
    ]);
  });

  it('rejects empty or reversed ranges', () => {
    expect(codes(validateWorkArea({ ...centered, y: { min: 10, max: -10 } }))).toEqual([
      'workArea.empty',
    ]);
    expect(codes(validateWorkArea({ ...centered, y: { min: 0, max: 0 } }))).toEqual([
      'workArea.empty',
    ]);
  });

  it('rejects values that are not numbers', () => {
    expect(codes(validateWorkArea({ ...centered, x: { min: NaN, max: 10 } }))).toEqual([
      'workArea.notFinite',
    ]);
  });

  it('reports every axis with a problem', () => {
    const issues = validateWorkArea({
      x: { min: 5, max: 10 },
      y: { min: 5, max: 10 },
      z: { min: 5, max: 10 },
    });
    expect(issues).toHaveLength(3);
  });
});

describe('workAreaContains', () => {
  it('includes the boundary and excludes points outside', () => {
    expect(workAreaContains(centered, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(workAreaContains(centered, { x: -200, y: 200, z: 90 })).toBe(true);
    expect(workAreaContains(centered, { x: 200.01, y: 0, z: 0 })).toBe(false);
    expect(workAreaContains(centered, { x: 0, y: 0, z: -10.5 })).toBe(false);
  });
});

describe('workpiece', () => {
  it('defaults to the work area in X/Y with the top at Z = 0', () => {
    expect(workpieceFromWorkArea(centered)).toEqual({
      x: centered.x,
      y: centered.y,
      thickness: 10,
    });
  });

  it('accepts a workpiece inside the work area', () => {
    const piece = { x: { min: -100, max: 100 }, y: { min: 0, max: 150 }, thickness: 18 };
    expect(validateWorkpiece(piece, centered)).toEqual([]);
  });

  it('warns, but does not fail, when the workpiece extends beyond the work area', () => {
    const piece = { x: { min: -300, max: 100 }, y: { min: 0, max: 150 }, thickness: 18 };
    const issues = validateWorkpiece(piece, centered);
    expect(codes(issues)).toEqual(['workpiece.outsideWorkArea']);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('rejects a non-positive thickness and reversed ranges', () => {
    const piece = { x: { min: 10, max: 0 }, y: { min: 0, max: 150 }, thickness: 0 };
    expect(codes(validateWorkpiece(piece, centered))).toEqual([
      'workpiece.empty',
      'workpiece.thickness',
    ]);
  });
});
