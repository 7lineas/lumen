import { useEffect, useState } from "react";
import type { GoogleFontPreviewFace } from "@shared/fonts";

const loads = new Map<string, Promise<void>>();

function previewName(family: string): string {
  return `Lumen preview ${family}`;
}

function loadPreview(family: string): Promise<void> {
  let load = loads.get(family);
  if (!load) {
    load = window
      .proyector!.previewGoogleFont(family)
      .then((faces: GoogleFontPreviewFace[]) => {
        for (const face of faces) {
          document.fonts.add(
            new FontFace(previewName(family), `url("${face.url}")`, {
              weight: face.weight,
              unicodeRange: face.unicodeRange,
            }),
          );
        }
      });
    load.catch(() => loads.delete(family));
    loads.set(family, load);
  }
  return load;
}

export function useFontPreview(family: string): string | undefined {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!window.proyector) return;
    let cancelled = false;
    loadPreview(family).then(
      () => {
        if (!cancelled) setReady(true);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [family]);

  return ready
    ? `"${previewName(family)}", system-ui, -apple-system, sans-serif`
    : undefined;
}
