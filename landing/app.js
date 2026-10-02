import { joinDownloadUrl } from "./download-url.js";

const $ = (id) => document.getElementById(id);

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "se publicará con el archivo";
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "pendiente de publicación";
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function loadJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`No se pudo leer ${url}`);
  return response.json();
}

function factList(file) {
  return [
    ["Archivo", file.filename],
    ["Tamaño", formatBytes(file.bytes)],
    ["SHA-256", file.sha256],
  ];
}

function renderFacts(container, file) {
  container.replaceChildren();
  if (!file) return;
  for (const [term, value] of factList(file)) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    if (term === "SHA-256") {
      const code = document.createElement("code");
      code.textContent = value || "—";
      dd.append(code);
    } else {
      dd.textContent = value || "—";
    }
    wrap.append(dt, dd);
    container.append(wrap);
  }
}

function wireDownload(anchor, pending, file, base) {
  const href = file ? joinDownloadUrl(base, file.filename) : "";
  const urlLine = anchor.id === "download-setup" ? $("setup-url") : $("portable-url");
  if (href) {
    anchor.href = href;
    anchor.hidden = false;
    pending.hidden = true;
    urlLine.textContent = href;
    return;
  }
  anchor.hidden = true;
  anchor.removeAttribute("href");
  urlLine.textContent = "";
  pending.hidden = false;
  pending.textContent = file
    ? `«${file.label}» (${file.filename}) se habilita cuando el archivo esté en el sitio de descargas.`
    : "Falta el archivo de esta descarga.";
}

function renderBibles(licenses) {
  const list = $("bible-list");
  list.replaceChildren();
  const note = $("distribution-note");
  note.textContent = licenses.distributionNote || "";
  $("excluded-note").textContent = licenses.excludedNote || "";

  for (const version of licenses.versions || []) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${version.name} (${version.abbr})`;
    item.append(title);

    const detail = document.createElement("span");
    detail.textContent = ` — ${version.language}. Licencia: ${version.license}. `;
    item.append(detail);

    if (version.sourceUrl) {
      const link = document.createElement("a");
      link.href = version.sourceUrl;
      link.textContent = version.sourceName || version.sourceUrl;
      item.append(document.createTextNode("Fuente: "), link, document.createTextNode(". "));
    } else if (version.sourceName) {
      item.append(document.createTextNode(`Fuente: ${version.sourceName}. `));
    }

    if (version.availability) {
      item.append(document.createTextNode(`${version.availability}. `));
    }
    if (version.draft) {
      item.append(document.createTextNode("Borrador. "));
    }
    if (version.copyright) {
      item.append(document.createTextNode(`${version.copyright} `));
    }
    if (version.attribution) {
      item.append(document.createTextNode(version.attribution));
    }
    list.append(item);
  }
}

function safeSupportHref(href) {
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:") return url.href;
  } catch {
    return "";
  }
  return "";
}

function renderSupport(config) {
  const href = safeSupportHref(String(config.supportHref || "").trim());
  if (!href) return;
  const copy = $("support-copy");
  const link = document.createElement("a");
  link.href = href;
  link.textContent = config.supportLabel || href;
  copy.append(document.createTextNode(" También puede escribir a "), link, document.createTextNode("."));
}

async function main() {
  const [config, licenses, localReleases] = await Promise.all([
    loadJson("./config.json"),
    loadJson("./licenses.json"),
    loadJson("./releases.json"),
  ]);

  renderBibles(licenses);
  renderSupport(config);

  const releases = localReleases;
  const base = String(config.DOWNLOAD_BASE_URL || releases.downloadBaseUrl || "").trim();

  const files = Array.isArray(releases.files) ? releases.files : [];
  const setup = files.find((file) => file.role === "primary" || file.id === "setup");
  const portable = files.find((file) => file.role === "secondary" || file.id === "portable");

  $("release-meta").textContent = `Versión ${releases.version || "—"} · ${formatDate(releases.releasedAt)}`;
  wireDownload($("download-setup"), $("download-setup-pending"), setup, base);
  wireDownload($("download-portable"), $("download-portable-pending"), portable, base);
  renderFacts($("setup-facts"), setup);
  renderFacts($("portable-facts"), portable);
  document.documentElement.dataset.ready = "1";
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "No se pudo cargar la página.";
  for (const id of ["download-error", "bible-error"]) {
    const node = $(id);
    node.hidden = false;
    node.textContent = message;
  }
  $("release-meta").textContent = "No se pudieron cargar los datos de la descarga.";
  document.documentElement.dataset.ready = "error";
});
