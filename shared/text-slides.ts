/**
 * Free text (Textos) split into slides: each block separated by a blank line
 * is one slide, in the order it was written. Blocks keep their inner line
 * breaks and lose only the blank lines around them.
 */
export function textSlides(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}
