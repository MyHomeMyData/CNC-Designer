import { SaxesParser } from 'saxes';

/** An XML element reduced to what the SVG reader needs. */
export interface XmlElement {
  /** Element name without namespace prefix, e.g. `path`. */
  readonly name: string;
  /** Namespace prefix of the element, e.g. `sodipodi`; empty for none. */
  readonly prefix: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
}

export type XmlResult =
  | { readonly root: XmlElement; readonly error: null }
  | { readonly root: null; readonly error: string };

/**
 * Parse an XML document into a tree of elements. Text content is ignored.
 *
 * A JavaScript parser is used instead of the browser's `DOMParser` so that
 * the same code runs in tests and, later, in background workers.
 */
export function parseXml(source: string): XmlResult {
  const parser = new SaxesParser();
  interface Building {
    name: string;
    prefix: string;
    attributes: Record<string, string>;
    children: XmlElement[];
  }
  const stack: Building[] = [];
  let root: XmlElement | null = null;
  let error: string | null = null;

  parser.on('error', (e) => {
    error ??= e.message;
  });
  parser.on('opentag', (tag) => {
    const colon = tag.name.indexOf(':');
    stack.push({
      name: colon < 0 ? tag.name : tag.name.slice(colon + 1),
      prefix: colon < 0 ? '' : tag.name.slice(0, colon),
      attributes: tag.attributes,
      children: [],
    });
  });
  parser.on('closetag', () => {
    const element = stack.pop();
    if (!element) return;
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else root = element;
  });

  try {
    parser.write(source).close();
  } catch (e) {
    error ??= e instanceof Error ? e.message : String(e);
  }
  if (error !== null) return { root: null, error };
  if (root === null) return { root: null, error: 'The document is empty.' };
  return { root, error: null };
}
