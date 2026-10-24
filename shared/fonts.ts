/** Typefaces the operator can project with. Each one has a fallback stack, so a font missing on a computer never breaks the text. */
export const FONT_FAMILIES = ["system", "geist", "arial", "verdana", "georgia", "times"] as const;

export type FontFamilyId = (typeof FONT_FAMILIES)[number];

export const FONT_FAMILY_OPTIONS: { id: FontFamilyId; label: string; stack: string }[] = [
  { id: "system", label: "Sistema", stack: `"Segoe UI", system-ui, -apple-system, sans-serif` },
  // Bundled with the app (see src/main.tsx), so it looks the same on every computer.
  { id: "geist", label: "Geist", stack: `"Geist Variable", system-ui, sans-serif` },
  { id: "arial", label: "Arial", stack: `Arial, Helvetica, sans-serif` },
  { id: "verdana", label: "Verdana", stack: `Verdana, Geneva, sans-serif` },
  { id: "georgia", label: "Georgia", stack: `Georgia, "Times New Roman", serif` },
  { id: "times", label: "Times New Roman", stack: `"Times New Roman", Times, serif` },
];

/** CSS font-family for a saved id. Unknown ids (old or edited settings) use the system font. */
export function fontStack(id: FontFamilyId | string | undefined): string {
  return (FONT_FAMILY_OPTIONS.find((option) => option.id === id) ?? FONT_FAMILY_OPTIONS[0]).stack;
}
