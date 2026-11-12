import type { Geometry, Vec2 } from '../../core/geometry/index.ts';
import type { WorkArea, Workpiece } from '../../core/machine/index.ts';
import type { Move, Toolpath } from '../../core/toolpath/index.ts';
import { gridStep, toScreen, toWorld, type View } from './view.ts';

export interface SceneLayer {
  readonly id: string;
  /** Geometry in program coordinates, or `null` if it cannot be computed. */
  readonly geometry: Geometry | null;
}

export interface Scene {
  readonly view: View;
  readonly width: number;
  readonly height: number;
  readonly workArea: WorkArea;
  readonly workpiece: Workpiece;
  readonly layers: readonly SceneLayer[];
  readonly selectedLayerId: string | null;
  readonly toolpaths: readonly Toolpath[];
  readonly showResult: boolean;
  readonly showTravel: boolean;
}

/** Colours of the drawing, taken from the style sheet. */
export interface Palette {
  readonly background: string;
  readonly workpiece: string;
  readonly grid: string;
  readonly workArea: string;
  readonly path: string;
  readonly selected: string;
  /** RGB components of the material removed, e.g. "60, 40, 20". */
  readonly cutRgb: string;
  readonly travel: string;
  readonly axisX: string;
  readonly axisY: string;
  readonly text: string;
}

type Ctx = CanvasRenderingContext2D;

function line(ctx: Ctx, a: Vec2, b: Vec2): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawGrid(ctx: Ctx, scene: Scene, palette: Palette): void {
  const { view, width, height } = scene;
  const step = gridStep(view.scale);
  const topLeft = toWorld(view, { x: 0, y: 0 });
  const bottomRight = toWorld(view, { x: width, y: height });
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
    const sx = Math.round(toScreen(view, { x, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let y = Math.ceil(bottomRight.y / step) * step; y <= topLeft.y; y += step) {
    const sy = Math.round(toScreen(view, { x: 0, y }).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
}

function rectPath(ctx: Ctx, view: View, x: { min: number; max: number }, y: typeof x): void {
  const a = toScreen(view, { x: x.min, y: y.max });
  const b = toScreen(view, { x: x.max, y: y.min });
  ctx.beginPath();
  ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
}

function drawGeometry(ctx: Ctx, view: View, geometry: Geometry, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  for (const { points, closed } of geometry.polylines) {
    const [first, ...rest] = points;
    if (!first) continue;
    const start = toScreen(view, first);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (const point of rest) {
      const p = toScreen(view, point);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  // Single points are drawn as small crosshair circles.
  for (const point of geometry.points) {
    const p = toScreen(view, point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 + width, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** Deepest working Z of all toolpaths, as a positive depth; at least a small value. */
function maxDepth(toolpaths: readonly Toolpath[]): number {
  let depth = 0.1;
  for (const toolpath of toolpaths) {
    for (const section of toolpath.sections) {
      for (const move of section.moves) {
        if (move.toolDiameter !== undefined) depth = Math.max(depth, -move.to.z);
      }
    }
  }
  return depth;
}

/**
 * Rough impression of the result: every cutting move leaves a trace as
 * wide as the tool, the darker the deeper it is.
 */
function drawResult(ctx: Ctx, scene: Scene, palette: Palette): void {
  const { view } = scene;
  const deepest = maxDepth(scene.toolpaths);
  const style = (z: number) => {
    // Moves above the surface remove nothing; they are only hinted at.
    const alpha = z >= 0 ? 0.12 : 0.3 + 0.6 * Math.min(1, -z / deepest);
    return `rgba(${palette.cutRgb}, ${alpha.toFixed(3)})`;
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  for (const toolpath of scene.toolpaths) {
    let previous: Move | undefined;
    let runOpen = false;
    const endRun = () => {
      if (runOpen) ctx.stroke();
      runOpen = false;
    };
    for (const section of toolpath.sections) {
      for (const move of section.moves) {
        const diameter = move.toolDiameter;
        if (move.kind === 'work' && previous && diameter !== undefined) {
          // Consecutive moves at the same depth are stroked as one path, so
          // that corners do not get darker where the segments overlap.
          const continues = runOpen && previous.kind === 'work' && previous.to.z === move.to.z;
          if (!continues) {
            endRun();
            const start = toScreen(view, previous.to);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.strokeStyle = style(move.to.z);
            ctx.lineWidth = Math.max(1, diameter * view.scale);
            runOpen = true;
          }
          const p = toScreen(view, move.to);
          ctx.lineTo(p.x, p.y);
        } else {
          endRun();
          if (move.kind === 'plunge' && diameter !== undefined) {
            const p = toScreen(view, move.to);
            ctx.fillStyle = style(move.to.z);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, (diameter * view.scale) / 2), 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        previous = move;
      }
    }
    endRun();
  }
}

function drawTravel(ctx: Ctx, scene: Scene, palette: Palette): void {
  ctx.strokeStyle = palette.travel;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  for (const toolpath of scene.toolpaths) {
    let previous: Move | undefined;
    let index = 0;
    for (const section of toolpath.sections) {
      for (const move of section.moves) {
        // The first travel move starts at an unknown position.
        if (move.kind === 'travel' && previous && index > 1) {
          line(ctx, toScreen(scene.view, previous.to), toScreen(scene.view, move.to));
        }
        previous = move;
        index++;
      }
    }
  }
  ctx.setLineDash([]);
}

function drawOrigin(ctx: Ctx, view: View, palette: Palette): void {
  const origin = toScreen(view, { x: 0, y: 0 });
  const length = 36;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeStyle = palette.axisX;
  line(ctx, origin, { x: origin.x + length, y: origin.y });
  ctx.strokeStyle = palette.axisY;
  line(ctx, origin, { x: origin.x, y: origin.y - length });
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = palette.axisX;
  ctx.fillText('X', origin.x + length + 3, origin.y + 4);
  ctx.fillStyle = palette.axisY;
  ctx.fillText('Y', origin.x - 3, origin.y - length - 4);
  ctx.fillStyle = palette.text;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 3, 0, 2 * Math.PI);
  ctx.fill();
}

/** Draw the whole scene. The context must be scaled to CSS pixels. */
export function drawScene(ctx: Ctx, scene: Scene, palette: Palette): void {
  const { view, width, height, workArea, workpiece } = scene;
  ctx.setLineDash([]);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  rectPath(ctx, view, workpiece.x, workpiece.y);
  ctx.fillStyle = palette.workpiece;
  ctx.fill();

  drawGrid(ctx, scene, palette);

  if (scene.showResult) drawResult(ctx, scene, palette);

  for (const layer of scene.layers) {
    if (layer.geometry && layer.id !== scene.selectedLayerId) {
      drawGeometry(ctx, view, layer.geometry, palette.path, 1);
    }
  }
  if (scene.showTravel) drawTravel(ctx, scene, palette);
  for (const layer of scene.layers) {
    if (layer.geometry && layer.id === scene.selectedLayerId) {
      drawGeometry(ctx, view, layer.geometry, palette.selected, 2);
    }
  }

  rectPath(ctx, view, workArea.x, workArea.y);
  ctx.strokeStyle = palette.workArea;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.stroke();

  drawOrigin(ctx, view, palette);
}
