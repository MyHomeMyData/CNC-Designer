import { useId, useState, type ReactNode } from 'react';

/** Show a number without rounding noise, e.g. 0.30000000000000004 as 0.3. */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** Read a number as typed by the user; accepts a decimal comma. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly title?: string;
}

/**
 * A number input that only reports complete, valid numbers: the value is
 * committed when the field loses focus or Enter is pressed. Escape discards
 * the input.
 */
export function NumberField({ label, value, onCommit, unit, disabled, title }: NumberFieldProps) {
  const id = useId();
  // `null` while the field shows the value from outside.
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseNumber(draft) === null;

  function commit(): void {
    if (draft === null) return;
    const parsed = parseNumber(draft);
    if (parsed !== null && parsed !== value) onCommit(parsed);
    setDraft(null);
  }

  return (
    <div className="field" title={title}>
      <label htmlFor={id}>{label}</label>
      <span className="field-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className={invalid ? 'invalid' : undefined}
          value={draft ?? formatNumber(value)}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setDraft(null);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function TextField({ label, value, onChange }: TextFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="field-input">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </div>
  );
}

interface TextAreaFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
}

/** A text input for several lines. */
export function TextAreaField({ label, value, onChange, rows = 3 }: TextAreaFieldProps) {
  const id = useId();
  return (
    <div className="field-stacked">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="field-input">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

interface CheckFieldProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title?: string;
}

export function CheckField({ label, checked, onChange, title }: CheckFieldProps) {
  return (
    <label className="check" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}

/** A collapsible group of controls. */
export function Section({ title, children, defaultOpen = true }: SectionProps) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
