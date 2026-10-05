import { backgroundImageUrl } from "@shared/background-image";

const THUMBNAIL_MAX_WIDTH = 480;
const THUMBNAIL_MAX_HEIGHT = 270;
const DECODE_TIMEOUT_MS = 12_000;
let thumbnailQueue = Promise.resolve();
const pendingThumbnails = new Map<string, Promise<boolean>>();
const completedThumbnails = new Map<string, boolean>();

function waitForMediaEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Video thumbnail decode timed out")), DECODE_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error("Video thumbnail decode failed"));
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not encode video thumbnail"));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const comma = dataUrl.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode video thumbnail"));
      else resolve(dataUrl.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function decodeAndSaveThumbnail(filePath: string): Promise<boolean> {
  const source = backgroundImageUrl(filePath);
  if (!source || !window.proyector) return false;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = source;

  try {
    const metadataReady = waitForMediaEvent(video, "loadedmetadata");
    video.load();
    await metadataReady;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const seeked = waitForMediaEvent(video, "seeked");
      video.currentTime = Math.min(1, video.duration / 2);
      await seeked;
    } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const frameReady = waitForMediaEvent(video, "loadeddata");
      await frameReady;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return false;
    const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width, THUMBNAIL_MAX_HEIGHT / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return false;
    return await window.proyector.saveBackgroundThumbnail(filePath, await toBase64(blob));
  } catch {
    // Unsupported codecs or malformed media still remain usable as backgrounds;
    // their library card displays a static video placeholder instead.
    return false;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

/** Serialize thumbnail work: older libraries can be backfilled without loading many videos at once. */
export function createBackgroundVideoThumbnail(filePath: string): Promise<boolean> {
  const existing = pendingThumbnails.get(filePath);
  if (existing) return existing;
  const completed = completedThumbnails.get(filePath);
  if (completed !== undefined) return Promise.resolve(completed);
  const job = thumbnailQueue.then(() => decodeAndSaveThumbnail(filePath));
  thumbnailQueue = job.then(() => undefined, () => undefined);
  pendingThumbnails.set(filePath, job);
  void job.then(
    (result) => { completedThumbnails.set(filePath, result); pendingThumbnails.delete(filePath); },
    () => { completedThumbnails.set(filePath, false); pendingThumbnails.delete(filePath); },
  );
  return job;
}
