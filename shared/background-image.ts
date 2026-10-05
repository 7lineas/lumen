/**
 * Turns the stored background value into a CSS url() target.
 * Values are managed absolute file paths copied into the app's user-data directory.
 */
export function backgroundImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof window !== "undefined" && window.__LUMEN_BROWSER__) {
    return `/media/${encodeURIComponent(value)}`;
  }
  return `lumen-media://local/media/${encodeURIComponent(value)}`;
}

/** Thumbnail sidecar generated for background videos. */
export function backgroundThumbnailUrl(value: string | null | undefined): string | undefined {
  if (!value || !isBackgroundVideo(value)) return undefined;
  return backgroundImageUrl(`${value}.thumbnail.jpg`);
}

export function isBackgroundVideo(value: string | null | undefined): boolean {
  return !!value && /\.(mp4|webm|ogg|mov)$/i.test(value);
}
