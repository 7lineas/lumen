import { backgroundImageUrl } from "@shared/background-image";
import { toBase64 } from "./background-thumbnail";

const SLIDE_THUMBNAIL_WIDTH = 640;
const DECODE_TIMEOUT_MS = 12_000;

let thumbnailQueue = Promise.resolve();
const pendingThumbnails = new Map<string, Promise<boolean>>();

function loadSlideImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
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
    return false;
  }
}

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
