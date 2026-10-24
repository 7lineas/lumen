/** Typefaces that ship with the app. Each one has a fallback stack, so a font missing on a computer never breaks the text. */
export const BUILTIN_FONT_IDS = ["system", "geist", "arial", "verdana", "georgia", "times"] as const;

export type BuiltinFontId = (typeof BUILTIN_FONT_IDS)[number];

/** Fonts downloaded from Google Fonts are saved with this prefix (see InstalledFont.id). */
export const GOOGLE_FONT_PREFIX = "google-";

export type FontFamilyId = BuiltinFontId | `${typeof GOOGLE_FONT_PREFIX}${string}`;

export const BUILTIN_FONT_OPTIONS: { id: BuiltinFontId; label: string; stack: string }[] = [
  { id: "system", label: "Sistema", stack: `"Segoe UI", system-ui, -apple-system, sans-serif` },
  // Bundled with the app (see src/main.tsx), so it looks the same on every computer.
  { id: "geist", label: "Geist", stack: `"Geist Variable", system-ui, sans-serif` },
  { id: "arial", label: "Arial", stack: `Arial, Helvetica, sans-serif` },
  { id: "verdana", label: "Verdana", stack: `Verdana, Geneva, sans-serif` },
  { id: "georgia", label: "Georgia", stack: `Georgia, "Times New Roman", serif` },
  { id: "times", label: "Times New Roman", stack: `"Times New Roman", Times, serif` },
];

/** One @font-face of an installed font: one weight and one unicode range (a script or language subset). */
export interface InstalledFace {
  weight: string;
  style: "normal" | "italic";
  unicodeRange: string;
  /** Absolute path of the .woff2 file inside the app's user data folder. */
  file: string;
}

export interface InstalledFont {
  /** `google-<slug>`, e.g. `google-lora`. Also the CSS family name used for it. */
  id: string;
  family: string;
  category: string;
  faces: InstalledFace[];
}

export interface GoogleFontSearchResult {
  family: string;
  category: string;
  /** Has a Hebrew subset, so the Bible text can be set in it. */
  hebrew: boolean;
}

export interface FontChoice {
  id: FontFamilyId;
  label: string;
  stack: string;
}

export function isInstalledFontId(id: string): boolean {
  return id.startsWith(GOOGLE_FONT_PREFIX);
}

/** CSS font-family for a saved id. Unknown built-in ids use the system font. */
export function fontStack(id: FontFamilyId | string | undefined): string {
  if (id && isInstalledFontId(id)) return `"${id}", system-ui, -apple-system, sans-serif`;
  return (BUILTIN_FONT_OPTIONS.find((option) => option.id === id) ?? BUILTIN_FONT_OPTIONS[0]).stack;
}

/** Every font the operator can pick: built-in first, then the installed ones by name. */
export function fontChoices(installed: InstalledFont[]): FontChoice[] {
  const installedChoices = installed.map((font) => ({
    id: font.id as FontFamilyId,
    label: font.family,
    stack: fontStack(font.id),
  }));
  return [...BUILTIN_FONT_OPTIONS, ...installedChoices.sort((a, b) => a.label.localeCompare(b.label))];
}

/** @font-face rules for installed fonts. `urlFor` turns a stored file path into a URL the windows can load. */
export function installedFontFaceCss(fonts: InstalledFont[], urlFor: (file: string) => string | undefined): string {
  const rules: string[] = [];
  for (const font of fonts) {
    for (const face of font.faces) {
      const url = urlFor(face.file);
      if (!url) continue;
      rules.push(
        `@font-face { font-family: "${font.id}"; font-style: ${face.style}; font-weight: ${face.weight}; font-display: swap; ` +
          `src: url("${url}") format("woff2"); unicode-range: ${face.unicodeRange}; }`,
      );
    }
  }
  return rules.join("\n");
}
