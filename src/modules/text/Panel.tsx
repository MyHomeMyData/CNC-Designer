import { NumberField, SelectField, TextAreaField } from '../../ui/fields.tsx';
import { pickBinaryFile } from '../../ui/files.ts';
import type { PanelProps } from '../types.ts';
import { BUILTIN_FONTS, encodeBase64, loadFont } from './fonts.ts';
import type { TextParams } from './generate.ts';
import { missingCharacters } from './layout.ts';

/** Value of the font list entry that stands for the user's own font file. */
const OWN_FONT = 'file';

export function TextPanel({ params, onChange }: PanelProps<TextParams>) {
  const font = loadFont(params.font);
  const missing = font ? missingCharacters(font, params.text) : [];
  const ownFont = params.font.kind === 'file' ? params.font : null;

  async function chooseFontFile(): Promise<void> {
    const file = await pickBinaryFile('.ttf,.otf,.woff');
    if (file) {
      onChange({
        ...params,
        font: { kind: 'file', name: file.name, data: encodeBase64(file.data) },
      });
    }
  }

  return (
    <>
      <TextAreaField
        label="Text"
        value={params.text}
        onChange={(text) => onChange({ ...params, text }, 'text')}
      />
      <SelectField
        label="Font"
        value={params.font.kind === 'builtin' ? params.font.id : OWN_FONT}
        options={[
          ...BUILTIN_FONTS.map(({ id, name }) => ({ value: id, label: name })),
          ...(ownFont ? [{ value: OWN_FONT, label: ownFont.name }] : []),
        ]}
        onChange={(id) => id !== OWN_FONT && onChange({ ...params, font: { kind: 'builtin', id } })}
      />
      <button type="button" onClick={() => void chooseFontFile()}>
        Use a font file…
      </button>
      <p className="hint">
        Fonts in TTF, OTF or WOFF format. The file is stored in the project. Letters are drawn as
        outlines.
      </p>
      {!font && <p className="hint error-text">This font cannot be read.</p>}
      {missing.length > 0 && (
        <p className="hint warning-text">The font has no shape for: {missing.join(' ')}</p>
      )}
      <NumberField
        label="Letter height"
        unit="mm"
        title="Height of a capital letter"
        value={params.capHeight}
        onCommit={(capHeight) => capHeight > 0 && onChange({ ...params, capHeight })}
      />
      <NumberField
        label="Letter spacing"
        unit="mm"
        title="Extra space between letters; may be negative"
        value={params.letterSpacing}
        onCommit={(letterSpacing) => onChange({ ...params, letterSpacing })}
      />
      <NumberField
        label="Line spacing"
        title="Distance between lines as a multiple of the letter height"
        value={params.lineSpacing}
        onCommit={(lineSpacing) => lineSpacing > 0 && onChange({ ...params, lineSpacing })}
      />
      <SelectField
        label="Alignment"
        value={params.align}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={(align) => onChange({ ...params, align })}
      />
      <NumberField
        label="Curve tolerance"
        unit="mm"
        title="Largest deviation when curves are turned into straight segments"
        value={params.tolerance}
        onCommit={(tolerance) => tolerance > 0 && onChange({ ...params, tolerance })}
      />
    </>
  );
}
