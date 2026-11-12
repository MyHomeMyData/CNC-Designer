import type { Polyline } from '../../../src/core/geometry/index.ts';
import type { Program } from '../../../src/core/gcode/index.ts';
import type { WorkArea } from '../../../src/core/machine/index.ts';
import type { DrillOperation, FollowOperation } from '../../../src/core/operations/index.ts';

export const workArea: WorkArea = {
  x: { min: -200, max: 200 },
  y: { min: -200, max: 200 },
  z: { min: -10, max: 90 },
};

export const engrave: FollowOperation = {
  kind: 'follow',
  id: 'engrave',
  name: 'Engrave',
  toolName: '2 mm end mill',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -2,
  feedXY: 600,
  feedZ: 200,
  stepDown: 1,
  travel: { mode: 'rapid' },
};

export const drill: DrillOperation = {
  kind: 'drill',
  id: 'drill',
  name: 'Drill',
  toolName: '2 mm drill',
  toolDiameter: 2,
  safeZ: 5,
  workZ: -8,
  feedZ: 150,
  peckDepth: null,
  travel: { mode: 'feed', feed: 1500 },
};

export const square: Polyline = {
  points: [
    { x: -50, y: -50 },
    { x: 50, y: -50 },
    { x: 50, y: 50 },
    { x: -50, y: 50 },
  ],
  closed: true,
};

export const diagonal: Polyline = {
  points: [
    { x: -40, y: -40 },
    { x: 40, y: 40 },
  ],
  closed: false,
};

/** A square in two passes and a diagonal line, engraved with one tool. */
export const sampleProgram: Program = {
  name: 'Sample: Quadrat für Jürgen',
  toolName: engrave.toolName,
  jobs: [
    {
      label: 'Square',
      geometry: { polylines: [square], points: [] },
      operation: engrave,
      optimizeOrder: false,
    },
    {
      label: 'Diagonal',
      geometry: { polylines: [diagonal], points: [] },
      operation: { ...engrave, id: 'shallow', workZ: -0.5, stepDown: null },
      optimizeOrder: false,
    },
  ],
  end: { kind: 'stay' },
};
