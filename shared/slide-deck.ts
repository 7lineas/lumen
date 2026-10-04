/** Shared slide-deck helpers (no Node/DOM deps: safe in main and renderer). */

export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}

/** Formats with no JS renderer (Keynote, legacy PowerPoint, OpenDocument): ask the user to export. */
export function isUnsupportedPresentationPath(filePath: string): boolean {
  return /\.(key|ppt|pot|pps|odp|otp)$/i.test(filePath);
}

/** Label for a slide in navigation lists (slides carry no text, only an image). */
export function slideLabel(index: number): string {
  return `Diapositiva ${index + 1}`;
}
