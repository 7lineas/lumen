import licenses from "./bible-licenses.json";
import { getBible } from "./bible-service";

export function copyrightLineFor(versionId: string): string {
  const fromModule = getBible(versionId)?.meta.copyright?.trim();
  if (fromModule) return fromModule;
  const entry = licenses.versions.find((version) => version.id === versionId);
  return entry?.copyright?.trim() ?? "";
}

export function projectionCopyright(
  primaryId: string,
  secondaryId: string | null,
  show: boolean,
): string {
  if (!show) return "";
  const lines = [copyrightLineFor(primaryId)];
  if (secondaryId) lines.push(copyrightLineFor(secondaryId));
  return [...new Set(lines.filter(Boolean))].join(" · ");
}
