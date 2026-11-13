import { NumberField, SelectField } from '../../ui/fields.tsx';
import type { PanelProps } from '../types.ts';
import {
  effectiveCornerRadius,
  parseShapesParams,
  SHAPE_DEFAULTS,
  type ShapeKind,
  type ShapesParams,
} from './generate.ts';

const SHAPE_OPTIONS: readonly { value: ShapeKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'grid', label: 'Point grid' },
];

export function ShapesPanel({ params, onChange }: PanelProps<ShapesParams>) {
  /** Apply a change only if the result is valid, e.g. not a negative width. */
  function change(next: ShapesParams): void {
    const valid = parseShapesParams(next);
    if (valid) onChange(valid);
  }

  return (
    <>
      <SelectField
        label="Shape"
        value={params.shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => onChange(SHAPE_DEFAULTS[shape])}
      />
      {params.shape === 'line' && (
        <>
          <NumberField
            label="Length in X"
            unit="mm"
            value={params.dx}
            onCommit={(dx) => change({ ...params, dx })}
          />
          <NumberField
            label="Length in Y"
            unit="mm"
            value={params.dy}
            onCommit={(dy) => change({ ...params, dy })}
          />
        </>
      )}
      {params.shape === 'rectangle' && (
        <>
          <NumberField
            label="Width"
            unit="mm"
            value={params.width}
            onCommit={(width) => change({ ...params, width })}
          />
          <NumberField
            label="Height"
            unit="mm"
            value={params.height}
            onCommit={(height) => change({ ...params, height })}
          />
          <NumberField
            label="Corner radius"
            unit="mm"
            value={params.cornerRadius}
            onCommit={(cornerRadius) => change({ ...params, cornerRadius })}
          />
          {effectiveCornerRadius(params) < params.cornerRadius && (
            <p className="hint">
              Limited to {effectiveCornerRadius(params)} mm, half of the shorter side.
            </p>
          )}
        </>
      )}
      {params.shape === 'circle' && (
        <NumberField
          label="Diameter"
          unit="mm"
          value={params.diameter}
          onCommit={(diameter) => change({ ...params, diameter })}
        />
      )}
      {params.shape === 'ellipse' && (
        <>
          <NumberField
            label="Width"
            unit="mm"
            value={params.width}
            onCommit={(width) => change({ ...params, width })}
          />
          <NumberField
            label="Height"
            unit="mm"
            value={params.height}
            onCommit={(height) => change({ ...params, height })}
          />
        </>
      )}
      {params.shape === 'grid' && (
        <>
          <NumberField
            label="Columns"
            value={params.columns}
            onCommit={(columns) => change({ ...params, columns })}
          />
          <NumberField
            label="Rows"
            value={params.rows}
            onCommit={(rows) => change({ ...params, rows })}
          />
          <NumberField
            label="Spacing in X"
            unit="mm"
            value={params.spacingX}
            onCommit={(spacingX) => change({ ...params, spacingX })}
          />
          <NumberField
            label="Spacing in Y"
            unit="mm"
            value={params.spacingY}
            onCommit={(spacingY) => change({ ...params, spacingY })}
          />
        </>
      )}
    </>
  );
}
