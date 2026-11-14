import { CheckField } from '../../ui/fields.tsx';
import { pickTextFile } from '../../ui/files.ts';
import type { PanelProps } from '../types.ts';
import { readGcodeFile, sectionPoints, type GcodeParams } from './model.ts';

/** Let the user choose a G-code file; `null` if the dialog was cancelled. */
export async function pickGcode(): Promise<GcodeParams | null> {
  const file = await pickTextFile('.gcode,.nc,.ngc,.gc,.tap,.txt');
  return file ? readGcodeFile(file.name, file.text) : null;
}

/** Width and height of everything in the file, in mm. */
function extent(params: GcodeParams): { width: number; height: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const section of params.sections) {
    for (const path of section.paths) {
      for (let i = 0; i + 1 < path.length; i += 2) {
        const x = path[i] as number;
        const y = path[i + 1] as number;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return minX <= maxX ? { width: maxX - minX, height: maxY - minY } : null;
}

export function GcodePanel({ params, onChange }: PanelProps<GcodeParams>) {
  const size = extent(params);
  const points = params.sections.reduce((sum, section) => sum + sectionPoints(section), 0);
  const connectors = params.sections.filter((section) => section.kind === 'connector');

  async function replace(): Promise<void> {
    const picked = await pickGcode();
    if (picked) onChange(picked);
  }

  function enable(index: number, enabled: boolean): void {
    onChange({
      ...params,
      sections: params.sections.map((section, at) =>
        at === index ? { ...section, enabled } : section,
      ),
    });
  }

  return (
    <>
      <p className="hint">
        {params.fileName ? `File: ${params.fileName}` : 'No file chosen yet.'}
        {size && ` — ${size.width.toFixed(1)} × ${size.height.toFixed(1)} mm, ${points} points`}
      </p>
      <button type="button" onClick={() => void replace()}>
        {params.fileName ? 'Replace file…' : 'Choose file…'}
      </button>
      {params.notes.map((note) => (
        <p key={note} className="hint warning-text">
          {note}
        </p>
      ))}
      {params.sections.length > 0 && (
        <>
          <h3 className="sub-heading">Parts of the file</h3>
          <p className="hint">
            Only X and Y of the file are used; heights and feed rates come from the operation. Parts
            that are switched off are not worked: the tool travels above them.
          </p>
          {params.sections.map(
            (section, index) =>
              section.kind === 'layer' && (
                <CheckField
                  key={index}
                  label={`${section.name} · ${sectionPoints(section)} points`}
                  checked={section.enabled}
                  onChange={(enabled) => enable(index, enabled)}
                />
              ),
          )}
          {connectors.length > 0 && (
            <details className="connectors">
              <summary>
                Connectors: {connectors.filter((section) => section.enabled).length} of{' '}
                {connectors.length} worked
              </summary>
              <p className="hint">
                The ways from one layer to the next. A sand table has to draw them; here the tool
                can travel above the work instead.
              </p>
              {connectors.length > 1 && (
                <CheckField
                  label="All connectors"
                  checked={connectors.every((section) => section.enabled)}
                  onChange={(enabled) =>
                    onChange({
                      ...params,
                      sections: params.sections.map((section) =>
                        section.kind === 'connector' ? { ...section, enabled } : section,
                      ),
                    })
                  }
                />
              )}
              {params.sections.map(
                (section, index) =>
                  section.kind === 'connector' && (
                    <CheckField
                      key={index}
                      label={`${section.name} · ${sectionPoints(section)} points`}
                      checked={section.enabled}
                      onChange={(enabled) => enable(index, enabled)}
                    />
                  ),
              )}
            </details>
          )}
        </>
      )}
    </>
  );
}
