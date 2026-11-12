import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  commentText,
  formatCoordinate,
  formatDuration,
  formatFeed,
  generateGcode,
  groupJobsByTool,
  parseGcode,
  type Program,
} from '../../../src/core/gcode/index.ts';
import { allMoves, type Job } from '../../../src/core/toolpath/index.ts';
import { drill, engrave, sampleProgram, workArea } from './sample.ts';

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

function codeLines(gcode: string): string[] {
  return gcode
    .split('\n')
    .map((line) => line.replace(/;.*$/, '').trim())
    .filter(Boolean);
}

const holes: Job = {
  label: 'Holes',
  geometry: {
    polylines: [],
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ],
  },
  operation: drill,
  optimizeOrder: false,
};

describe('generateGcode', () => {
  it('matches the reference file', () => {
    const expected = readFileSync(new URL('./fixtures/sample.gcode', import.meta.url), 'utf8');
    const result = generateGcode(sampleProgram, { workArea });
    expect(result.issues).toEqual([]);
    expect(result.gcode).toBe(expected);
  });

  it('starts with the setup block and never touches the zero point', () => {
    const gcode = generateGcode(sampleProgram, { workArea }).gcode ?? '';
    expect(codeLines(gcode).slice(0, 4)).toEqual(['G21', 'G90', 'G94', 'G17']);
    expect(gcode).not.toMatch(/G10|G92|G54|\$H|G28|M3|M5/);
  });

  it('first moves to safe Z without X/Y, then to the start position', () => {
    const lines = codeLines(generateGcode(sampleProgram, { workArea }).gcode ?? '');
    expect(lines.slice(4, 6)).toEqual(['G0 Z5.000', 'G0 X-50.000 Y-50.000']);
  });

  it('commands X and Y of the start position even at the zero point', () => {
    const program: Program = {
      ...sampleProgram,
      jobs: [
        {
          label: 'From zero',
          geometry: {
            polylines: [
              {
                points: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                ],
                closed: false,
              },
            ],
            points: [],
          },
          operation: engrave,
          optimizeOrder: false,
        },
      ],
    };
    const lines = codeLines(generateGcode(program, { workArea }).gcode ?? '');
    expect(lines[5]).toBe('G0 X0.000 Y0.000');
  });

  it('ends at safe Z at the last position by default', () => {
    const lines = codeLines(generateGcode(sampleProgram, { workArea }).gcode ?? '');
    expect(lines.at(-1)).toBe('G0 Z5.000');
  });

  it('moves to a given end position: Z first, then X/Y', () => {
    const program: Program = { ...sampleProgram, end: { kind: 'moveTo', x: 0, y: 100, z: 40 } };
    const lines = codeLines(generateGcode(program, { workArea }).gcode ?? '');
    expect(lines.slice(-2)).toEqual(['G0 Z40.000', 'G0 X0.000 Y100.000']);
  });

  it('uses G1 with the positioning feed rate when one is given', () => {
    const program: Program = { ...sampleProgram, toolName: drill.toolName, jobs: [holes] };
    expect(codeLines(generateGcode(program, { workArea }).gcode ?? '').slice(4)).toEqual([
      'G1 Z5.000 F1500',
      'G1 X10.000 Y10.000',
      'G1 Z-8.000 F150',
      'G1 Z5.000 F1500',
      'G1 X20.000',
      'G1 Z-8.000 F150',
      'G1 Z5.000 F1500',
    ]);
  });

  it('documents the allowed and the used range in the header', () => {
    const gcode = generateGcode(sampleProgram, { workArea, createdAt: '2026-11-12 21:00' }).gcode;
    expect(gcode).toContain(
      '; Work area (allowed): X -200.000 .. 200.000  Y -200.000 .. 200.000  Z -10.000 .. 90.000',
    );
    expect(gcode).toContain(
      '; Used by this program: X -50.000 .. 50.000  Y -50.000 .. 50.000  Z -2.000 .. 5.000',
    );
    expect(gcode).toContain('; Created: 2026-11-12 21:00');
  });

  it('inserts extra header and footer lines', () => {
    const gcode =
      generateGcode(sampleProgram, { workArea, extraHeader: ['M0'], extraFooter: ['M30'] }).gcode ??
      '';
    const lines = codeLines(gcode);
    expect(lines[4]).toBe('M0');
    expect(lines.at(-1)).toBe('M30');
  });

  it('reads back as exactly the moves of the toolpath', () => {
    const result = generateGcode(sampleProgram, { workArea });
    const parsed = parseGcode(result.gcode ?? '');
    expect(parsed.issues).toEqual([]);
    const moves = allMoves(result.toolpath);
    expect(parsed.moves).toHaveLength(moves.length);
    moves.forEach((move, index) => {
      const read = parsed.moves[index];
      // X/Y are unknown until the first travel move.
      if (index > 0) {
        expect(read?.x).toBeCloseTo(move.to.x, 3);
        expect(read?.y).toBeCloseTo(move.to.y, 3);
      } else {
        expect(read?.x).toBeNull();
        expect(read?.y).toBeNull();
      }
      expect(read?.z).toBeCloseTo(move.to.z, 3);
      expect(read?.rapid).toBe(move.feed === null);
      expect(read?.feed).toBe(move.feed);
    });
  });
});

describe('generateGcode: problems', () => {
  it('refuses to export moves outside the work area and says where', () => {
    const small = { ...workArea, x: { min: -40, max: 40 } };
    const result = generateGcode(sampleProgram, { workArea: small });
    expect(result.gcode).toBeNull();
    expect(new Set(codes(result.issues))).toEqual(new Set(['program.outsideWorkArea']));
    expect(result.issues[0]?.message).toContain('"Square"');
    expect(result.issues[0]?.message).toContain('X-50.000');
    // five moves listed, the rest summarised
    expect(result.issues).toHaveLength(6);
  });

  it('refuses a working depth below the work area', () => {
    const shallow = { ...workArea, z: { min: -1, max: 90 } };
    const result = generateGcode(sampleProgram, { workArea: shallow });
    expect(result.gcode).toBeNull();
    expect(codes(result.issues)).toContain('operation.workZOutside');
  });

  it('refuses an invalid work area', () => {
    const result = generateGcode(sampleProgram, {
      workArea: { ...workArea, x: { min: 10, max: 200 } },
    });
    expect(result.gcode).toBeNull();
    expect(codes(result.issues)).toEqual(['workArea.originOutside']);
  });

  it('refuses an empty program', () => {
    const result = generateGcode({ ...sampleProgram, jobs: [] }, { workArea });
    expect(result.gcode).toBeNull();
    expect(codes(result.issues)).toEqual(['program.empty']);
  });

  it('refuses an end position below safe Z or outside the work area', () => {
    const low: Program = { ...sampleProgram, end: { kind: 'moveTo', x: 0, y: 0, z: 2 } };
    expect(codes(generateGcode(low, { workArea }).issues)).toEqual(['program.endBelowSafeZ']);
    const outside: Program = { ...sampleProgram, end: { kind: 'moveTo', x: 500, y: 0, z: 10 } };
    expect(codes(generateGcode(outside, { workArea }).issues)).toContain('program.endOutside');
  });

  it('only warns when work happens outside the workpiece', () => {
    const workpiece = { x: { min: -45, max: 45 }, y: { min: -45, max: 45 }, thickness: 10 };
    const result = generateGcode(sampleProgram, { workArea, workpiece });
    expect(result.gcode).not.toBeNull();
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        code: 'program.outsideWorkpiece',
        message: '"Square": works outside the workpiece.',
      },
    ]);
  });
});

describe('groupJobsByTool', () => {
  it('creates one program per tool in order of first use', () => {
    const squareJob = sampleProgram.jobs[0] as Job;
    const diagonalJob = sampleProgram.jobs[1] as Job;
    const programs = groupJobsByTool('Project', [squareJob, holes, diagonalJob], { kind: 'stay' });
    expect(programs.map((p) => p.toolName)).toEqual(['2 mm end mill', '2 mm drill']);
    expect(programs[0]?.jobs.map((j) => j.label)).toEqual(['Square', 'Diagonal']);
    expect(programs[1]?.jobs.map((j) => j.label)).toEqual(['Holes']);
    expect(programs[0]?.name).toBe('Project');
  });

  it('returns no programs without jobs', () => {
    expect(groupJobsByTool('Project', [], { kind: 'stay' })).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats coordinates with three decimals and no negative zero', () => {
    expect(formatCoordinate(1.23456)).toBe('1.235');
    expect(formatCoordinate(-0.0001)).toBe('0.000');
    expect(formatCoordinate(-12)).toBe('-12.000');
  });

  it('formats feeds without needless decimals', () => {
    expect(formatFeed(600)).toBe('600');
    expect(formatFeed(12.5)).toBe('12.5');
  });

  it('makes comments ASCII-only and single-line', () => {
    expect(commentText('Größe\n für  Jürgen ✓')).toBe('Groesse fuer Juergen ?');
  });

  it('formats durations', () => {
    expect(formatDuration(1.6)).toBe('0:01:36');
    expect(formatDuration(125.5)).toBe('2:05:30');
  });
});
