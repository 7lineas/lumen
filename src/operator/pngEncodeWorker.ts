/// <reference lib="webworker" />
/**
 * PNG encoder for rasterized PDF pages. Chromium encodes canvas.toBlob PNGs
 * one at a time, which made encoding ~70% of a PDF import. Several of these
 * workers encode pages in parallel with the same encoder (byte-identical
 * PNGs) and hand back base64 so the UI thread does no per-byte work.
 */
export type PngEncodeRequest = { id: number; bitmap: ImageBitmap };
export type PngEncodeResponse =
  | { id: number; base64: string }
  | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<PngEncodeRequest>) => {
  const { id, bitmap } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const dataUrl = new FileReaderSync().readAsDataURL(blob);
    const response: PngEncodeResponse = {
      id,
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };
    scope.postMessage(response);
  } catch (error) {
    bitmap.close();
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies PngEncodeResponse);
  }
};
