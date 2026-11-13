import { describe, expect, it } from 'vitest';
import type { Geometry, Polyline, Vec2 } from '../../../src/core/geometry/index.ts';
import type { WorkArea } from '../../../src/core/machine/index.ts';
import type { DrillOperation, FollowOperation } from '../../../src/core/operations/index.ts';
import {
  allMoves,
  buildToolpath,
  findViolations,
  toolpathStats,
  type Job,
  type Move,
} from '../../../src/core/toolpath/index.ts';

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
  workZ: -5,
  feedZ: 150,
  peckDepth: null,
  travel: { mode: 'rapid' },
};

const line: Polyline = {
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  closed: false,
};

const square: Polyline = {
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  closed: true,
};

function paths(...polylines: Polyline[]): Geometry {
  return { polylines, points: [] };
}

function job(geometry: Geometry, operation: Job['operation'], optimizeOrder = false): Job {
  return { label: 'Layer', geometry, operation, optimizeOrder };
}

/** Compact notation: kind, x, y, z, feed (R = rapid). */
function show(moves: readonly Move[]): string[] {
  return moves.map((m) => `${m.kind} ${m.to.x},${m.to.y},${m.to.z} ${m.feed ?? 'R'}`);
}

describe('buildToolpath: follow', () => {
  it('goes to safe Z first, then to the start, works, and lifts again', () => {
    const toolpath = buildToolpath([job(paths(line), follow)]);
    expect(show(allMoves(toolpath))).toEqual([
      'lift 0,0,5 R',
      'travel 0,0,5 R',
      'plunge 0,0,-1 200',
      'work 10,0,-1 600',
      'lift 10,0,5 R',
    ]);
  });

  it('always commands the start position, even if it is the zero point', () => {
    const moves = allMoves(buildToolpath([job(paths(line), follow)]));
    expect(moves[1]?.kind).toBe('travel');
  });

  it('follows an open path back and forth in several passes without lifting', () => {
    const op = { ...follow, workZ: -3, stepDown: 1.5 };
    expect(show(allMoves(buildToolpath([job(paths(line), op)])))).toEqual([
      'lift 0,0,5 R',
      'travel 0,0,5 R',
      'plunge 0,0,-1.5 200',
      'work 10,0,-1.5 600',
      'plunge 10,0,-3 200',
      'work 0,0,-3 600',
      'lift 0,0,5 R',
    ]);
  });

  it('closes a closed path and goes round again for the next pass', () => {
    const op = { ...follow, workZ: -2, stepDown: 1 };
    expect(show(allMoves(buildToolpath([job(paths(square), op)])))).toEqual([
      'lift 0,0,5 R',
      'travel 0,0,5 R',
      'plunge 0,0,-1 200',
      'work 10,0,-1 600',
      'work 10,10,-1 600',
      'work 0,10,-1 600',
      'work 0,0,-1 600',
      'plunge 0,0,-2 200',
      'work 10,0,-2 600',
      'work 10,10,-2 600',
      'work 0,10,-2 600',
      'work 0,0,-2 600',
      'lift 0,0,5 R',
    ]);
  });

  it('lifts and travels between separate paths', () => {
    const second: Polyline = {
      points: [
        { x: 20, y: 5 },
        { x: 30, y: 5 },
      ],
      closed: false,
    };
    expect(show(allMoves(buildToolpath([job(paths(line, second), follow)]))).slice(4)).toEqual([
      'lift 10,0,5 R',
      'travel 20,5,5 R',
      'plunge 20,5,-1 200',
      'work 30,5,-1 600',
      'lift 30,5,5 R',
    ]);
  });

  it('uses the positioning feed rate for lift and travel moves when given', () => {
    const op: FollowOperation = { ...follow, travel: { mode: 'feed', feed: 1500 } };
    expect(show(allMoves(buildToolpath([job(paths(line), op)])))).toEqual([
      'lift 0,0,5 1500',
      'travel 0,0,5 1500',
      'plunge 0,0,-1 200',
      'work 10,0,-1 600',
      'lift 10,0,5 1500',
    ]);
  });

  it('marks cutting moves with the tool diameter for the preview', () => {
    const moves = allMoves(buildToolpath([job(paths(line), follow)]));
    expect(moves.filter((m) => m.toolDiameter !== undefined).map((m) => m.kind)).toEqual([
      'plunge',
      'work',
    ]);
  });

  it('keeps the design order unless optimisation is switched on', () => {
    const far: Polyline = {
      points: [
        { x: 100, y: 0 },
        { x: 90, y: 0 },
      ],
      closed: false,
    };
    const startOf = (optimize: boolean) =>
      allMoves(buildToolpath([job(paths(far, line), follow, optimize)]))[1]?.to.x;
    expect(startOf(false)).toBe(100);
    expect(startOf(true)).toBe(0);
  });
});

describe('buildToolpath: drill', () => {
  const holes: Geometry = {
    polylines: [],
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ],
  };

  it('drills each hole in one go without pecking', () => {
    expect(show(allMoves(buildToolpath([job(holes, drill)])))).toEqual([
      'lift 10,10,5 R',
      'travel 10,10,5 R',
      'plunge 10,10,-5 150',
      'lift 10,10,5 R',
      'travel 20,10,5 R',
      'plunge 20,10,-5 150',
      'lift 20,10,5 R',
    ]);
  });

  it('pecks: lifts to clear chips and returns to 1 mm above the depth reached', () => {
    const op = { ...drill, peckDepth: 2 };
    const single: Geometry = { polylines: [], points: [{ x: 10, y: 10 }] };
    expect(show(allMoves(buildToolpath([job(single, op)])))).toEqual([
      'lift 10,10,5 R',
      'travel 10,10,5 R',
      'plunge 10,10,-2 150',
      'lift 10,10,5 R',
      'plunge 10,10,-1 R',
      'plunge 10,10,-4 150',
      'lift 10,10,5 R',
      'plunge 10,10,-3 R',
      'plunge 10,10,-5 150',
      'lift 10,10,5 R',
    ]);
  });

  it('marks only the cutting plunges with the tool diameter, not the re-entry', () => {
    const single: Geometry = { polylines: [], points: [{ x: 10, y: 10 }] };
    const moves = allMoves(buildToolpath([job(single, { ...drill, peckDepth: 3 })]));
    expect(moves.filter((m) => m.toolDiameter !== undefined).map((m) => m.to.z)).toEqual([-3, -5]);
  });

  it('ignores paths, and a follow operation ignores points', () => {
    expect(buildToolpath([job(paths(line), drill)]).sections).toEqual([]);
    expect(buildToolpath([job(holes, follow)]).sections).toEqual([]);
  });
});

describe('buildToolpath: several jobs and program end', () => {
  it('produces one labelled section per job with work', () => {
    const toolpath = buildToolpath([
      { ...job(paths(line), follow), label: 'A' },
      { ...job(paths(), follow), label: 'empty' },
      { ...job(paths(square), follow), label: 'B' },
    ]);
    expect(toolpath.sections.map((s) => s.label)).toEqual(['A', 'B']);
  });

  it('adjusts Z before travelling when the next job has another safe Z', () => {
    const higher = { ...follow, safeZ: 12 };
    const toolpath = buildToolpath([job(paths(line), follow), job(paths(square), higher)]);
    expect(show(toolpath.sections[1]?.moves ?? []).slice(0, 3)).toEqual([
      'lift 10,0,12 R',
      'travel 0,0,12 R',
      'plunge 0,0,-1 200',
    ]);
  });

  it('stays at the last position by default', () => {
    const moves = allMoves(buildToolpath([job(paths(line), follow)]));
    expect(show(moves).at(-1)).toBe('lift 10,0,5 R');
  });

  it('moves to the end position: first Z, then X/Y', () => {
    const toolpath = buildToolpath([job(paths(line), follow)], {
      kind: 'moveTo',
      x: -50,
      y: 100,
      z: 30,
    });
    const end = toolpath.sections.at(-1);
    expect(end?.label).toBe('End position');
    expect(show(end?.moves ?? [])).toEqual(['lift 10,0,30 R', 'travel -50,100,30 R']);
  });

  it('has no sections and no end move when there is nothing to do', () => {
    const toolpath = buildToolpath([], { kind: 'moveTo', x: 1, y: 1, z: 10 });
    expect(toolpath.sections).toEqual([]);
  });
});

describe('toolpathStats', () => {
  it('measures lengths, time and extent', () => {
    const stats = toolpathStats(buildToolpath([job(paths(line), follow)]), { xy: 5000, z: 800 });
    expect(stats.workLength).toBe(10);
    // plunge 6 mm + lift 6 mm; the first move to safe Z is not counted
    expect(stats.otherLength).toBe(12);
    expect(stats.minutes).toBeCloseTo(6 / 200 + 10 / 600 + 6 / 800, 9);
    expect(stats.extent).toEqual({
      x: { min: 0, max: 10 },
      y: { min: 0, max: 0 },
      z: { min: -1, max: 5 },
    });
  });

  it('has no extent for an empty toolpath', () => {
    expect(toolpathStats(buildToolpath([])).extent).toBeNull();
  });
});

describe('findViolations', () => {
  const area = (xMax: number): WorkArea => ({
    x: { min: 0, max: xMax },
    y: { min: 0, max: 50 },
    z: { min: -2, max: 20 },
  });

  it('finds nothing inside the work area', () => {
    expect(findViolations(buildToolpath([job(paths(line), follow)]), area(10))).toEqual([]);
  });

  it('reports each move that ends outside', () => {
    const violations = findViolations(buildToolpath([job(paths(line), follow)]), area(5));
    expect(show(violations.map((v) => v.move))).toEqual(['work 10,0,-1 600', 'lift 10,0,5 R']);
    expect(violations[0]?.sectionLabel).toBe('Layer');
  });

  it('accepts values that round to the limit in the G-code file', () => {
    const almost: Polyline = {
      points: [
        { x: -0.0004, y: 0 },
        { x: 10.0004, y: 0 },
      ],
      closed: false,
    };
    expect(findViolations(buildToolpath([job(paths(almost), follow)]), area(10))).toEqual([]);
    const beyond: Polyline = {
      points: [{ x: -0.0006, y: 0 }, line.points[1] as Vec2],
      closed: false,
    };
    expect(findViolations(buildToolpath([job(paths(beyond), follow)]), area(10))).not.toEqual([]);
  });

  it('reports Z outside the work area', () => {
    const deep = { ...follow, workZ: -3 };
    const violations = findViolations(buildToolpath([job(paths(line), deep)]), area(10));
    expect(violations.map((v) => v.move.kind)).toEqual(['plunge', 'work']);
  });
});
