import { useEffect, useState } from "react";
import type { InstalledFont } from "@shared/fonts";

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
