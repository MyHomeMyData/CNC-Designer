import { useEffect, useMemo, useRef, useState } from 'react';
import type { Issue } from '../core/issues.ts';
import { validateWorkArea, validateWorkpiece } from '../core/machine/index.ts';
import {
  createDefaultProject,
  fileNamePart,
  generateProject,
  parseProject,
  placedGeometry,
  serializeProject,
  updateLayer,
} from '../core/project/index.ts';
import { APP_NAME, APP_VERSION } from '../core/version.ts';
import { resolveLayerGeometry } from '../modules/registry.tsx';
import { CanvasView } from './CanvasView.tsx';
import { downloadText, pickTextFile } from './files.ts';
import { IssueList } from './panels/IssueList.tsx';
import { LayersPanel } from './panels/LayersPanel.tsx';
import { OperationsPanel } from './panels/OperationsPanel.tsx';
import { OutputPanel } from './panels/OutputPanel.tsx';
import { SetupPanel } from './panels/SetupPanel.tsx';
import { store, useAppState } from './store.ts';

const PROJECT_EXTENSION = '.cncd.json';
type Tab = 'setup' | 'operations' | 'output';

interface Notice {
  readonly title: string;
  readonly issues: readonly Issue[];
}

function confirmDiscard(): boolean {
  return (
    !store.getState().dirty ||
    window.confirm('There are unsaved changes. Discard them and continue?')
  );
}

export function App() {
  const project = useAppState((state) => state.project);
  const selectedLayerId = useAppState((state) => state.selectedLayerId);
  const dirty = useAppState((state) => state.dirty);
  const canUndo = useAppState((state) => state.past.length > 0);
  const canRedo = useAppState((state) => state.future.length > 0);
  const loadCount = useAppState((state) => state.loadCount);
  const [tab, setTab] = useState<Tab>('setup');
  const [notice, setNotice] = useState<Notice | null>(null);

  const output = useMemo(() => generateProject(project, resolveLayerGeometry), [project]);
  const toolpaths = useMemo(
    () => output.programs.map((program) => program.result.toolpath),
    [output],
  );
  const sceneLayers = useMemo(
    () =>
      project.layers
        .filter((layer) => layer.visible)
        .map((layer) => ({ id: layer.id, geometry: placedGeometry(layer, resolveLayerGeometry) })),
    [project.layers],
  );
  const setupIssues = useMemo(
    () => [
      ...validateWorkArea(project.workArea, project.machine.limits),
      ...validateWorkpiece(project.workpiece, project.workArea),
    ],
    [project.workArea, project.workpiece, project.machine.limits],
  );
  const problemCount =
    output.issues.length +
    output.programs.reduce((sum, program) => sum + program.result.issues.length, 0);

  // Warn before the page is closed with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      // Text fields keep their own undo while the user is typing in them.
      if (target instanceof HTMLInputElement && target.type === 'text') return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** Round to a tenth of a millimetre, so dragging gives tidy positions. */
  const tidy = (value: number) => Math.round(value * 10) / 10;
  const dragStart = useRef<{ dragId: number; x: number; y: number } | null>(null);

  function dragLayer(layerId: string, dx: number, dy: number, dragId: number): void {
    const layer = store.getState().project.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    if (dragStart.current?.dragId !== dragId) {
      dragStart.current = { dragId, x: layer.placement.x, y: layer.placement.y };
    }
    const { x, y } = dragStart.current;
    // All edits of one drag share a key and a time, so they form one undo step.
    store.edit(
      (current) =>
        updateLayer(current, layerId, {
          placement: { ...layer.placement, x: tidy(x + dx), y: tidy(y + dy) },
        }),
      `drag-${dragId}`,
      dragId,
    );
  }

  function newProject(): void {
    if (!confirmDiscard()) return;
    store.load(createDefaultProject());
    setNotice(null);
  }

  async function openProject(): Promise<void> {
    if (!confirmDiscard()) return;
    const file = await pickTextFile(`${PROJECT_EXTENSION},.json,application/json`);
    if (!file) return;
    const parsed = parseProject(file.text);
    if (parsed.project) {
      store.load(parsed.project);
      setNotice(null);
    } else {
      setNotice({ title: `"${file.name}" could not be opened.`, issues: parsed.issues });
    }
  }

  function saveProject(): void {
    downloadText(
      fileNamePart(project.name) + PROJECT_EXTENSION,
      serializeProject(project),
      'application/json',
    );
    store.markSaved();
  }

  return (
    <div className="app">
      <header className="toolbar">
        <span className="app-name" title={`Version ${APP_VERSION}`}>
          {APP_NAME}
        </span>
        <button type="button" onClick={newProject}>
          New
        </button>
        <button type="button" onClick={() => void openProject()}>
          Open…
        </button>
        <button type="button" onClick={saveProject}>
          Save
        </button>
        <span className="toolbar-gap" />
        <button type="button" disabled={!canUndo} onClick={() => store.undo()} title="Ctrl+Z">
          Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => store.redo()} title="Ctrl+Y">
          Redo
        </button>
        <span className="project-title">
          {project.name}
          {dirty ? ' •' : ''}
        </span>
      </header>

      {notice && (
        <div className="notice" role="alert">
          <strong>{notice.title}</strong>
          <IssueList issues={notice.issues} />
          <button type="button" onClick={() => setNotice(null)}>
            Close
          </button>
        </div>
      )}

      <aside className="sidebar left">
        <LayersPanel project={project} selectedLayerId={selectedLayerId} />
      </aside>

      <CanvasView
        key={loadCount}
        workArea={project.workArea}
        workpiece={project.workpiece}
        layers={sceneLayers}
        selectedLayerId={selectedLayerId}
        toolpaths={toolpaths}
        onSelect={(id) => store.select(id)}
        onDragLayer={dragLayer}
      />

      <aside className="sidebar right">
        <nav className="tabs">
          <button
            type="button"
            className={tab === 'setup' ? 'active' : undefined}
            onClick={() => setTab('setup')}
          >
            Setup
          </button>
          <button
            type="button"
            className={tab === 'operations' ? 'active' : undefined}
            onClick={() => setTab('operations')}
          >
            Operations
          </button>
          <button
            type="button"
            className={tab === 'output' ? 'active' : undefined}
            onClick={() => setTab('output')}
          >
            G-code{problemCount > 0 ? ` (${problemCount})` : ''}
          </button>
        </nav>
        {tab === 'setup' && <SetupPanel project={project} issues={setupIssues} />}
        {tab === 'operations' && <OperationsPanel project={project} />}
        {tab === 'output' && <OutputPanel project={project} output={output} />}
      </aside>
    </div>
  );
}
