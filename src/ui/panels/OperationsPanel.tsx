import type { Operation } from '../../core/operations/index.ts';
import { validateOperation } from '../../core/operations/index.ts';
import {
  addOperation,
  DEFAULT_DRILL_OPERATION,
  DEFAULT_FOLLOW_OPERATION,
  nextId,
  removeOperation,
  uniqueName,
  updateOperation,
  type Project,
} from '../../core/project/index.ts';
import { CheckField, NumberField, Section, SelectField, TextField } from '../fields.tsx';
import { store } from '../store.ts';
import { IssueList } from './IssueList.tsx';

export function OperationsPanel({ project }: { readonly project: Project }) {
  function add(template: Operation): void {
    const ids = project.operations.map((operation) => operation.id);
    const names = project.operations.map((operation) => operation.name);
    store.edit((current) =>
      addOperation(current, {
        ...template,
        id: nextId('operation', ids),
        name: uniqueName(template.name, names),
      }),
    );
  }

  return (
    <>
      {project.operations.map((operation) => (
        <OperationEditor key={operation.id} project={project} operation={operation} />
      ))}
      <div className="row">
        <button type="button" onClick={() => add(DEFAULT_FOLLOW_OPERATION)}>
          Add path operation
        </button>
        <button type="button" onClick={() => add(DEFAULT_DRILL_OPERATION)}>
          Add drill operation
        </button>
      </div>
    </>
  );
}

function OperationEditor({
  project,
  operation,
}: {
  readonly project: Project;
  readonly operation: Operation;
}) {
  const change = (changes: Partial<Operation>, mergeKey?: string) =>
    store.edit(
      // The kind of an operation never changes, so the result keeps its type.
      (current) => updateOperation(current, { ...operation, ...changes } as Operation),
      mergeKey,
    );
  const usedBy = project.layers.filter((layer) => layer.operationId === operation.id).length;
  const kindLabel = operation.kind === 'follow' ? 'Follow paths' : 'Drill points';

  function remove(): void {
    const question =
      `Delete the operation "${operation.name}"? ` +
      `${usedBy} layer(s) use it and will be left without an operation.`;
    if (usedBy === 0 || window.confirm(question)) {
      store.edit((current) => removeOperation(current, operation.id));
    }
  }

  return (
    <Section title={`${operation.name} — ${kindLabel}`} defaultOpen={false}>
      <TextField
        label="Name"
        value={operation.name}
        onChange={(name) => change({ name }, `operation-name-${operation.id}`)}
      />
      <TextField
        label="Tool"
        value={operation.toolName}
        onChange={(toolName) => change({ toolName }, `operation-tool-${operation.id}`)}
      />
      <p className="hint">Operations with the same tool name go into the same G-code file.</p>
      <NumberField
        label="Tool diameter"
        unit="mm"
        title="Width of the trace in the preview"
        value={operation.toolDiameter}
        onCommit={(toolDiameter) => change({ toolDiameter })}
      />
      <NumberField
        label="Safe Z"
        unit="mm"
        title="Height of positioning moves, above the surface"
        value={operation.safeZ}
        onCommit={(safeZ) => change({ safeZ })}
      />
      <NumberField
        label="Working Z"
        unit="mm"
        title="Negative values are inside the workpiece"
        value={operation.workZ}
        onCommit={(workZ) => change({ workZ })}
      />
      {operation.kind === 'follow' && (
        <>
          <NumberField
            label="Feed X/Y"
            unit="mm/min"
            value={operation.feedXY}
            onCommit={(feedXY) => change({ feedXY })}
          />
          <CheckField
            label="Several passes"
            checked={operation.stepDown !== null}
            onChange={(on) => change({ stepDown: on ? 1 : null })}
          />
          {operation.stepDown !== null && (
            <NumberField
              label="Depth per pass"
              unit="mm"
              value={operation.stepDown}
              onCommit={(stepDown) => change({ stepDown })}
            />
          )}
        </>
      )}
      {operation.kind === 'drill' && (
        <>
          <CheckField
            label="Peck drilling (clear chips)"
            checked={operation.peckDepth !== null}
            onChange={(on) => change({ peckDepth: on ? 2 : null })}
          />
          {operation.peckDepth !== null && (
            <NumberField
              label="Depth per peck"
              unit="mm"
              value={operation.peckDepth}
              onCommit={(peckDepth) => change({ peckDepth })}
            />
          )}
        </>
      )}
      <NumberField
        label="Feed Z"
        unit="mm/min"
        title="Feed rate for moving down into the work"
        value={operation.feedZ}
        onCommit={(feedZ) => change({ feedZ })}
      />
      <SelectField
        label="Positioning"
        value={operation.travel.mode}
        options={[
          { value: 'rapid', label: 'Rapid (G0)' },
          { value: 'feed', label: 'With feed rate (G1)' },
        ]}
        onChange={(mode) =>
          change({ travel: mode === 'rapid' ? { mode: 'rapid' } : { mode: 'feed', feed: 1500 } })
        }
      />
      {operation.travel.mode === 'feed' && (
        <NumberField
          label="Positioning feed"
          unit="mm/min"
          value={operation.travel.feed}
          onCommit={(feed) => change({ travel: { mode: 'feed', feed } })}
        />
      )}
      <IssueList issues={validateOperation(operation, project.workArea)} />
      <button type="button" onClick={remove}>
        Delete operation
      </button>
    </Section>
  );
}
