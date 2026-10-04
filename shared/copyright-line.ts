import licenses from "./bible-licenses.json";
import { getBible } from "./bible-service";

export function copyrightLineFor(versionId: string): string {
  const fromModule = getBible(versionId)?.meta.copyright?.trim();
  if (fromModule) return fromModule;
  const entry = licenses.versions.find((version) => version.id === versionId);
  return entry?.copyright?.trim() ?? "";
}

export function hasCopyrightLine(primaryId: string, secondaryId: string | null): boolean {
  return [primaryId, secondaryId].some((id): id is string => !!id && copyrightLineFor(id) !== "");
}

export function projectionCopyright(
  primaryId: string,
  secondaryId: string | null,
  show: boolean,
): string {
  // The full line only shows when the operator leaves the switch on. When it
  // is off, renderers show a ® mark by the version tag instead (see
  // hasCopyrightLine): attribution is handled outside the verse footer.
  if (!show) return "";
  const lines = [primaryId, secondaryId]
    .filter((id): id is string => !!id)
    .map(copyrightLineFor);
  return [...new Set(lines.filter(Boolean))].join(" · ");
}
