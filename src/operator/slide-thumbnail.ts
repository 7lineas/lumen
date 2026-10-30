import { backgroundImageUrl } from "@shared/background-image";
import { toBase64 } from "./background-thumbnail";

/** Covers a Media grid tile at 2x pixel density (tiles are at least 176px wide). */
const SLIDE_THUMBNAIL_WIDTH = 640;
const DECODE_TIMEOUT_MS = 12_000;

let thumbnailQueue = Promise.resolve();
const pendingThumbnails = new Map<string, Promise<boolean>>();

function loadSlideImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Same as video thumbnails: drawing the image to a canvas needs CORS to keep it untainted.
    image.crossOrigin = "anonymous";
    const timeout = window.setTimeout(
      () => reject(new Error("Slide thumbnail decode timed out")),
      DECODE_TIMEOUT_MS,
    );
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Slide thumbnail decode failed"));
    };
    image.src = source;
  });
}

async function decodeAndSaveThumbnail(filePath: string): Promise<boolean> {
  const source = backgroundImageUrl(filePath);
  if (!source || !window.proyector) return false;
  try {
    const image = await loadSlideImage(source);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return false;
    const scale = Math.min(1, SLIDE_THUMBNAIL_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) return false;
    return await window.proyector.saveSlideThumbnail(
      filePath,
      await toBase64(blob),
    );
  } catch {
    // The grid keeps showing the full slide when no thumbnail can be made.
    return false;
  }
}

/**
 * Make the small copy the Media grid shows for a slide image. Serialized and
 * de-duplicated like the video thumbnails: a deck of 100 slides is decoded one
 * at a time, not all at once.
 */
export function createSlideThumbnail(filePath: string): Promise<boolean> {
  const existing = pendingThumbnails.get(filePath);
  if (existing) return existing;
  const job = thumbnailQueue.then(() => decodeAndSaveThumbnail(filePath));
  thumbnailQueue = job.then(
    () => undefined,
    () => undefined,
  );
  pendingThumbnails.set(filePath, job);
  void job.then(
    () => pendingThumbnails.delete(filePath),
    () => pendingThumbnails.delete(filePath),
  );
  return job;
}
