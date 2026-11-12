import {
  DEFAULT_MACHINE_LIMITS,
  DEFAULT_WORK_AREA,
  workpieceFromWorkArea,
} from '../machine/index.ts';
import type { DrillOperation, FollowOperation } from '../operations/index.ts';
import { DEFAULT_RAPID_RATES } from '../toolpath/index.ts';
import { PROJECT_FORMAT, PROJECT_VERSION, type Project } from './types.ts';

/**
 * Starting values for new operations. They are deliberately cautious and
 * must be adapted to tool and material.
 */
export const DEFAULT_FOLLOW_OPERATION: FollowOperation = {
  kind: 'follow',
  id: 'engrave',
  name: 'Engrave',
  toolName: 'End mill 2 mm',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -1,
  feedXY: 600,
  feedZ: 200,
  stepDown: 1,
  travel: { mode: 'rapid' },
};

export const DEFAULT_DRILL_OPERATION: DrillOperation = {
  kind: 'drill',
  id: 'drill',
  name: 'Drill',
  toolName: 'Drill 2 mm',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -5,
  feedZ: 150,
  peckDepth: 2,
  travel: { mode: 'rapid' },
};

export function createDefaultProject(): Project {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: 'Untitled',
    machine: { limits: DEFAULT_MACHINE_LIMITS, rapidRates: DEFAULT_RAPID_RATES },
    workArea: DEFAULT_WORK_AREA,
    workpiece: workpieceFromWorkArea(DEFAULT_WORK_AREA),
    operations: [DEFAULT_FOLLOW_OPERATION, DEFAULT_DRILL_OPERATION],
    layers: [],
    end: { kind: 'stay' },
  };
}
