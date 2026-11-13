import { NumberField, SelectField } from '../../ui/fields.tsx';
import { pickTextFile } from '../../ui/files.ts';
import type { PanelProps } from '../types.ts';
import { EMPTY_SVG_PARAMS, guessPlainUnit, readSvg, type SvgParams } from './generate.ts';

/** Let the user choose an SVG file; `null` if the dialog was cancelled. */
export async function pickSvg(tolerance = EMPTY_SVG_PARAMS.tolerance): Promise<SvgParams | null> {
  const file = await pickTextFile('.svg,image/svg+xml');
  if (!file) return null;
  return {
    fileName: file.name,
    source: file.text,
    tolerance,
    plainUnit: guessPlainUnit(file.text),
  };
}

export function SvgPanel({ params, onChange }: PanelProps<SvgParams>) {
  const result = params.source === '' ? null : readSvg(params);

  async function replace(): Promise<void> {
    const picked = await pickSvg(params.tolerance);
    if (picked) onChange(picked);
  }

  return (
    <>
      <p className="hint">
        {params.fileName ? `File: ${params.fileName}` : 'No file chosen yet.'}
        {result?.page &&
          ` — page ${result.page.width.toFixed(1)} × ${result.page.height.toFixed(1)} mm`}
        {result && !result.error && `, ${result.geometry.polylines.length} paths`}
      </p>
      <button type="button" onClick={() => void replace()}>
        {params.fileName ? 'Replace file…' : 'Choose file…'}
      </button>
      <SelectField
        label="Plain numbers"
        value={params.plainUnit}
        options={[
          { value: 'px', label: 'Pixels (96 per inch)' },
          { value: 'mm', label: 'Millimetres' },
        ]}
        onChange={(plainUnit) => onChange({ ...params, plainUnit })}
      />
      <NumberField
        label="Curve tolerance"
        unit="mm"
        title="Largest deviation when curves are turned into straight segments"
        value={params.tolerance}
        onCommit={(tolerance) => tolerance > 0 && onChange({ ...params, tolerance })}
      />
      {result?.error && <p className="hint error-text">{result.error}</p>}
      {result?.warnings.map((warning) => (
        <p key={warning} className="hint warning-text">
          {warning}
        </p>
      ))}
    </>
  );
}
