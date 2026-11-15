import releasesData from "../../../landing/releases.json";
import configData from "../../../landing/config.json";
import licensesData from "../../../shared/bible-licenses.json";
import { joinDownloadUrl } from "../../../landing/download-url.js";

export type ReleaseFile = {
  id: string;
  role: string;
  label: string;
  filename: string;
  bytes: number;
  sha256: string;
};

export type Release = {
  version: string;
  releasedAt: string;
  downloadBaseUrl: string;
  files: ReleaseFile[];
};

export type BibleVersion = {
  name: string;
  abbr: string;
  language: string;
  license: string;
  sourceName?: string;
  sourceUrl?: string;
  availability?: string;
  draft?: boolean;
  copyright?: string;
  attribution?: string;
};

export type Licenses = {
  distributionNote?: string;
  excludedNote?: string;
  versions: BibleVersion[];
};

declare const __DOWNLOAD_BASE_URL_OVERRIDE__: string;

const config = configData as {
  DOWNLOAD_BASE_URL?: string;
  supportHref?: string;
  supportLabel?: string;
};
const releases = releasesData as Release;
const licenses = licensesData as Licenses;

/** Setup and portable downloads, resolved at build time from releases.json. */
export const landingData = (() => {
  const files = Array.isArray(releases.files) ? releases.files : [];
  const base = String(
    __DOWNLOAD_BASE_URL_OVERRIDE__ ||
      config.DOWNLOAD_BASE_URL ||
      releases.downloadBaseUrl ||
      "",
  ).trim();
  const setup = files.find(
    (file) => file.role === "primary" || file.id === "setup",
  );
  const portable = files.find(
    (file) => file.role === "secondary" || file.id === "portable",
  );
  return {
    version: releases.version || "—",
    releasedAt: releases.releasedAt,
    base,
    setup,
    portable,
    setupHref: setup ? joinDownloadUrl(base, setup.filename) : "",
    portableHref: portable ? joinDownloadUrl(base, portable.filename) : "",
    licenses,
    supportHref: safeSupportHref(String(config.supportHref || "").trim()),
    supportLabel: config.supportLabel || "",
  };
})();

function safeSupportHref(href: string): string {
  try {
    const url = new URL(href);
    if (
      url.protocol === "https:" ||
      url.protocol === "http:" ||
      url.protocol === "mailto:"
    )
      return url.href;
  } catch {
    return "";
  }
  return "";
}

export function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "se publicará con el archivo";
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

export function formatDate(isoDate: string | undefined): string {
  if (!isoDate || typeof isoDate !== "string")
    return "pendiente de publicación";
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
