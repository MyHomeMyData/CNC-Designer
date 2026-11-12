import type { Vec3 } from '../geometry/index.ts';
import type { Range, WorkArea } from '../machine/index.ts';
import { EPSILON } from '../machine/index.ts';
import type { Move, Toolpath } from './types.ts';
import { allMoves } from './types.ts';

/** Speeds of rapid moves in mm/min, used only to estimate the run time. */
export interface RapidRates {
  readonly xy: number;
  readonly z: number;
}

/** Maximum rates from the FluidNC configuration of this project's machine. */
export const DEFAULT_RAPID_RATES: RapidRates = { xy: 5000, z: 800 };

export interface ToolpathStats {
  /** Length of working moves in mm. */
  readonly workLength: number;
  /** Length of all other moves in mm, without the first move to safe Z. */
  readonly otherLength: number;
  /**
   * Estimated run time in minutes. Ignores acceleration and the unknown
   * first move, so the real run takes somewhat longer.
   */
  readonly minutes: number;
  /** Range of coordinates the program commands, or `null` if it has no moves. */
  readonly extent: { readonly x: Range; readonly y: Range; readonly z: Range } | null;
}

function moveLength(from: Vec3, to: Vec3): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function rapidRate(from: Vec3, to: Vec3, rates: RapidRates): number {
  const horizontal = Math.hypot(to.x - from.x, to.y - from.y);
  return horizontal > EPSILON ? rates.xy : rates.z;
}

export function toolpathStats(
  toolpath: Toolpath,
  rates: RapidRates = DEFAULT_RAPID_RATES,
): ToolpathStats {
  const moves = allMoves(toolpath);
  let workLength = 0;
  let otherLength = 0;
  let minutes = 0;
  let previous: Move | undefined;
  for (const move of moves) {
    // The first move starts at an unknown position and cannot be measured.
    if (previous) {
      const length = moveLength(previous.to, move.to);
      if (move.kind === 'work') workLength += length;
      else otherLength += length;
      minutes += length / (move.feed ?? rapidRate(previous.to, move.to, rates));
    }
    previous = move;
  }
  return { workLength, otherLength, minutes, extent: toolpathExtent(moves) };
}

function toolpathExtent(moves: readonly Move[]): ToolpathStats['extent'] {
  if (moves.length === 0) return null;
  const range = (pick: (p: Vec3) => number, from: readonly Move[]): Range => ({
    min: Math.min(...from.map((move) => pick(move.to))),
    max: Math.max(...from.map((move) => pick(move.to))),
  });
  // X/Y of the initial move to safe Z are placeholders, not commanded positions.
  const xyMoves = moves.length > 1 ? moves.slice(1) : moves;
  return {
    x: range((p) => p.x, xyMoves),
    y: range((p) => p.y, xyMoves),
    z: range((p) => p.z, moves),
  };
}

/** A move that leaves the work area. */
export interface Violation {
  readonly sectionLabel: string;
  readonly move: Move;
}

/** All moves whose target lies outside the work area. */
export function findViolations(toolpath: Toolpath, workArea: WorkArea): Violation[] {
  const violations: Violation[] = [];
  let first = true;
  for (const section of toolpath.sections) {
    for (const move of section.moves) {
      const { x, y, z } = move.to;
      const inside = (range: Range, value: number) =>
        value >= range.min - EPSILON && value <= range.max + EPSILON;
      // The initial move to safe Z commands Z only.
      const xyOk = first || (inside(workArea.x, x) && inside(workArea.y, y));
      if (!xyOk || !inside(workArea.z, z)) violations.push({ sectionLabel: section.label, move });
      first = false;
    }
  }
  return violations;
}
