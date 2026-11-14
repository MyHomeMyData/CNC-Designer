import { describe, expect, it } from 'vitest';
import { parseGcode } from '../../src/core/gcode/index.ts';
import {
  generateGcodeImport,
  parseGcodeParams,
  readGcodeFile,
  sectionPoints,
} from '../../src/modules/gcode/model.ts';

/** A start block as a sand table needs it: nothing of it may reach the mill. */
const PRE = [
  ';',
  "; File name: 'test'",
  '; File type: gcode',
  ';',
  '; BEGIN PRE',
  'G90               (absolute) G94               (units per minute)',
  '$H                (homing)',
  'G10 L20 P0 X0 Y0  (set offsets)',
  'G1 F500',
  '; END PRE',
  '',
].join('\n');

const LAYERED = [
  PRE,
  '; BEGIN LAYER: 0 point',
  'G1 X20.000 Y2.000',
  '; END LAYER: 0 point',
  '',
  '; BEGIN CONNECTOR: 0',
  'G1 X20.000 Y2.000',
  'G1 X10.000 Y10.000',
  '; END CONNECTOR: 0',
  '; BEGIN LAYER: 1 star',
  'G1 X10.000 Y10.000',
  'G1 X10.000 Y10.000',
  'G1 X30.000 Y10.000',
  'G1 X20.000 Y30.000',
  '; END LAYER: 1 star',
  '; BEGIN CONNECTOR: 1',
  'G1 X20.000 Y30.000',
  'G1 X50.000 Y30.000',
  '; END CONNECTOR: 1',
  '; BEGIN LAYER: 2',
  'G1 X50.000 Y30.000',
  'G1 X50.000 Y50.000',
  '; END LAYER: 2',
  '; BEGIN POST',
  'G1 X0 Y0',
  '; END POST',
  '',
].join('\n');

describe('structure comments in G-code', () => {
  it('skip the start and end code and give the sections', () => {
    const parsed = parseGcode(LAYERED);
    expect(parsed.issues).toEqual([]);
    expect(parsed.moves).toHaveLength(11);
    expect(parsed.sections).toEqual([
      { kind: 'layer', index: 0, name: 'point', firstMove: 0, moveCount: 1 },
      { kind: 'connector', index: 0, name: '', firstMove: 1, moveCount: 2 },
      { kind: 'layer', index: 1, name: 'star', firstMove: 3, moveCount: 4 },
      { kind: 'connector', index: 1, name: '', firstMove: 7, moveCount: 2 },
      { kind: 'layer', index: 2, name: '', firstMove: 9, moveCount: 2 },
    ]);
  });

  it('are not needed: a file without them has no sections', () => {
    const parsed = parseGcode(`${PRE}G1 X1 Y1\nG1 X2 Y2\n`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.sections).toEqual([]);
    expect(parsed.moves).toHaveLength(2);
  });

  it('keep an empty section and one that is not closed', () => {
    const parsed = parseGcode(
      '; BEGIN LAYER: 1 star\n; END LAYER: 1 star\n; BEGIN LAYER: 2 x\nG1 X1 Y1\n',
    );
    expect(parsed.sections.map((section) => section.moveCount)).toEqual([0, 1]);
  });
});

describe('G-code import', () => {
  it('turns layers and connectors into parts, connectors switched off', () => {
    const params = readGcodeFile('test.gcode', LAYERED);
    expect(params.notes).toEqual([]);
    expect(params.sections.map((section) => [section.kind, section.name, section.enabled])).toEqual(
      [
        // "0 point" is a single point and gives no path
        ['connector', 'Connector 0', false],
        ['layer', '1 star', true],
        ['connector', 'Connector 1', false],
        ['layer', 'Layer 2', true],
      ],
    );
    // repeated points are dropped
    expect(params.sections[1]?.paths).toEqual([[10, 10, 30, 10, 20, 30]]);
    expect(params.sections.map(sectionPoints)).toEqual([2, 3, 2, 2]);
    expect(parseGcodeParams(params)).toEqual(params);
  });

  it('works the parts that are switched on; connectors join them into one path', () => {
    const params = readGcodeFile('test.gcode', LAYERED);
    expect(generateGcodeImport(params).polylines.map((line) => line.points)).toEqual([
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 20, y: 30 },
      ],
      [
        { x: 50, y: 30 },
        { x: 50, y: 50 },
      ],
    ]);

    const all = {
      ...params,
      sections: params.sections.map((section) => ({ ...section, enabled: true })),
    };
    const joined = generateGcodeImport(all).polylines;
    expect(joined).toHaveLength(1);
    expect(joined[0]?.points).toHaveLength(6);
    expect(joined[0]?.points[0]).toEqual({ x: 20, y: 2 });

    // without the star, the two connectors do not touch
    const without = {
      ...all,
      sections: all.sections.map((section, index) => ({ ...section, enabled: index !== 1 })),
    };
    expect(generateGcodeImport(without).polylines).toHaveLength(2);
  });

  it('reads a file without marks as one part', () => {
    const params = readGcodeFile('old.gcode', `${PRE}G1 X0 Y5\nG1 X0 Y5\nG1 X7 Y5\nG1 X7 Y0\n`);
    expect(params.sections).toEqual([
      { kind: 'layer', name: 'Unmarked moves', enabled: true, paths: [[0, 5, 7, 5, 7, 0]] },
    ]);
  });

  it('starts a new path at every rapid move and ignores Z', () => {
    const params = readGcodeFile(
      'mill.nc',
      'G0 Z5\nG0 X1 Y1\nG1 Z-1 F100\nG1 X5 Y1 F600\nG0 Z5\nG0 X1 Y3\nG1 Z-1\nG1 X5 Y3\nG0 Z5\n',
    );
    expect(params.sections.map((section) => section.paths)).toEqual([
      [
        [1, 1, 5, 1],
        [1, 3, 5, 3],
      ],
    ]);
    expect(params.notes).toEqual([
      'Z values of the file are not used; heights come from the operation.',
    ]);
  });

  it('refuses files it would read wrongly', () => {
    const params = readGcodeFile('arc.nc', 'G0 X0 Y0\nG2 X10 Y0 I5 J0\n');
    expect(params.sections).toEqual([]);
    expect(params.notes[0]).toBe('This file cannot be imported:');
    expect(params.notes[1]).toMatch(/G2 is not supported/);
    expect(generateGcodeImport(params).polylines).toEqual([]);
  });

  it('leaves out a line it cannot read and says so', () => {
    const params = readGcodeFile('nan.gcode', 'G1 X1 Y1\nG1 X5 Y1\nG1 XNaN YNaN\nG1 X5 Y5\n');
    expect(params.sections[0]?.paths).toEqual([[1, 1, 5, 1, 5, 5]]);
    expect(params.notes).toEqual([
      'Line 3: cannot read "XNAN YNAN".',
      'Lines that could not be read were left out.',
    ]);
  });

  it('says so if a file has no paths, and rejects damaged parameters', () => {
    expect(readGcodeFile('empty.nc', '; nothing\n').notes).toEqual(['The file contains no paths.']);
    expect(
      parseGcodeParams({ fileName: 'x', sections: [{ kind: 'layer' }], notes: [] }),
    ).toBeNull();
    expect(parseGcodeParams(null)).toBeNull();
  });
});
