import { formatDuration } from '../../core/gcode/index.ts';
import { generateProject, type Project, type ProjectOutput } from '../../core/project/index.ts';
import { resolveLayerGeometry } from '../../modules/registry.tsx';
import { downloadText, timestamp } from '../files.ts';
import { IssueList } from './IssueList.tsx';

interface OutputPanelProps {
  readonly project: Project;
  readonly output: ProjectOutput;
}

export function OutputPanel({ project, output }: OutputPanelProps) {
  /** Generate again at the moment of the download so the file carries the current time. */
  function download(index: number): void {
    const fresh = generateProject(project, resolveLayerGeometry, timestamp()).programs[index];
    if (fresh?.result.gcode) downloadText(fresh.fileName, fresh.result.gcode);
  }

  return (
    <>
      <IssueList issues={output.issues} />
      {output.programs.length === 0 && (
        <p className="hint">Nothing to export yet. Add a layer and assign an operation to it.</p>
      )}
      {output.programs.map(({ fileName, program, result }, index) => (
        <div key={fileName} className="program">
          <h3>{program.toolName}</h3>
          <dl>
            <dt>Layers</dt>
            <dd>{program.jobs.map((job) => job.label).join(', ')}</dd>
            <dt>Working in X/Y</dt>
            <dd>{result.stats.workLength.toFixed(0)} mm</dd>
            <dt>Positioning</dt>
            <dd>{result.stats.otherLength.toFixed(0)} mm</dd>
            <dt>Time</dt>
            <dd>about {formatDuration(result.stats.minutes)}</dd>
            {result.stats.extent && (
              <>
                <dt>Uses X</dt>
                <dd>
                  {result.stats.extent.x.min.toFixed(1)} … {result.stats.extent.x.max.toFixed(1)}
                </dd>
                <dt>Uses Y</dt>
                <dd>
                  {result.stats.extent.y.min.toFixed(1)} … {result.stats.extent.y.max.toFixed(1)}
                </dd>
                <dt>Uses Z</dt>
                <dd>
                  {result.stats.extent.z.min.toFixed(1)} … {result.stats.extent.z.max.toFixed(1)}
                </dd>
              </>
            )}
          </dl>
          <IssueList issues={result.issues} />
          <button type="button" disabled={result.gcode === null} onClick={() => download(index)}>
            Download {fileName}
          </button>
        </div>
      ))}
    </>
  );
}
