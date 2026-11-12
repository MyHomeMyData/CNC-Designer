import { describe, expect, it } from 'vitest';
import { parseGcode } from '../../../src/core/gcode/index.ts';

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('parseGcode', () => {
  it('reads modal linear moves and keeps coordinates that were not repeated', () => {
    const { moves, issues } = parseGcode('G0 Z5\nG0 X1 Y2\nG1 Z-1 F200\nX10 F600\nY3\n');
    expect(issues).toEqual([]);
    expect(moves).toEqual([
      { rapid: true, x: null, y: null, z: 5, feed: null, line: 1 },
      { rapid: true, x: 1, y: 2, z: 5, feed: null, line: 2 },
      { rapid: false, x: 1, y: 2, z: -1, feed: 200, line: 3 },
      { rapid: false, x: 10, y: 2, z: -1, feed: 600, line: 4 },
      { rapid: false, x: 10, y: 3, z: -1, feed: 600, line: 5 },
    ]);
  });

  it('reads a file in the style Sandify writes', () => {
    const source = [
      ';',
      "; File name: 'Herzen.gcode'",
      '; BEGIN PRE',
      'G90               (Modus: Absolute Positionierung) G94               (Feedrate, default)',
      'G21               (Einheit: Millimeter)',
      '',
      'G1 F2500           (Geschwindigkeit der G1-Bewegungen festlegen.)',
      '; END PRE',
      '; BEGIN LAYER: 0 point',
      'G1 X0.000 Y137.000',
      '; END LAYER: 0 point',
      '; BEGIN CONNECTOR: 0',
      'G1 X54.000 Y138.000',
      '; END CONNECTOR: 0',
    ].join('\r\n');
    const { moves, comments, issues } = parseGcode(source);
    expect(issues).toEqual([]);
    expect(moves).toEqual([
      { rapid: false, x: 0, y: 137, z: null, feed: 2500, line: 10 },
      { rapid: false, x: 54, y: 138, z: null, feed: 2500, line: 13 },
    ]);
    expect(comments.map((c) => c.text)).toContain('BEGIN LAYER: 0 point');
    expect(comments.find((c) => c.text === 'BEGIN CONNECTOR: 0')?.line).toBe(12);
  });

  it('accepts lower case, leading zeros and missing spaces', () => {
    const { moves, issues } = parseGcode('g01x1.5y-2f100\nG00 X.5');
    expect(issues).toEqual([]);
    expect(moves.map((m) => [m.rapid, m.x, m.y])).toEqual([
      [false, 1.5, -2],
      [true, 0.5, -2],
    ]);
  });

  it('rejects codes that change the meaning of coordinates', () => {
    for (const code of ['G91', 'G20', 'G2 X1 Y1 I1 J0', 'G92 X0', 'G10 L20 P0 X0 Y0']) {
      expect(codes(parseGcode(code).issues), code).toContain('gcode.unsupported');
    }
  });

  it('warns about system commands and unknown codes but keeps reading', () => {
    const { moves, issues } = parseGcode('$H\nM8\nG1 X1 F100');
    expect(codes(issues)).toEqual(['gcode.systemCommand', 'gcode.ignored']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(moves).toHaveLength(1);
  });

  it('reports coordinates without a motion mode and unreadable text', () => {
    expect(codes(parseGcode('X1 Y1').issues)).toEqual(['gcode.noMotionMode']);
    expect(codes(parseGcode('G1 X1 ???').issues)).toEqual(['gcode.syntax']);
  });
});
