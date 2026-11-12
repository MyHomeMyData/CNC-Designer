import type { Issue } from '../../core/issues.ts';
import { workpieceFromWorkArea, type Range } from '../../core/machine/index.ts';
import type { Project } from '../../core/project/index.ts';
import { NumberField, Section, SelectField, TextField } from '../fields.tsx';
import { store } from '../store.ts';
import { IssueList } from './IssueList.tsx';

interface SetupPanelProps {
  readonly project: Project;
  readonly issues: readonly Issue[];
}

function RangeFields({
  label,
  range,
  onChange,
}: {
  readonly label: string;
  readonly range: Range;
  readonly onChange: (range: Range) => void;
}) {
  return (
    <div className="pair">
      <NumberField
        label={`${label} from`}
        unit="mm"
        value={range.min}
        onCommit={(min) => onChange({ ...range, min })}
      />
      <NumberField
        label="to"
        unit="mm"
        value={range.max}
        onCommit={(max) => onChange({ ...range, max })}
      />
    </div>
  );
}

export function SetupPanel({ project, issues }: SetupPanelProps) {
  const { workArea, workpiece, end, machine } = project;
  const edit = (changes: Partial<Project>, mergeKey?: string) =>
    store.edit((current) => ({ ...current, ...changes }), mergeKey);

  return (
    <>
      <Section title="Project">
        <TextField
          label="Name"
          value={project.name}
          onChange={(name) => edit({ name }, 'project-name')}
        />
      </Section>
      <Section title="Work area">
        <p className="hint">
          Allowed range of the program, relative to the zero point you set at the machine. Z = 0 is
          the workpiece surface. Machine travel: {machine.limits.x} × {machine.limits.y} ×{' '}
          {machine.limits.z} mm.
        </p>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <RangeFields
            key={axis}
            label={axis.toUpperCase()}
            range={workArea[axis]}
            onChange={(range) => edit({ workArea: { ...workArea, [axis]: range } })}
          />
        ))}
      </Section>
      <Section title="Workpiece">
        <p className="hint">For display and warnings only. Its top surface is at Z = 0.</p>
        {(['x', 'y'] as const).map((axis) => (
          <RangeFields
            key={axis}
            label={axis.toUpperCase()}
            range={workpiece[axis]}
            onChange={(range) => edit({ workpiece: { ...workpiece, [axis]: range } })}
          />
        ))}
        <NumberField
          label="Thickness"
          unit="mm"
          value={workpiece.thickness}
          onCommit={(thickness) => edit({ workpiece: { ...workpiece, thickness } })}
        />
        <button type="button" onClick={() => edit({ workpiece: workpieceFromWorkArea(workArea) })}>
          Same as work area
        </button>
      </Section>
      <IssueList issues={issues} />
      <Section title="End of program">
        <SelectField
          label="Afterwards"
          value={end.kind}
          options={[
            { value: 'stay', label: 'Stay at the last position, at safe Z' },
            { value: 'moveTo', label: 'Move to a position' },
          ]}
          onChange={(kind) =>
            edit({
              end:
                kind === 'stay'
                  ? { kind: 'stay' }
                  : { kind: 'moveTo', x: 0, y: 0, z: Math.min(20, workArea.z.max) },
            })
          }
        />
        {end.kind === 'moveTo' && (
          <>
            <p className="hint">The tool first moves to Z, then to X and Y.</p>
            <NumberField
              label="X"
              unit="mm"
              value={end.x}
              onCommit={(x) => edit({ end: { ...end, x } })}
            />
            <NumberField
              label="Y"
              unit="mm"
              value={end.y}
              onCommit={(y) => edit({ end: { ...end, y } })}
            />
            <NumberField
              label="Z"
              unit="mm"
              title="Must not be below safe Z"
              value={end.z}
              onCommit={(z) => edit({ end: { ...end, z } })}
            />
          </>
        )}
      </Section>
    </>
  );
}
