/** Format a coordinate with three decimals; never prints "-0.000". */
export function formatCoordinate(value: number): string {
  const text = value.toFixed(3);
  return text === '-0.000' ? '0.000' : text;
}

/** Format a feed rate: whole numbers without decimals, otherwise up to three. */
export function formatFeed(value: number): string {
  return String(Number(value.toFixed(3)));
}

const TRANSLITERATION: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};

/**
 * Make text safe for a G-code comment: printable ASCII only, single line.
 * Controllers differ in how they treat other characters, so none are sent.
 */
export function commentText(text: string): string {
  return text
    .replace(/[äöüÄÖÜß]/g, (char) => TRANSLITERATION[char] ?? '?')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim();
}

/** Format minutes as h:mm:ss. */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
