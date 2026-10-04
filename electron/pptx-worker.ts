/**
 * PPTX -> PNG worker. Runs inside an Electron utilityProcess so the heavy
 * resvg/WASM work never blocks the main process (projector/IPC stay snappy).
 */
import { renderPptxFile } from "./pptx-render-core";
import type { PptxWorkerRequest, PptxWorkerResponse } from "./pptx-worker-protocol";

function post(message: PptxWorkerResponse): void {
  process.parentPort.postMessage(message);
}

process.parentPort.on("message", (event) => {
  const request = event.data as PptxWorkerRequest;
  void renderPptxFile(request, post).catch((error: unknown) => {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
});
