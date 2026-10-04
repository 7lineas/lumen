import licenses from "./bible-licenses.json";
import { getBible } from "./bible-service";
import { isOnlineVersionId } from "./youversion";

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
  // The publisher's license requires its attribution next to every online
  // Bible text, so the operator's "show copyright" switch cannot hide it.
  const online = [primaryId, secondaryId].filter((id): id is string => !!id && isOnlineVersionId(id));
  if (!show && online.length === 0) return "";
  const lines = [primaryId, secondaryId]
    .filter((id): id is string => !!id && (show || online.includes(id)))
    .map(copyrightLineFor);
  return [...new Set(lines.filter(Boolean))].join(" · ");
}
