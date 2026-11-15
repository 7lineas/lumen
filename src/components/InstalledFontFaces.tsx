import { backgroundImageUrl } from "@shared/background-image";
import { installedFontFaceCss } from "@shared/fonts";
import { useInstalledFonts } from "@/hooks/useInstalledFonts";

export function InstalledFontFaces() {
  const fonts = useInstalledFonts();
  if (!fonts.length) return null;
  return <style>{installedFontFaceCss(fonts, backgroundImageUrl)}</style>;
}
