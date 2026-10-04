/**
 * Turns the `content` of a YouVersion Platform passage (format=html) into
 * plain verse texts keyed by verse number.
 *
 * The API marks each verse start with an empty `<span class="yv-v" v="16">`
 * and prints its number in `yv-vlbl`; footnotes (`yv-n`) and section headings
 * (`yv-h`) are not part of the verse text and are dropped. Everything between
 * two markers belongs to the earlier verse. A marker with a range (`v="1-2"`)
 * is stored under its first number.
 */

const SKIP_CLASS = /(^|\s)(yv-n|yv-vlbl|yv-h|yv-fn|yv-label)(\s|$)/;
const VERSE_CLASS = /(^|\s)yv-v(\s|$)/;
const VOID_TAGS = new Set(["br", "img", "hr", "wbr"]);
const BLOCK_TAGS = new Set(["p", "div", "li", "br", "tr", "table", "ul", "ol", "blockquote"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? "") : null;
}

export function parseChapterContent(html: string): Record<number, string> {
  const parts = new Map<number, string[]>();
  let current: number | null = null;
  // Open elements; `skip` marks the ones whose content is not verse text.
  const stack: Array<{ tag: string; skip: boolean }> = [];
  let skipDepth = 0;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
  let last = 0;

  const addText = (raw: string) => {
    if (skipDepth > 0 || current === null || raw === "") return;
    parts.get(current)!.push(decodeEntities(raw));
  };

  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    addText(html.slice(last, m.index));
    last = tagRe.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const rest = m[3];
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          while (stack.length > i) {
            const top = stack.pop()!;
            if (top.skip) skipDepth--;
          }
          break;
        }
      }
      if (BLOCK_TAGS.has(tag) && skipDepth === 0 && current !== null) parts.get(current)!.push(" ");
      continue;
    }
    const cls = attr(rest, "class") ?? "";
    const verse = attr(rest, "v");
    if (VERSE_CLASS.test(cls) && verse !== null) {
      const number = parseInt(verse, 10);
      if (Number.isFinite(number) && number > 0) {
        current = number;
        if (!parts.has(number)) parts.set(number, []);
      }
    }
    if (BLOCK_TAGS.has(tag) && skipDepth === 0 && current !== null) parts.get(current)!.push(" ");
    if (VOID_TAGS.has(tag) || m[4] === "/") continue;
    const skip = SKIP_CLASS.test(cls);
    stack.push({ tag, skip });
    if (skip) skipDepth++;
  }
  addText(html.slice(last));

  const out: Record<number, string> = {};
  for (const [number, chunks] of parts) {
    const text = chunks.join("").replace(/\s+/g, " ").trim();
    if (text) out[number] = text;
  }
  return out;
}
