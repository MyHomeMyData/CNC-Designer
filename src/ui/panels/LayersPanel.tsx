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
import { DEFAULT_PLACEMENT } from '../../core/geometry/index.ts';
import { findModule, MODULES } from '../../modules/registry.tsx';
import { CheckField, NumberField, Section, SelectField, TextField } from '../fields.tsx';
import { store } from '../store.ts';

interface LayersPanelProps {
  readonly project: Project;
  readonly selectedLayerId: string | null;
}

function createLayer(project: Project, moduleId: string): Layer | null {
  const module = findModule(moduleId);
  if (!module) return null;
  const operation =
    project.operations.find((candidate) => candidate.kind === module.defaultOperationKind) ??
    project.operations[0];
  return {
    id: nextId(
      'layer',
      project.layers.map((layer) => layer.id),
    ),
    name: uniqueName(
      module.name,
      project.layers.map((layer) => layer.name),
    ),
    visible: true,
    moduleId,
    params: module.defaultParams(),
    placement: DEFAULT_PLACEMENT,
    operationId: operation?.id ?? null,
    optimizeOrder: true,
  };
}

export function LayersPanel({ project, selectedLayerId }: LayersPanelProps) {
  const [moduleId, setModuleId] = useState(MODULES[0]?.id ?? '');
  const selected = project.layers.find((layer) => layer.id === selectedLayerId);

  function add(): void {
    const layer = createLayer(project, moduleId);
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
          <button type="button" onClick={add}>
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
  const place = (changes: Partial<Layer['placement']>) =>
    change({ placement: { ...layer.placement, ...changes } });
  const panel = module?.renderPanel(layer.params, (params) => change({ params }));

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
          onCommit={(x) => place({ x })}
        />
        <NumberField
          label="Position Y"
          unit="mm"
          value={layer.placement.y}
          onCommit={(y) => place({ y })}
        />
        <NumberField
          label="Rotation"
          unit="°"
          title="Counter-clockwise, about the layer's own origin"
          value={layer.placement.rotation}
          onCommit={(rotation) => place({ rotation })}
        />
        <NumberField
          label="Scale X"
          title="A negative factor mirrors"
          value={layer.placement.scaleX}
          onCommit={(scaleX) => scaleX !== 0 && place({ scaleX })}
        />
        <NumberField
          label="Scale Y"
          title="A negative factor mirrors"
          value={layer.placement.scaleY}
          onCommit={(scaleY) => scaleY !== 0 && place({ scaleY })}
        />
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
