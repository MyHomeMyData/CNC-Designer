import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { distanceToGeometry, type Vec2 } from '../core/geometry/index.ts';
import type { WorkArea, Workpiece } from '../core/machine/index.ts';
import type { Toolpath } from '../core/toolpath/index.ts';
import { drawScene, type Palette, type SceneLayer } from './canvas/draw.ts';
import { fitView, pan, toWorld, zoomAt, type View } from './canvas/view.ts';
import { CheckField } from './fields.tsx';

interface CanvasViewProps {
  readonly workArea: WorkArea;
  readonly workpiece: Workpiece;
  readonly layers: readonly SceneLayer[];
  readonly selectedLayerId: string | null;
  readonly toolpaths: readonly Toolpath[];
  readonly onSelect: (layerId: string | null) => void;
}

/** A click selects the layer whose geometry is within this many pixels. */
const HIT_PIXELS = 7;
/** Pointer travel below this many pixels counts as a click, not a drag. */
const CLICK_PIXELS = 4;

function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const value = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: value('--canvas-background'),
    workpiece: value('--canvas-workpiece'),
    grid: value('--canvas-grid'),
    workArea: value('--canvas-work-area'),
    path: value('--canvas-path'),
    selected: value('--canvas-selected'),
    cutRgb: value('--canvas-cut-rgb'),
    travel: value('--canvas-travel'),
    axisX: value('--canvas-axis-x'),
    axisY: value('--canvas-axis-y'),
    text: value('--canvas-text'),
  };
}

function pointerPixel(event: { clientX: number; clientY: number }, element: Element): Vec2 {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function CanvasView(props: CanvasViewProps) {
  const { workArea, workpiece, layers, selectedLayerId, toolpaths, onSelect } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // `null` means: show the whole work area.
  const [userView, setUserView] = useState<View | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [showTravel, setShowTravel] = useState(true);
  const [pointer, setPointer] = useState<Vec2 | null>(null);
  const drag = useRef<{ start: Vec2; last: Vec2; moved: boolean } | null>(null);

  const fitted = useMemo(
    () =>
      fitView(
        {
          minX: workArea.x.min,
          minY: workArea.y.min,
          maxX: workArea.x.max,
          maxY: workArea.y.max,
        },
        size.width,
        size.height,
      ),
    [workArea, size],
  );
  const view = userView ?? fitted;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // The wheel listener must be registered by hand: React registers wheel
  // handlers as passive, and a passive handler cannot stop the page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      const pixel = pointerPixel(event, canvas);
      setUserView((current) => zoomAt(current ?? fitted, pixel, factor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [fitted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || size.width === 0 || size.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawScene(
      ctx,
      {
        view,
        width: size.width,
        height: size.height,
        workArea,
        workpiece,
        layers,
        selectedLayerId,
        toolpaths,
        showResult,
        showTravel,
      },
      readPalette(canvas),
    );
  }, [view, size, workArea, workpiece, layers, selectedLayerId, toolpaths, showResult, showTravel]);

  function layerAt(pixel: Vec2): string | null {
    const world = toWorld(view, pixel);
    let best: string | null = null;
    let bestDistance = HIT_PIXELS / view.scale;
    for (const layer of layers) {
      if (!layer.geometry) continue;
      const d = distanceToGeometry(world, layer.geometry);
      if (d <= bestDistance) {
        best = layer.id;
        bestDistance = d;
      }
    }
    return best;
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    const pixel = pointerPixel(event, event.currentTarget);
    drag.current = { start: pixel, last: pixel, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const pixel = pointerPixel(event, event.currentTarget);
    setPointer(toWorld(view, pixel));
    const current = drag.current;
    if (!current) return;
    if (Math.hypot(pixel.x - current.start.x, pixel.y - current.start.y) > CLICK_PIXELS) {
      current.moved = true;
    }
    if (current.moved) {
      const dx = pixel.x - current.last.x;
      const dy = pixel.y - current.last.y;
      setUserView((previous) => pan(previous ?? fitted, dx, dy));
    }
    current.last = pixel;
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    const current = drag.current;
    drag.current = null;
    if (current && !current.moved) onSelect(layerAt(pointerPixel(event, event.currentTarget)));
  }

  return (
    <div className="canvas-area">
      <div className="canvas-wrapper" ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setPointer(null)}
        />
      </div>
      <div className="status-bar">
        <button type="button" onClick={() => setUserView(null)} title="Show the whole work area">
          Fit
        </button>
        <CheckField label="Result preview" checked={showResult} onChange={setShowResult} />
        <CheckField label="Positioning moves" checked={showTravel} onChange={setShowTravel} />
        <span className="status-spacer" />
        <span className="coordinates">
          {pointer ? `X ${pointer.x.toFixed(1)}  Y ${pointer.y.toFixed(1)} mm` : ''}
        </span>
      </div>
    </div>
  );
}
