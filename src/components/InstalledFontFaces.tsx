import { backgroundImageUrl } from "@shared/background-image";
import { installedFontFaceCss } from "@shared/fonts";
import { useInstalledFonts } from "@/hooks/useInstalledFonts";

/**
 * Declares the @font-face rules of the installed fonts. Mounted in every
 * window, so the projector and the operator draw the same typefaces.
 */
export function InstalledFontFaces() {
  const fonts = useInstalledFonts();
  if (!fonts.length) return null;
  return <style>{installedFontFaceCss(fonts, backgroundImageUrl)}</style>;
}
