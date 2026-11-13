import { parse, type Font } from 'opentype.js';
import dancingScript from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?inline';
import merriweather from '@fontsource/merriweather/files/merriweather-latin-400-normal.woff?inline';
import merriweatherBold from '@fontsource/merriweather/files/merriweather-latin-700-normal.woff?inline';
import oswald from '@fontsource/oswald/files/oswald-latin-400-normal.woff?inline';
import roboto from '@fontsource/roboto/files/roboto-latin-400-normal.woff?inline';
import robotoBold from '@fontsource/roboto/files/roboto-latin-700-normal.woff?inline';

/**
 * Fonts that come with the app. All are published under the SIL Open Font
 * License 1.1 and cover Western European characters. They are embedded in
 * the app, so text never depends on what is installed on a computer.
 */
export const BUILTIN_FONTS: readonly { readonly id: string; readonly name: string }[] = [
  { id: 'roboto', name: 'Roboto' },
  { id: 'roboto-bold', name: 'Roboto Bold' },
  { id: 'merriweather', name: 'Merriweather' },
  { id: 'merriweather-bold', name: 'Merriweather Bold' },
  { id: 'oswald', name: 'Oswald' },
  { id: 'dancing-script', name: 'Dancing Script Bold' },
];

/** The embedded font files as data URLs. */
const BUILTIN_DATA: Readonly<Record<string, string>> = {
  roboto,
  'roboto-bold': robotoBold,
  merriweather,
  'merriweather-bold': merriweatherBold,
  oswald,
  'dancing-script': dancingScript,
};

/** The font a text uses: one that comes with the app, or a file supplied by the user. */
export type FontChoice =
  | { readonly kind: 'builtin'; readonly id: string }
  | {
      readonly kind: 'file';
      /** File name, for display. */
      readonly name: string;
      /** The font file, Base64 encoded, so that the project is complete in itself. */
      readonly data: string;
    };

export function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // In pieces: a single call with all bytes as arguments would overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Parsing a font takes time, so each font is parsed once. `null` marks an unusable font. */
const parsed = new Map<string, Font | null>();
/** At most this many user fonts are kept in memory. */
const MAX_FILE_FONTS = 6;
const fileKeys: string[] = [];

function parseBase64(base64: string): Font | null {
  try {
    return parse(decodeBase64(base64));
  } catch {
    return null;
  }
}

/** The font for a choice, or `null` if it does not exist or cannot be read. */
export function loadFont(choice: FontChoice): Font | null {
  const key = choice.kind === 'builtin' ? `builtin:${choice.id}` : `file:${choice.data}`;
  const known = parsed.get(key);
  if (known !== undefined) return known;

  let font: Font | null;
  if (choice.kind === 'builtin') {
    const dataUrl = BUILTIN_DATA[choice.id];
    font = dataUrl ? parseBase64(dataUrl.slice(dataUrl.indexOf(',') + 1)) : null;
  } else {
    font = parseBase64(choice.data);
    fileKeys.push(key);
    if (fileKeys.length > MAX_FILE_FONTS) parsed.delete(fileKeys.shift() as string);
  }
  parsed.set(key, font);
  return font;
}
