import { describe, expect, it } from 'vitest';
import type { WorkArea } from '../../../src/core/machine/index.ts';
import {
  passLevels,
  validateOperation,
  type DrillOperation,
  type FollowOperation,
} from '../../../src/core/operations/index.ts';

const workArea: WorkArea = {
  x: { min: -200, max: 200 },
  y: { min: -200, max: 200 },
  z: { min: -10, max: 90 },
};

const follow: FollowOperation = {
  kind: 'follow',
  id: 'op1',
  name: 'Engrave',
  toolName: '2 mm end mill',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -1,
  feedXY: 600,
  feedZ: 200,
  stepDown: null,
  travel: { mode: 'rapid' },
};

const drill: DrillOperation = {
  kind: 'drill',
  id: 'op2',
  name: 'Drill',
  toolName: '2 mm drill',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -8,
  feedZ: 150,
  peckDepth: 2,
  travel: { mode: 'feed', feed: 1500 },
};

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateOperation', () => {
  it('accepts valid operations', () => {
    expect(validateOperation(follow, workArea)).toEqual([]);
    expect(validateOperation(drill, workArea)).toEqual([]);
  });

  it('accepts working Z above the surface, e.g. for a dry run', () => {
    expect(validateOperation({ ...follow, workZ: 1 }, workArea)).toEqual([]);
  });

  it('requires safe Z above the surface', () => {
    expect(codes(validateOperation({ ...follow, safeZ: 0, workZ: -1 }, workArea))).toEqual([
      'operation.safeZNotAbove',
    ]);
  });

  it('requires safe Z inside the work area', () => {
    expect(codes(validateOperation({ ...follow, safeZ: 95 }, workArea))).toEqual([
      'operation.safeZOutside',
    ]);
  });

  it('requires working Z below safe Z', () => {
    expect(codes(validateOperation({ ...follow, workZ: 5 }, workArea))).toEqual([
      'operation.workZNotBelowSafeZ',
    ]);
  });

  it('requires working Z inside the work area', () => {
    expect(codes(validateOperation({ ...drill, workZ: -10.5 }, workArea))).toEqual([
      'operation.workZOutside',
    ]);
  });

  it('requires positive feeds, tool diameter and step sizes', () => {
    const broken = validateOperation(
      {
        ...follow,
        feedXY: 0,
        feedZ: -1,
        toolDiameter: 0,
        stepDown: 0,
        travel: { mode: 'feed', feed: 0 },
      },
      workArea,
    );
    expect(codes(broken).sort()).toEqual([
      'operation.feedXY',
      'operation.feedZ',
      'operation.stepDown',
      'operation.toolDiameter',
      'operation.travelFeed',
    ]);
    expect(codes(validateOperation({ ...drill, peckDepth: -1 }, workArea))).toEqual([
      'operation.peckDepth',
    ]);
  });

  it('names the operation in the message', () => {
    const [issue] = validateOperation({ ...follow, safeZ: 95 }, workArea);
    expect(issue?.message).toContain('"Engrave"');
  });
});

describe('passLevels', () => {
  it('is a single pass without a step size', () => {
    expect(passLevels(-3, null)).toEqual([-3]);
  });

  it('divides the depth into steps and ends exactly at the working Z', () => {
    expect(passLevels(-3, 1)).toEqual([-1, -2, -3]);
    expect(passLevels(-3, 2)).toEqual([-2, -3]);
    expect(passLevels(-3, 5)).toEqual([-3]);
  });

  it('does not add a pass because of rounding errors', () => {
    expect(passLevels(-0.3, 0.1)).toHaveLength(3);
  });

  it('is a single pass at or above the surface', () => {
    expect(passLevels(1, 0.5)).toEqual([1]);
    expect(passLevels(0, 0.5)).toEqual([0]);
  });
});
