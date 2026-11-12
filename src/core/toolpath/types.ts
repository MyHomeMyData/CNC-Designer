import type { Vec3 } from '../geometry/index.ts';

/**
 * What a move does:
 * - `travel`: positioning in X/Y at safe Z, tool not working
 * - `lift`: Z-only move to safe Z, tool not working
 * - `plunge`: Z-only move down into the work
 * - `work`: working move in X/Y at working depth
 */
export type MoveKind = 'travel' | 'lift' | 'plunge' | 'work';

/** A straight move to `to`. The start is the end of the previous move. */
export interface Move {
  readonly kind: MoveKind;
  readonly to: Vec3;
  /** Feed rate in mm/min, or `null` for a rapid move at machine maximum. */
  readonly feed: number | null;
  /** Width of the trace for the preview, in mm. Set for moves that cut: `work` and cutting `plunge`. */
  readonly toolDiameter?: number;
}

/** A group of consecutive moves that belong together, e.g. one layer. */
export interface ToolpathSection {
  readonly label: string;
  readonly moves: readonly Move[];
}

/**
 * The complete movement of one G-code program.
 *
 * The position of the tool before the first move is unknown. The first move
 * of every toolpath is therefore a `lift` to safe Z, whose X/Y are those of
 * the following travel move and must not be interpreted as a movement in
 * X/Y. G-code output writes only the Z word for it.
 */
export interface Toolpath {
  readonly sections: readonly ToolpathSection[];
}

export function allMoves(toolpath: Toolpath): Move[] {
  return toolpath.sections.flatMap((section) => section.moves);
}
