import { error, warning, type Issue } from '../issues.ts';

/** A linear move read from G-code. Coordinates not yet commanded are `null`. */
export interface ParsedMove {
  readonly rapid: boolean;
  readonly x: number | null;
  readonly y: number | null;
  readonly z: number | null;
  /** Feed rate in effect, `null` for rapid moves or if none was set yet. */
  readonly feed: number | null;
  /** 1-based line number in the source. */
  readonly line: number;
}

export interface ParsedComment {
  readonly text: string;
  readonly line: number;
}

export interface ParsedGcode {
  readonly moves: readonly ParsedMove[];
  readonly comments: readonly ParsedComment[];
  readonly issues: readonly Issue[];
}

/** Codes that are accepted and have no effect on the parsed moves. */
const IGNORED = new Set(['G17', 'G21', 'G90', 'G94', 'G54', 'M0', 'M1', 'M2', 'M3', 'M5', 'M30']);
/** Codes that would make the parsed coordinates wrong. */
const UNSUPPORTED = new Set(['G2', 'G3', 'G20', 'G91', 'G92', 'G10', 'G28', 'G30', 'G53']);

function normalizeCode(letter: string, value: string): string {
  // "G01" and "G1" are the same code; "G38.2" keeps its decimal part.
  return `${letter}${value.replace(/^0+(?=\d)/, '')}`;
}

/**
 * Read linear moves (`G0`, `G1`) in absolute millimetre coordinates.
 *
 * This is not a full G-code interpreter. It covers what this app writes
 * and what simple path generators such as Sandify produce. Anything that
 * would change the meaning of coordinates is reported as an error.
 */
export function parseGcode(source: string): ParsedGcode {
  const moves: ParsedMove[] = [];
  const comments: ParsedComment[] = [];
  const issues: Issue[] = [];
  let x: number | null = null;
  let y: number | null = null;
  let z: number | null = null;
  let feed: number | null = null;
  let rapid: boolean | null = null;

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    let code = rawLine;

    const semicolon = code.indexOf(';');
    if (semicolon >= 0) {
      const text = code.slice(semicolon + 1).trim();
      if (text) comments.push({ text, line });
      code = code.slice(0, semicolon);
    }
    code = code.replace(/\(([^)]*)\)/g, (_match, text: string) => {
      if (text.trim()) comments.push({ text: text.trim(), line });
      return ' ';
    });
    code = code.trim().toUpperCase();
    if (!code) return;
    if (code.startsWith('$')) {
      issues.push(warning('gcode.systemCommand', `Line ${line}: command "${code}" ignored.`));
      return;
    }

    const words = [...code.matchAll(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g)];
    const leftover = code.replace(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g, '').trim();
    if (leftover) {
      issues.push(error('gcode.syntax', `Line ${line}: cannot read "${leftover}".`));
      return;
    }

    let hasAxis = false;
    let nx = x;
    let ny = y;
    let nz = z;
    for (const match of words) {
      const letter = match[1] as string;
      const value = match[2] as string;
      const number = Number(value);
      if (letter === 'X') [nx, hasAxis] = [number, true];
      else if (letter === 'Y') [ny, hasAxis] = [number, true];
      else if (letter === 'Z') [nz, hasAxis] = [number, true];
      else if (letter === 'F') feed = number;
      else if (letter === 'N') continue;
      else if (letter === 'G' || letter === 'M') {
        const name = normalizeCode(letter, value);
        if (name === 'G0') rapid = true;
        else if (name === 'G1') rapid = false;
        else if (UNSUPPORTED.has(name)) {
          issues.push(error('gcode.unsupported', `Line ${line}: ${name} is not supported.`));
        } else if (!IGNORED.has(name)) {
          issues.push(warning('gcode.ignored', `Line ${line}: ${name} ignored.`));
        }
      } else if (letter !== 'S' && letter !== 'T' && letter !== 'P') {
        issues.push(warning('gcode.ignored', `Line ${line}: word ${letter}${value} ignored.`));
      }
    }

    if (!hasAxis) return;
    if (rapid === null) {
      issues.push(error('gcode.noMotionMode', `Line ${line}: coordinates before G0 or G1.`));
      return;
    }
    x = nx;
    y = ny;
    z = nz;
    moves.push({ rapid, x, y, z, feed: rapid ? null : feed, line });
  });

  return { moves, comments, issues };
}
