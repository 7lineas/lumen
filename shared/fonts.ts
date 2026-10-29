/** Typefaces that ship with the app. Each one has a fallback stack, so a font missing on a computer never breaks the text. */
export const BUILTIN_FONT_IDS = [
  "system",
  "geist",
  "arial",
  "verdana",
  "georgia",
  "times",
] as const;

export type BuiltinFontId = (typeof BUILTIN_FONT_IDS)[number];

/** Fonts downloaded from Google Fonts are saved with this prefix (see InstalledFont.id). */
export const GOOGLE_FONT_PREFIX = "google-";

export type FontFamilyId =
  | BuiltinFontId
  | `${typeof GOOGLE_FONT_PREFIX}${string}`;

export const BUILTIN_FONT_OPTIONS: {
  id: BuiltinFontId;
  label: string;
  stack: string;
}[] = [
  {
    id: "system",
    label: "Sistema",
    stack: `"Segoe UI", system-ui, -apple-system, sans-serif`,
  },
  // Bundled with the app (see src/main.tsx), so it looks the same on every computer.
  {
    id: "geist",
    label: "Geist",
    stack: `"Geist Variable", system-ui, sans-serif`,
  },
  { id: "arial", label: "Arial", stack: `Arial, Helvetica, sans-serif` },
  { id: "verdana", label: "Verdana", stack: `Verdana, Geneva, sans-serif` },
  {
    id: "georgia",
    label: "Georgia",
    stack: `Georgia, "Times New Roman", serif`,
  },
  {
    id: "times",
    label: "Times New Roman",
    stack: `"Times New Roman", Times, serif`,
  },
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

/** One remote file of a Google font, enough to draw it before it is installed. */
export interface GoogleFontPreviewFace {
  weight: string;
  unicodeRange: string;
  url: string;
}

export interface FontChoice {
  id: FontFamilyId;
  label: string;
  stack: string;
}

export function isInstalledFontId(id: string): boolean {
  return id.startsWith(GOOGLE_FONT_PREFIX);
}

/** A saved id that names a built-in font or an installed Google font (not a free-form string). */
export function isFontFamilyId(value: unknown): value is FontFamilyId {
  return (
    typeof value === "string" &&
    ((BUILTIN_FONT_IDS as readonly string[]).includes(value) ||
      isInstalledFontId(value))
  );
}

/** Weight used when nothing else is chosen (CSS "normal"). */
export const DEFAULT_FONT_WEIGHT = 400;

const WEIGHT_LABELS: Record<number, string> = {
  100: "Delgada",
  200: "Extraligera",
  300: "Ligera",
  400: "Normal",
  500: "Media",
  600: "Seminegrita",
  700: "Negrita",
  800: "Extranegrita",
  900: "Negra",
};

export function weightLabel(weight: number): string {
  return WEIGHT_LABELS[weight] ?? String(weight);
}

/**
 * Weights the operator can pick for a font. Installed fonts offer the upright
 * weights that were downloaded; Geist is a variable font; the other built-in
 * fonts are assumed to ship regular and bold only.
 */
export function fontWeightChoices(
  id: FontFamilyId | string | undefined,
  installed: InstalledFont[],
): number[] {
  if (id && isInstalledFontId(id)) {
    const font = installed.find((entry) => entry.id === id);
    const weights = [
      ...new Set(
        (font?.faces ?? [])
          .filter((face) => face.style === "normal")
          .map((face) => Number(face.weight)),
      ),
    ]
      .filter((weight) => Number.isFinite(weight))
      .sort((a, b) => a - b);
    return weights.length > 0 ? weights : [DEFAULT_FONT_WEIGHT];
  }
  if (id === "geist") return [300, 400, 500, 600, 700, 800];
  return [DEFAULT_FONT_WEIGHT, 700];
}

/** Keeps the current weight when the font offers it; otherwise normal, otherwise the lightest offered. */
export function resolveFontWeight(weight: number, choices: number[]): number {
  if (choices.includes(weight)) return weight;
  return choices.includes(DEFAULT_FONT_WEIGHT)
    ? DEFAULT_FONT_WEIGHT
    : (choices[0] ?? DEFAULT_FONT_WEIGHT);
}

/** CSS font-family for a saved id. Unknown built-in ids use the system font. */
export function fontStack(id: FontFamilyId | string | undefined): string {
  if (id && isInstalledFontId(id))
    return `"${id}", system-ui, -apple-system, sans-serif`;
  return (
    BUILTIN_FONT_OPTIONS.find((option) => option.id === id) ??
    BUILTIN_FONT_OPTIONS[0]
  ).stack;
}

/** Every font the operator can pick: built-in first, then the installed ones by name. */
export function fontChoices(installed: InstalledFont[]): FontChoice[] {
  const installedChoices = installed.map((font) => ({
    id: font.id as FontFamilyId,
    label: font.family,
    stack: fontStack(font.id),
  }));
  return [
    ...BUILTIN_FONT_OPTIONS,
    ...installedChoices.sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

/** @font-face rules for installed fonts. `urlFor` turns a stored file path into a URL the windows can load. */
export function installedFontFaceCss(
  fonts: InstalledFont[],
  urlFor: (file: string) => string | undefined,
): string {
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
