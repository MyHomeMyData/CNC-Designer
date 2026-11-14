import { z } from 'zod';
import { parseGcode } from '../../core/gcode/index.ts';
import type { Geometry, Polyline, Vec2 } from '../../core/geometry/index.ts';

const sectionSchema = z.strictObject({
  /** A layer of the design, or the way from one layer to the next. */
  kind: z.enum(['layer', 'connector']),
  /** Name shown to the user. */
  name: z.string(),
  /** Sections that are switched off are not worked; the tool travels above them. */
  enabled: z.boolean(),
  /** Each path as x1, y1, x2, y2, … in mm, in the coordinates of the file. */
  paths: z.array(z.array(z.number().finite())),
});

const schema = z.strictObject({
  /** Name of the imported file, for display. */
  fileName: z.string(),
  /** The parts of the file in its own order. Only the paths are kept, not the file. */
  sections: z.array(sectionSchema),
  /** What was found while reading the file, as messages for the user. */
  notes: z.array(z.string()),
});

export type GcodeSection = z.infer<typeof sectionSchema>;
export type GcodeParams = z.infer<typeof schema>;

export const EMPTY_GCODE_PARAMS: GcodeParams = { fileName: '', sections: [], notes: [] };

// Checking a large file takes time, and parameters are immutable objects
// that are replaced on every change: one check per object is enough.
const checked = new WeakMap<object, GcodeParams | null>();

export function parseGcodeParams(raw: unknown): GcodeParams | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if (!checked.has(raw)) {
    const result = schema.safeParse(raw);
    checked.set(raw, result.success ? result.data : null);
  }
  return checked.get(raw) ?? null;
}

/** How many problems of the file are spelled out before the rest is counted. */
const NOTE_LIMIT = 4;

const round = (value: number) => Math.round(value * 1000) / 1000 + 0;

/**
 * Turn the text of a G-code file into the parts of a layer. Only X and Y
 * of the moves are used: `G1` draws from where the last move ended, `G0`
 * starts a new path. Sections marked by Sandify become parts that can be
 * switched on and off; a file without marks is a single part.
 */
export function readGcodeFile(fileName: string, text: string): GcodeParams {
  const parsed = parseGcode(text);
  const notes: string[] = [];
  const messages = [...new Set(parsed.issues.map((issue) => issue.message))];
  notes.push(...messages.slice(0, NOTE_LIMIT));
  if (messages.length > NOTE_LIMIT) {
    notes.push(`… and ${messages.length - NOTE_LIMIT} more remarks of this kind.`);
  }
  // A line that cannot be read gives no move, and the rest of the file still
  // means what it says. Anything else would put the paths in the wrong place.
  const unreadable = (issue: { code: string }) => issue.code === 'gcode.syntax';
  if (parsed.issues.some((issue) => issue.severity === 'error' && !unreadable(issue))) {
    notes.unshift('This file cannot be imported:');
    return { fileName, sections: [], notes };
  }
  if (parsed.issues.some(unreadable)) notes.push('Lines that could not be read were left out.');

  // The marked section each move belongs to, or -1.
  const owner = new Int32Array(parsed.moves.length).fill(-1);
  parsed.sections.forEach((section, index) => {
    owner.fill(index, section.firstMove, section.firstMove + section.moveCount);
  });

  const sections: GcodeSection[] = [];
  let current: { owner: number; section: GcodeSection } | null = null;
  let path: number[] | null = null;
  let position: Vec2 | null = null;
  let usesZ = false;

  const endPath = () => {
    if (path && path.length >= 4 && current) current.section.paths.push(path);
    path = null;
  };

  parsed.moves.forEach((move, index) => {
    if (move.z !== null) usesZ = true;
    if (move.x === null || move.y === null) return;
    const target = { x: round(move.x), y: round(move.y) };
    const moveOwner = owner[index] as number;
    if (!current || current.owner !== moveOwner) {
      endPath();
      const marked = parsed.sections[moveOwner];
      current = {
        owner: moveOwner,
        section: {
          kind: marked?.kind ?? 'layer',
          name: !marked
            ? 'Unmarked moves'
            : marked.kind === 'connector'
              ? `Connector ${marked.index}`
              : marked.name
                ? `${marked.index} ${marked.name}`
                : `Layer ${marked.index}`,
          // The way between two layers is not part of the picture.
          enabled: marked?.kind !== 'connector',
          paths: [],
        },
      };
      sections.push(current.section);
    }
    if (move.rapid) {
      endPath();
    } else {
      // A working move draws from wherever the tool is.
      path ??= position ? [position.x, position.y] : [];
      const length: number = path.length;
      if (length < 2 || path[length - 2] !== target.x || path[length - 1] !== target.y) {
        path.push(target.x, target.y);
      }
    }
    position = target;
  });
  endPath();

  const kept = sections.filter((section) => section.paths.length > 0);
  if (kept.length === 0) notes.push('The file contains no paths.');
  if (usesZ) notes.push('Z values of the file are not used; heights come from the operation.');
  return { fileName, sections: kept, notes };
}

/** Number of points in a section. */
export function sectionPoints(section: GcodeSection): number {
  return section.paths.reduce((sum, path) => sum + path.length / 2, 0);
}

/**
 * The paths of the sections that are switched on. Where one ends on the
 * point at which the next begins, they are one path, so the tool does not
 * lift in between.
 */
export function generateGcodeImport(params: GcodeParams): Geometry {
  const polylines: { points: Vec2[]; closed: false }[] = [];
  // A section that is switched off interrupts the path.
  let joinable = false;
  for (const section of params.sections) {
    if (!section.enabled) {
      joinable = false;
      continue;
    }
    for (const path of section.paths) {
      const points: Vec2[] = [];
      for (let i = 0; i + 1 < path.length; i += 2) {
        points.push({ x: path[i] as number, y: path[i + 1] as number });
      }
      const first = points[0];
      const last = polylines[polylines.length - 1];
      const end = last?.points[last.points.length - 1];
      if (joinable && last && first && end && end.x === first.x && end.y === first.y) {
        last.points.push(...points.slice(1));
      } else if (points.length > 1) {
        polylines.push({ points, closed: false });
      }
      joinable = true;
    }
  }
  return { polylines: polylines satisfies Polyline[], points: [] };
}
