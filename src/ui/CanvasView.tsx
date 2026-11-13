import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { bboxOfGeometry, distanceToGeometry, type Vec2 } from '../core/geometry/index.ts';
import type { WorkArea, Workpiece } from '../core/machine/index.ts';
import type { Toolpath } from '../core/toolpath/index.ts';
import {
  drawScene,
  selectionHandles,
  type Handle,
  type Palette,
  type SceneLayer,
} from './canvas/draw.ts';
import { fitView, pan, toWorld, zoomAt, type View } from './canvas/view.ts';
import { CheckField } from './fields.tsx';

interface CanvasViewProps {
  readonly workArea: WorkArea;
  readonly workpiece: Workpiece;
  readonly layers: readonly SceneLayer[];
  readonly selectedLayerId: string | null;
  readonly toolpaths: readonly Toolpath[];
  readonly onSelect: (layerId: string | null) => void;
  /**
   * Called while a layer is dragged or one of its handles is pulled, with
   * the total change since the drag began. `dragId` is the same for all
   * calls of one drag.
   */
  readonly onDragLayer: (layerId: string, change: LayerDrag, dragId: number) => void;
}

/** What a drag does to a layer, relative to its placement when the drag began. */
export type LayerDrag =
  | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'scale'; readonly pivot: Vec2; readonly factor: number }
  | { readonly kind: 'rotate'; readonly pivot: Vec2; readonly degrees: number };

/** A handle is hit within this many pixels of its centre. */
const HANDLE_PIXELS = 9;
/** With Shift held, rotation snaps to multiples of this angle. */
const ROTATION_SNAP = 15;

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
  const { workArea, workpiece, layers, selectedLayerId, toolpaths, onSelect, onDragLayer } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // `null` means: show the whole work area.
  const [userView, setUserView] = useState<View | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [showTravel, setShowTravel] = useState(true);
  const [pointer, setPointer] = useState<Vec2 | null>(null);
  const [cursor, setCursor] = useState('grab');
  const drag = useRef<{
    start: Vec2;
    last: Vec2;
    moved: boolean;
    /** Layer that is being changed; `null` when the view is panned instead. */
    layerId: string | null;
    /** Handle that is being pulled; `null` when the layer itself is moved. */
    handle: Handle | null;
    id: number;
  } | null>(null);

  const selectionBox = useMemo(() => {
    const selected = layers.find((layer) => layer.id === selectedLayerId);
    return selected?.geometry ? bboxOfGeometry(selected.geometry) : null;
  }, [layers, selectedLayerId]);

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
        selectionBox,
        toolpaths,
        showResult,
        showTravel,
      },
      readPalette(canvas),
    );
  }, [
    view,
    size,
    workArea,
    workpiece,
    layers,
    selectedLayerId,
    selectionBox,
    toolpaths,
    showResult,
    showTravel,
  ]);

  function handleAt(pixel: Vec2): Handle | null {
    if (!selectionBox) return null;
    return (
      selectionHandles(view, selectionBox).find(
        (handle) =>
          Math.hypot(handle.screen.x - pixel.x, handle.screen.y - pixel.y) <= HANDLE_PIXELS,
      ) ?? null
    );
  }

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
    // Pulling a handle scales or rotates the selected layer, dragging a layer
    // moves it, and dragging empty space moves the view.
    const handle = handleAt(pixel);
    const layerId = handle ? selectedLayerId : layerAt(pixel);
    if (layerId && !handle) onSelect(layerId);
    drag.current = { start: pixel, last: pixel, moved: false, layerId, handle, id: Date.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const pixel = pointerPixel(event, event.currentTarget);
    setPointer(toWorld(view, pixel));
    const current = drag.current;
    if (!current) {
      const handle = handleAt(pixel);
      setCursor(
        handle?.kind === 'rotate'
          ? 'crosshair'
          : handle
            ? 'nesw-resize'
            : layerAt(pixel) !== null
              ? 'move'
              : 'grab',
      );
      return;
    }
    if (Math.hypot(pixel.x - current.start.x, pixel.y - current.start.y) > CLICK_PIXELS) {
      current.moved = true;
    }
    if (current.moved && current.layerId && current.handle) {
      const { kind, pivot, corner } = current.handle;
      const world = toWorld(view, pixel);
      if (kind === 'scale') {
        const reference = Math.hypot(corner.x - pivot.x, corner.y - pivot.y);
        const factor = Math.hypot(world.x - pivot.x, world.y - pivot.y) / reference;
        if (reference > 0 && factor > 0.001) {
          onDragLayer(current.layerId, { kind, pivot, factor }, current.id);
        }
      } else {
        const began = toWorld(view, current.start);
        const angle = (from: Vec2) => Math.atan2(from.y - pivot.y, from.x - pivot.x);
        let degrees = ((angle(world) - angle(began)) * 180) / Math.PI;
        degrees = event.shiftKey
          ? Math.round(degrees / ROTATION_SNAP) * ROTATION_SNAP
          : Math.round(degrees * 10) / 10;
        onDragLayer(current.layerId, { kind, pivot, degrees }, current.id);
      }
    } else if (current.moved && current.layerId) {
      onDragLayer(
        current.layerId,
        {
          kind: 'move',
          dx: (pixel.x - current.start.x) / view.scale,
          dy: (current.start.y - pixel.y) / view.scale,
        },
        current.id,
      );
    } else if (current.moved) {
      const dx = pixel.x - current.last.x;
      const dy = pixel.y - current.last.y;
      setUserView((previous) => pan(previous ?? fitted, dx, dy));
    }
    current.last = pixel;
  }

  function onPointerUp(): void {
    const current = drag.current;
    drag.current = null;
    // A click on empty space clears the selection; a layer was selected on pointer down.
    if (current && !current.moved && !current.layerId) onSelect(null);
  }

  return (
    <div className="canvas-area">
      <div className="canvas-wrapper" ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height, cursor }}
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
