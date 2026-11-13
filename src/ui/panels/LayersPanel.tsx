import { useState } from 'react';
import {
  addLayer,
  moveLayer,
  nextId,
  removeLayer,
  uniqueName,
  updateLayer,
  type Layer,
  type Project,
} from '../../core/project/index.ts';
import {
  applyToGeometry,
  applyToPoint,
  bboxOfGeometry,
  centerOf,
  centerOn,
  DEFAULT_PLACEMENT,
  fitInto,
  keepInPlace,
  mirrorAbout,
  placementToTransform,
  rotateAbout,
  scaleAbout,
  type Placement,
} from '../../core/geometry/index.ts';
import { findModule, MODULES, resolveLayerGeometry } from '../../modules/registry.tsx';
import { CheckField, NumberField, Section, SelectField, TextField } from '../fields.tsx';
import { store } from '../store.ts';

interface LayersPanelProps {
  readonly project: Project;
  readonly selectedLayerId: string | null;
}

async function createLayer(project: Project, moduleId: string): Promise<Layer | null> {
  const module = findModule(moduleId);
  if (!module) return null;
  const params = await module.createParams();
  if (params === null) return null;
  const operation =
    project.operations.find((candidate) => candidate.kind === module.defaultOperationKind) ??
    project.operations[0];
  return {
    id: nextId(
      'layer',
      project.layers.map((layer) => layer.id),
    ),
    name: uniqueName(
      module.layerName(params),
      project.layers.map((layer) => layer.name),
    ),
    visible: true,
    moduleId,
    params,
    placement: DEFAULT_PLACEMENT,
    operationId: operation?.id ?? null,
    optimizeOrder: true,
  };
}

export function LayersPanel({ project, selectedLayerId }: LayersPanelProps) {
  const [moduleId, setModuleId] = useState(MODULES[0]?.id ?? '');
  const selected = project.layers.find((layer) => layer.id === selectedLayerId);

  async function add(): Promise<void> {
    // The project may change while a file dialog is open; use the current one.
    const layer = await createLayer(store.getState().project, moduleId);
    if (!layer) return;
    store.edit((current) => addLayer(current, layer));
    store.select(layer.id);
  }

  return (
    <>
      <Section title="Layers">
        <p className="hint">Layers are worked from top to bottom.</p>
        <ul className="layer-list">
          {project.layers.map((layer, index) => (
            <li key={layer.id} className={layer.id === selectedLayerId ? 'selected' : undefined}>
              <input
                type="checkbox"
                checked={layer.visible}
                title="Visible and included in the output"
                onChange={(event) =>
                  store.edit((current) =>
                    updateLayer(current, layer.id, { visible: event.target.checked }),
                  )
                }
              />
              <button type="button" className="layer-name" onClick={() => store.select(layer.id)}>
                {layer.name || '(unnamed)'}
              </button>
              <button
                type="button"
                title="Work earlier"
                disabled={index === 0}
                onClick={() => store.edit((current) => moveLayer(current, layer.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                title="Work later"
                disabled={index === project.layers.length - 1}
                onClick={() => store.edit((current) => moveLayer(current, layer.id, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                title="Delete layer"
                onClick={() => store.edit((current) => removeLayer(current, layer.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {project.layers.length === 0 && <p className="hint">No layers yet.</p>}
        <div className="row">
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            {MODULES.map((module) => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void add()}>
            Add layer
          </button>
        </div>
      </Section>
      {selected && <LayerProperties project={project} layer={selected} />}
    </>
  );
}

function LayerProperties({ project, layer }: { readonly project: Project; readonly layer: Layer }) {
  const module = findModule(layer.moduleId);
  const change = (changes: Partial<Layer>, mergeKey?: string) =>
    store.edit((current) => updateLayer(current, layer.id, changes), mergeKey);
  const place = (placement: Placement) => change({ placement });

  // The centre of the layer's own geometry is the fixed point for turning,
  // scaling and mirroring: it follows the layer, however it is placed.
  const local = resolveLayerGeometry(layer);
  const localBox = local ? bboxOfGeometry(local) : null;
  const localCenter = localBox ? centerOf(localBox) : null;
  const transform = placementToTransform(layer.placement);
  const pivot = localCenter ? applyToPoint(transform, localCenter) : null;
  const box = local ? bboxOfGeometry(applyToGeometry(transform, local)) : null;
  const width = box ? box.maxX - box.minX : 0;
  const height = box ? box.maxY - box.minY : 0;
  const { workpiece } = project;
  const pieceBox = {
    minX: workpiece.x.min,
    minY: workpiece.y.min,
    maxX: workpiece.x.max,
    maxY: workpiece.y.max,
  };
  /** Change the placement but keep the layer where it is. */
  const placeInPlace = (placement: Placement) =>
    place(localCenter ? keepInPlace(layer.placement, placement, localCenter) : placement);
  const panel = module?.renderPanel(layer.params, (params, mergeKey) =>
    change({ params }, mergeKey === undefined ? undefined : `${mergeKey}-${layer.id}`),
  );

  return (
    <>
      <Section title={`Layer: ${module?.name ?? layer.moduleId}`}>
        <TextField
          label="Name"
          value={layer.name}
          onChange={(name) => change({ name }, `layer-name-${layer.id}`)}
        />
        {panel ?? (
          <p className="hint error-text">
            {module
              ? 'The parameters of this layer cannot be read.'
              : `The module "${layer.moduleId}" is not available in this version.`}
          </p>
        )}
      </Section>
      <Section title="Placement">
        <NumberField
          label="Position X"
          unit="mm"
          value={layer.placement.x}
          onCommit={(x) => place({ ...layer.placement, x })}
        />
        <NumberField
          label="Position Y"
          unit="mm"
          value={layer.placement.y}
          onCommit={(y) => place({ ...layer.placement, y })}
        />
        <NumberField
          label="Rotation"
          unit="°"
          title="Counter-clockwise, about the centre of the layer"
          value={layer.placement.rotation}
          onCommit={(rotation) => placeInPlace({ ...layer.placement, rotation })}
        />
        <NumberField
          label="Scale X"
          title="Along the layer's own X direction. A negative factor mirrors."
          value={layer.placement.scaleX}
          onCommit={(scaleX) => scaleX !== 0 && placeInPlace({ ...layer.placement, scaleX })}
        />
        <NumberField
          label="Scale Y"
          title="Along the layer's own Y direction. A negative factor mirrors."
          value={layer.placement.scaleY}
          onCommit={(scaleY) => scaleY !== 0 && placeInPlace({ ...layer.placement, scaleY })}
        />
        {box && pivot && (
          <>
            <p className="hint">Size as placed. Changing one value scales the whole layer.</p>
            <NumberField
              label="Size in X"
              unit="mm"
              disabled={width === 0}
              value={width}
              onCommit={(value) => place(scaleAbout(layer.placement, pivot, value / width))}
            />
            <NumberField
              label="Size in Y"
              unit="mm"
              disabled={height === 0}
              value={height}
              onCommit={(value) => place(scaleAbout(layer.placement, pivot, value / height))}
            />
            <div className="row">
              <button
                type="button"
                title="Turn 90° counter-clockwise"
                onClick={() => place(rotateAbout(layer.placement, pivot, 90))}
              >
                ⟲ 90°
              </button>
              <button
                type="button"
                title="Turn 90° clockwise"
                onClick={() => place(rotateAbout(layer.placement, pivot, -90))}
              >
                ⟳ 90°
              </button>
              <button
                type="button"
                title="Mirror left and right"
                onClick={() => place(mirrorAbout(layer.placement, pivot, 'horizontal'))}
              >
                Flip ↔
              </button>
              <button
                type="button"
                title="Mirror top and bottom"
                onClick={() => place(mirrorAbout(layer.placement, pivot, 'vertical'))}
              >
                Flip ↕
              </button>
            </div>
            <div className="row">
              <button
                type="button"
                onClick={() => place(centerOn(layer.placement, box, centerOf(pieceBox)))}
              >
                Centre on workpiece
              </button>
              <button
                type="button"
                title="Scale and centre the layer so that it fills the workpiece"
                onClick={() => place(fitInto(layer.placement, box, pieceBox))}
              >
                Fit into workpiece
              </button>
            </div>
          </>
        )}
      </Section>
      <Section title="Machining">
        <SelectField
          label="Operation"
          value={layer.operationId ?? ''}
          options={[
            { value: '', label: 'None (drawing only)' },
            ...project.operations.map((operation) => ({
              value: operation.id,
              label: operation.name,
            })),
          ]}
          onChange={(id) => change({ operationId: id === '' ? null : id })}
        />
        <CheckField
          label="Shorten positioning moves"
          title="Reorder paths and points. Switch off if the order of the design matters."
          checked={layer.optimizeOrder}
          onChange={(optimizeOrder) => change({ optimizeOrder })}
        />
      </Section>
    </>
  );
}
