/** Shared slide-deck helpers (no Node/DOM deps: safe in main and renderer). */

export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}

/** Formats with no JS renderer (Keynote, legacy PowerPoint, OpenDocument): ask the user to export. */
export function isUnsupportedPresentationPath(filePath: string): boolean {
  return /\.(key|ppt|pot|pps|odp|otp)$/i.test(filePath);
}

/** Plain-text decks (TXT/MD/JSON) that are split into text slides. */
export function isSlideTextPath(filePath: string): boolean {
  return /\.(txt|md|json)$/i.test(filePath);
}

/**
 * Reconcile extracted texts with the rasterized page count: keep each
 * slide's text when present, fill the rest with navigation labels.
 */
export function reconcileSlides(texts: string[], pageCount: number): string[] {
  return Array.from({ length: pageCount }, (_, i) => texts[i]?.trim() || `Diapositiva ${i + 1}`);
}
