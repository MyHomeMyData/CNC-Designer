import { useId } from 'react';
import { distance } from '../../core/geometry/index.ts';
import { CheckField, NumberField, SelectField, TextField } from '../../ui/fields.tsx';
import type { PanelProps } from '../types.ts';
import { stringArtOf } from './compute.ts';
import {
  parseStringArtParams,
  type Curve,
  type Row,
  type StringArtParams,
  type Template,
  type Thread,
  type ThreadPart,
} from './model.ts';
import { rowNails } from './nails.ts';
import { applyTemplate, newPart, starGeometry, TEMPLATES } from './templates.ts';

type CurveKind = Curve['kind'];

const CURVE_OPTIONS: readonly { value: CurveKind; label: string }[] = [
  { value: 'segment', label: 'Straight line' },
  { value: 'arc', label: 'Circle or ellipse' },
  { value: 'polygon', label: 'Polygon' },
];

const CURVE_DEFAULTS: { readonly [K in CurveKind]: Extract<Curve, { kind: K }> } = {
  segment: { kind: 'segment', x1: 0, y1: 0, x2: 200, y2: 0 },
  arc: { kind: 'arc', cx: 0, cy: 0, rx: 200, ry: 200, start: 0, end: 360 },
  polygon: { kind: 'polygon', cx: 0, cy: 0, radius: 200, sides: 6, rotation: 0 },
};

/** Named rules; each sets the numbers of the general rule. */
const RULES: readonly {
  readonly id: string;
  readonly label: string;
  readonly apply: (part: ThreadPart) => ThreadPart;
  readonly matches: (part: ThreadPart) => boolean;
}[] = [
  {
    id: 'opposite',
    label: 'Opposite directions (parabola)',
    apply: (part) => ({ ...part, mode: 'zigzag', a: 1, b: 0, reverse: true }),
    matches: (p) => p.mode === 'zigzag' && p.a === 1 && p.b === 0 && p.reverse,
  },
  {
    id: 'same',
    label: 'Same direction (ladder)',
    apply: (part) => ({ ...part, mode: 'zigzag', a: 1, b: 0, reverse: false }),
    matches: (p) => p.mode === 'zigzag' && p.a === 1 && p.b === 0 && !p.reverse,
  },
  {
    id: 'offset',
    label: 'Fixed offset on one closed row (star)',
    apply: (part) => ({
      ...part,
      to: part.from,
      toCopy: 0,
      mode: 'chain',
      a: 1,
      b: Math.max(2, part.b),
      reverse: false,
    }),
    matches: (p) => p.mode === 'chain' && p.a === 1 && !p.reverse,
  },
  {
    id: 'multiple',
    label: 'Multiple on one closed row (times table)',
    apply: (part) => ({
      ...part,
      to: part.from,
      toCopy: 0,
      mode: 'zigzag',
      a: Math.max(2, part.a),
      b: 0,
      reverse: false,
    }),
    matches: (p) => p.mode === 'zigzag' && p.a >= 2 && p.b === 0 && !p.reverse,
  },
  {
    id: 'fan',
    label: 'Fan to one nail',
    apply: (part) => ({ ...part, mode: 'zigzag', a: 0, reverse: false }),
    matches: (p) => p.mode === 'zigzag' && p.a === 0,
  },
];

/** A name that is not in use yet: "prefix-1", "prefix-2", … */
function freshId(prefix: string, used: readonly string[]): string {
  let n = used.length + 1;
  while (used.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((old, i) => (i === index ? item : old));
}

function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

function ColorField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <span className="field-input">
        <input
          id={id}
          type="color"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </span>
    </div>
  );
}

function CurveFields(props: { readonly curve: Curve; readonly onChange: (curve: Curve) => void }) {
  const { curve, onChange } = props;
  const number = (label: string, value: number, set: (value: number) => Curve, unit = 'mm') => (
    <NumberField label={label} unit={unit} value={value} onCommit={(v) => onChange(set(v))} />
  );
  switch (curve.kind) {
    case 'segment':
      return (
        <>
          {number('Start X', curve.x1, (x1) => ({ ...curve, x1 }))}
          {number('Start Y', curve.y1, (y1) => ({ ...curve, y1 }))}
          {number('End X', curve.x2, (x2) => ({ ...curve, x2 }))}
          {number('End Y', curve.y2, (y2) => ({ ...curve, y2 }))}
        </>
      );
    case 'arc':
      return (
        <>
          {number('Centre X', curve.cx, (cx) => ({ ...curve, cx }))}
          {number('Centre Y', curve.cy, (cy) => ({ ...curve, cy }))}
          {number('Radius in X', curve.rx, (rx) => ({ ...curve, rx }))}
          {number('Radius in Y', curve.ry, (ry) => ({ ...curve, ry }))}
          {number('From angle', curve.start, (start) => ({ ...curve, start }), '°')}
          {number('To angle', curve.end, (end) => ({ ...curve, end }), '°')}
        </>
      );
    case 'polygon':
      return (
        <>
          {number('Centre X', curve.cx, (cx) => ({ ...curve, cx }))}
          {number('Centre Y', curve.cy, (cy) => ({ ...curve, cy }))}
          {number('Radius', curve.radius, (radius) => ({ ...curve, radius }))}
          {number('Sides', curve.sides, (sides) => ({ ...curve, sides: Math.round(sides) }), '')}
          {number('First corner at', curve.rotation, (rotation) => ({ ...curve, rotation }), '°')}
        </>
      );
  }
}

function RowEditor(props: {
  readonly row: Row;
  readonly onChange: (row: Row) => void;
  readonly onRemove: () => void;
}) {
  const { row, onChange, onRemove } = props;
  const { points, closed } = rowNails(row);
  const [first, second] = points;
  const gap = first && second ? distance(first, second) : 0;
  return (
    <details className="sub">
      <summary>
        {row.name || 'Row'} <span className="muted">· {points.length} nails</span>
      </summary>
      <div className="sub-body">
        <TextField label="Name" value={row.name} onChange={(name) => onChange({ ...row, name })} />
        <SelectField
          label="Curve"
          value={row.curve.kind}
          options={CURVE_OPTIONS}
          onChange={(kind) => onChange({ ...row, curve: CURVE_DEFAULTS[kind] })}
        />
        <CurveFields curve={row.curve} onChange={(curve) => onChange({ ...row, curve })} />
        <SelectField
          label="Nails by"
          value={row.nails.mode}
          options={[
            { value: 'count', label: 'Number' },
            { value: 'distance', label: 'Distance' },
          ]}
          onChange={(mode) =>
            onChange({
              ...row,
              nails:
                mode === 'count'
                  ? { mode, count: Math.max(2, points.length) }
                  : { mode, distance: Math.max(1, Math.round(gap * 10) / 10) },
            })
          }
        />
        {row.nails.mode === 'count' ? (
          <NumberField
            label="Number of nails"
            value={row.nails.count}
            onCommit={(count) =>
              onChange({ ...row, nails: { mode: 'count', count: Math.round(count) } })
            }
          />
        ) : (
          <NumberField
            label="Distance"
            unit="mm"
            value={row.nails.distance}
            onCommit={(d) => onChange({ ...row, nails: { mode: 'distance', distance: d } })}
          />
        )}
        <p className="hint">
          {points.length} nails, {gap.toFixed(1)} mm apart, {closed ? 'closed row' : 'open row'}.
          Nails are counted from 0.
        </p>
        <button type="button" onClick={onRemove}>
          Remove row
        </button>
      </div>
    </details>
  );
}

function PartEditor(props: {
  readonly part: ThreadPart;
  readonly index: number;
  readonly rows: readonly Row[];
  readonly repeat: number;
  readonly onChange: (part: ThreadPart) => void;
  readonly onRemove: () => void;
}) {
  const { part, index, rows, repeat, onChange, onRemove } = props;
  const ruleId = useId();
  const rowOptions = rows.map((row) => ({ value: row.id, label: row.name || row.id }));
  const known = (id: string) => rows.some((row) => row.id === id);
  const options = (id: string) =>
    known(id) ? rowOptions : [...rowOptions, { value: id, label: '(removed row)' }];
  const rule = RULES.find((candidate) => candidate.matches(part));
  const integer = (
    label: string,
    value: number,
    set: (v: number) => ThreadPart,
    title?: string,
  ) => (
    <NumberField
      label={label}
      value={value}
      onCommit={(v) => onChange(set(Math.round(v)))}
      {...(title ? { title } : {})}
    />
  );
  return (
    <div className="part">
      <div className="part-title">
        Part {index + 1}: {rule?.label ?? 'Own rule'}
      </div>
      <SelectField
        label="From row"
        value={part.from}
        options={options(part.from)}
        onChange={(from) => onChange({ ...part, from })}
      />
      <SelectField
        label="To row"
        value={part.to}
        options={options(part.to)}
        onChange={(to) => onChange({ ...part, to })}
      />
      {repeat > 1 &&
        integer(
          'To repetition',
          part.toCopy,
          (toCopy) => ({ ...part, toCopy }),
          '0: the row of the same repetition. 1: the row of the next repetition, and so on.',
        )}
      <div className="field">
        <label htmlFor={ruleId}>Set rule</label>
        <span className="field-input">
          <select
            id={ruleId}
            value=""
            onChange={(event) => {
              const chosen = RULES.find((candidate) => candidate.id === event.target.value);
              if (chosen) onChange(chosen.apply(part));
            }}
          >
            <option value="">Choose…</option>
            {RULES.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </span>
      </div>
      <p className="hint">
        Nail i goes to nail {part.a} × i {part.b < 0 ? '−' : '+'} {Math.abs(part.b)}
        {part.reverse ? ', counted from the far end of the row' : ''}.
      </p>
      {integer('Factor a', part.a, (a) => ({ ...part, a }))}
      {integer('Offset b', part.b, (b) => ({ ...part, b }))}
      <CheckField
        label="Count the target row from its far end"
        checked={part.reverse}
        onChange={(reverse) => onChange({ ...part, reverse })}
      />
      <SelectField
        label="Thread runs"
        value={part.mode}
        options={[
          { value: 'zigzag', label: 'There and back' },
          { value: 'chain', label: 'As a chain' },
        ]}
        onChange={(mode) => onChange({ ...part, mode })}
      />
      {integer('First nail', part.start, (start) => ({ ...part, start }))}
      {integer('Every … nail', part.step, (step) => ({ ...part, step }))}
      {integer(
        'Lines',
        part.count ?? 0,
        (count) => ({ ...part, count: count > 0 ? count : null }),
        '0: as many lines as the rows allow.',
      )}
      <button type="button" onClick={onRemove}>
        Remove part
      </button>
    </div>
  );
}

function ThreadEditor(props: {
  readonly thread: Thread;
  readonly rows: readonly Row[];
  readonly repeat: number;
  readonly onChange: (thread: Thread, mergeKey?: string) => void;
  readonly onRemove: () => void;
}) {
  const { thread, rows, repeat, onChange, onRemove } = props;
  const firstRow = rows[0]?.id ?? '';
  return (
    <details className="sub">
      <summary>
        <span className="swatches">
          {thread.colors.map((color, index) => (
            <span key={index} className="swatch" style={{ background: color }} />
          ))}
        </span>
        {thread.name || 'Thread'}
        {!thread.visible && <span className="muted"> · hidden</span>}
      </summary>
      <div className="sub-body">
        <TextField
          label="Name"
          value={thread.name}
          onChange={(name) => onChange({ ...thread, name })}
        />
        <CheckField
          label="Show"
          checked={thread.visible}
          onChange={(visible) => onChange({ ...thread, visible })}
        />
        {thread.colors.map((color, index) => (
          <ColorField
            key={index}
            label={thread.colors.length > 1 ? `Colour ${index + 1}` : 'Colour'}
            value={color}
            onChange={(value) =>
              onChange(
                { ...thread, colors: replaceAt(thread.colors, index, value) },
                `stringart-color-${thread.id}-${index}`,
              )
            }
          />
        ))}
        {repeat > 1 && (
          <div className="row">
            <button
              type="button"
              title="Colours take turns from one repetition to the next"
              onClick={() =>
                onChange({ ...thread, colors: [...thread.colors, thread.colors[0] ?? '#ffffff'] })
              }
            >
              Add colour
            </button>
            {thread.colors.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ ...thread, colors: thread.colors.slice(0, -1) })}
              >
                Remove colour
              </button>
            )}
          </div>
        )}
        {thread.parts.map((part, index) => (
          <PartEditor
            key={index}
            part={part}
            index={index}
            rows={rows}
            repeat={repeat}
            onChange={(next) =>
              onChange({ ...thread, parts: replaceAt(thread.parts, index, next) })
            }
            onRemove={() => onChange({ ...thread, parts: removeAt(thread.parts, index) })}
          />
        ))}
        <div className="row">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              onChange({
                ...thread,
                parts: [...thread.parts, newPart(firstRow, rows[1]?.id ?? firstRow)],
              })
            }
          >
            Add part
          </button>
          <button type="button" onClick={onRemove}>
            Remove thread
          </button>
        </div>
      </div>
    </details>
  );
}

/** The few parameters of a template; every change builds the design anew. */
function TemplateFields(props: {
  readonly template: Template;
  readonly onChange: (template: Template) => void;
}) {
  const { template, onChange } = props;
  const whole = Math.round;
  switch (template.id) {
    case 'circle-axes':
      return (
        <>
          <NumberField
            label="Radius"
            unit="mm"
            value={template.radius}
            onCommit={(radius) => onChange({ ...template, radius })}
          />
          <NumberField
            label="Nails per row"
            title="On each half axis and on each quarter of the circle"
            value={template.nails}
            onCommit={(nails) => onChange({ ...template, nails: whole(nails) })}
          />
        </>
      );
    case 'parabola-star': {
      const { inner, opening, leg } = starGeometry(template);
      return (
        <>
          <NumberField
            label="Triangles"
            title="Triangles that point outwards and join without a gap"
            value={template.points}
            onCommit={(points) => onChange({ ...template, points: whole(points) })}
          />
          <NumberField
            label="Outer radius"
            unit="mm"
            title="Distance of the tips from the centre"
            value={template.outer}
            onCommit={(outer) => onChange({ ...template, outer })}
          />
          <NumberField
            label="Triangle height"
            unit="mm"
            title="From the base of a triangle to its tip; smaller than the outer radius"
            value={template.height}
            onCommit={(height) => onChange({ ...template, height })}
          />
          <NumberField
            label="Nails per leg"
            value={template.nails}
            onCommit={(nails) => onChange({ ...template, nails: whole(nails) })}
          />
          <p className="hint">
            Opening angle {opening.toFixed(1)}°, legs {leg.toFixed(1)} mm, inner circle of radius{' '}
            {inner.toFixed(1)} mm.
          </p>
        </>
      );
    }
    case 'spokes-tangents':
      return (
        <>
          <NumberField
            label="Spokes"
            title="Rows that point to the centre; between each two of them lies one tangent row. An even number lets two colours take turns."
            value={template.count}
            onCommit={(count) => onChange({ ...template, count: whole(count) })}
          />
          <NumberField
            label="Spokes from"
            unit="mm"
            title="Distance of the innermost nail of a spoke from the centre"
            value={template.inner}
            onCommit={(inner) => onChange({ ...template, inner })}
          />
          <NumberField
            label="Spokes to"
            unit="mm"
            title="Distance of the outermost nail of a spoke from the centre"
            value={template.outer}
            onCommit={(outer) => onChange({ ...template, outer })}
          />
          <NumberField
            label="Tangent circle"
            unit="mm"
            title="Radius of the circle that the tangent rows touch in their middle"
            value={template.radius}
            onCommit={(radius) => onChange({ ...template, radius })}
          />
          <NumberField
            label="Tangent length"
            unit="mm"
            value={template.length}
            onCommit={(length) => onChange({ ...template, length })}
          />
          <NumberField
            label="Nails per row"
            value={template.nails}
            onCommit={(nails) => onChange({ ...template, nails: whole(nails) })}
          />
        </>
      );
    case 'cardioid':
      return (
        <>
          <NumberField
            label="Radius"
            unit="mm"
            value={template.radius}
            onCommit={(radius) => onChange({ ...template, radius })}
          />
          <NumberField
            label="Nails"
            value={template.nails}
            onCommit={(nails) => onChange({ ...template, nails: whole(nails) })}
          />
          <NumberField
            label="Factor"
            title="Nail i goes to nail factor × i"
            value={template.factor}
            onCommit={(factor) => onChange({ ...template, factor: whole(factor) })}
          />
        </>
      );
  }
}

export function StringArtPanel({ params, onChange }: PanelProps<StringArtParams>) {
  const templateId = useId();
  /** Apply a change only if the result is valid, e.g. not a negative radius. */
  function change(next: StringArtParams, mergeKey?: string): void {
    const valid = parseStringArtParams(next);
    if (valid) onChange(valid, mergeKey);
  }
  /** A change to rows, rules or repetitions: the design no longer follows its template. */
  function changeByHand(next: StringArtParams): void {
    change({ ...next, template: null });
  }
  const art = stringArtOf(params);
  const template = params.template;

  return (
    <>
      <div className="field">
        <label htmlFor={templateId}>Template</label>
        <span className="field-input">
          <select
            id={templateId}
            value={template?.id ?? ''}
            onChange={(event) => {
              const chosen = TEMPLATES.find((candidate) => candidate.id === event.target.value);
              if (chosen) change(applyTemplate(params, chosen.defaults));
            }}
          >
            {!template && <option value="">Own design</option>}
            {TEMPLATES.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </span>
      </div>
      {template && (
        <TemplateFields
          template={template}
          onChange={(next) => change(applyTemplate(params, next))}
        />
      )}
      <ColorField
        label="Board colour"
        value={params.background}
        onChange={(background) => change({ ...params, background }, 'stringart-background')}
      />
      <NumberField
        label="Smallest distance"
        unit="mm"
        title="Nails closer together than this are reported"
        value={params.minSpacing}
        onCommit={(minSpacing) => change({ ...params, minSpacing })}
      />
      <NumberField
        label="Nail diameter"
        unit="mm"
        title="Used for the thread length: one turn round every nail"
        value={params.nailDiameter}
        onCommit={(nailDiameter) => change({ ...params, nailDiameter })}
      />

      <h3 className="sub-heading">Rows of nails</h3>
      {template && (
        <p className="hint">
          Rows, repetitions and thread rules come from the template. Changing them here turns this
          into a design of your own; the template settings above then no longer apply.
        </p>
      )}
      <NumberField
        label="Repetitions"
        title="Rows and threads are repeated this many times around the layer position"
        value={params.repeat}
        onCommit={(repeat) => changeByHand({ ...params, repeat: Math.round(repeat) })}
      />
      {params.rows.map((row, index) => (
        <RowEditor
          key={row.id}
          row={row}
          onChange={(next) =>
            changeByHand({ ...params, rows: replaceAt(params.rows, index, next) })
          }
          onRemove={() => changeByHand({ ...params, rows: removeAt(params.rows, index) })}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          const id = freshId(
            'row',
            params.rows.map((row) => row.id),
          );
          changeByHand({
            ...params,
            rows: [
              ...params.rows,
              {
                id,
                name: `Row ${params.rows.length + 1}`,
                curve: CURVE_DEFAULTS.segment,
                nails: { mode: 'count', count: 21 },
              },
            ],
          });
        }}
      >
        Add row
      </button>

      <h3 className="sub-heading">Threads</h3>
      {params.threads.map((thread, index) => (
        <ThreadEditor
          key={thread.id}
          thread={thread}
          rows={params.rows}
          repeat={params.repeat}
          onChange={(next, mergeKey) => {
            const threads = replaceAt(params.threads, index, next);
            // Name, colours and visibility are free; the rules belong to the template.
            if (next.parts === thread.parts) {
              change({ ...params, threads }, mergeKey);
            } else changeByHand({ ...params, threads });
          }}
          onRemove={() => changeByHand({ ...params, threads: removeAt(params.threads, index) })}
        />
      ))}
      <button
        type="button"
        disabled={params.rows.length === 0}
        onClick={() => {
          const id = freshId(
            'thread',
            params.threads.map((thread) => thread.id),
          );
          const first = params.rows[0]?.id ?? '';
          changeByHand({
            ...params,
            threads: [
              ...params.threads,
              {
                id,
                name: `Thread ${params.threads.length + 1}`,
                colors: ['#e8e8e8'],
                visible: true,
                parts: [newPart(first, params.rows[1]?.id ?? first)],
              },
            ],
          });
        }}
      >
        Add thread
      </button>

      <h3 className="sub-heading">Result</h3>
      <p className="hint">{art.layout.nails.length} nails to drill.</p>
      {art.threads.map((thread, index) => (
        <p key={index} className="hint">
          <span className="swatch" style={{ background: thread.color }} /> {thread.name}:{' '}
          {(thread.length / 1000).toFixed(1)} m of thread
          {thread.joins.length > 0 &&
            `, ${thread.joins.length} ${thread.joins.length === 1 ? 'crossing' : 'crossings'} between parts (longest ${Math.max(...thread.joins.map((join) => join.length)).toFixed(0)} mm)`}
          .
        </p>
      ))}
      {art.issues.map((issue) => (
        <p key={issue} className="hint warning-text">
          {issue}
        </p>
      ))}
    </>
  );
}
