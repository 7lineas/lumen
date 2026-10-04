import { decodeEntities } from "../youversion-parse";

export interface XmlHandlers {
  open(tag: string, attrs: Record<string, string>, selfClosing: boolean): void;
  close(tag: string): void;
  text(value: string): void;
}

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (let m = ATTR.exec(source); m; m = ATTR.exec(source)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? "");
  }
  ATTR.lastIndex = 0;
  return attrs;
}

/** Minimal, forgiving XML walker for Bible files (no DTD, no namespaces; tags are lower-cased). */
export function walkXml(xml: string, handlers: XmlHandlers): void {
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    if (m.index > last) handlers.text(decodeEntities(xml.slice(last, m.index)));
    last = TOKEN.lastIndex;
    if (m[1] !== undefined) {
      handlers.text(m[1]);
      continue;
    }
    if (m[3] === undefined) continue; // comment, PI, doctype
    const tag = m[3].toLowerCase();
    if (m[2] === "/") handlers.close(tag);
    else {
      const selfClosing = m[5] === "/";
      // Self-closing tags get no close() call: handlers use the flag.
      handlers.open(tag, parseAttrs(m[4]), selfClosing);
    }
  }
  if (last < xml.length) handlers.text(decodeEntities(xml.slice(last)));
}
