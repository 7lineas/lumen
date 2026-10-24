import { useEffect, useState } from "react";
import type { InstalledFont } from "@shared/fonts";

/** Fonts downloaded from Google Fonts. Starts empty, then follows every change made in the app. */
export function useInstalledFonts(): InstalledFont[] {
  const [fonts, setFonts] = useState<InstalledFont[]>([]);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    let cancelled = false;
    void api
      .listInstalledFonts()
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .catch(() => undefined);
    const off = api.onFontsUpdate(setFonts);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return fonts;
}
