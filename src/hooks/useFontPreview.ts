import { useEffect, useState } from "react";
import type { GoogleFontPreviewFace } from "@shared/fonts";

/** Families already registered (or being registered) with the document. Kept for the session so each one is fetched once. */
const loads = new Map<string, Promise<void>>();

/** Named apart from installed fonts ("google-…") and system fonts, so the preview never replaces them. */
function previewName(family: string): string {
  return `Lumen preview ${family}`;
}

function loadPreview(family: string): Promise<void> {
  let load = loads.get(family);
  if (!load) {
    load = window
      .proyector!.previewGoogleFont(family)
      .then((faces: GoogleFontPreviewFace[]) => {
        // The browser downloads each file only when text needs its unicode range, so the family name costs one small file.
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

/** Font stack that draws a Google family in its own typeface. Undefined until the preview is registered. */
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
