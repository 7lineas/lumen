/**
 * Turns the stored background value into a CSS url() target.
 * Values are managed absolute file paths copied into the app's user-data directory.
 */
export function backgroundImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return `lumen-media://local/media/${encodeURIComponent(value)}`;
}

export function isBackgroundVideo(value: string | null | undefined): boolean {
  return !!value && /\.(mp4|webm|ogg|mov)$/i.test(value);
}
