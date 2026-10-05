#!/usr/bin/env node
/**
 * Hash the Windows build, write landing/releases.json, and upload to Cloudflare R2.
 *
 * Credentials come only from the environment. Nothing in this file is a secret.
 *
 *   R2_ACCOUNT_ID          Cloudflare account id
 *   R2_ACCESS_KEY_ID       Token access key, limited to the bucket
 *   R2_SECRET_ACCESS_KEY   Token secret
 *   R2_BUCKET              Default: desktop-releases
 *   R2_ENDPOINT            Default: https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
 *   R2_REGION              Default: auto
 *   DOWNLOAD_BASE_URL      Optional. Default: https://downloads.7lineas.com
 *
 *   node scripts/publish-release.mjs --dir release
 *   node scripts/publish-release.mjs --dir release --dry-run --out /tmp/releases.json
 *   node scripts/publish-release.mjs --dir release --force   # re-upload even if R2 already has the same bytes
 *   node scripts/publish-release.mjs --verify                # only check the public result (no upload)
 *
 * Uploads stream the file with Content-Length (never the whole file in memory),
 * retry with backoff and print error.cause. Objects already in R2 with the same
 * size and MD5 are skipped, and latest.yml is always uploaded last.
 */
import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinDownloadUrl, safeObjectKey } from "../landing/download-url.js";

export const DEFAULT_DOWNLOAD_BASE_URL = "https://downloads.7lineas.com";

export function resolveDownloadBaseUrl() {
  return (process.env.DOWNLOAD_BASE_URL || DEFAULT_DOWNLOAD_BASE_URL).trim().replace(/\/+$/, "");
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function uriEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeUriPath(pathname) {
  return pathname
    .split("/")
    .map((segment) => (segment ? uriEncode(segment) : ""))
    .join("/");
}

export function signS3Request({
  method,
  url,
  headers,
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region,
  service = "s3",
  amzDate,
}) {
  const target = new URL(url);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersMap = {};
  for (const [name, value] of Object.entries(headers)) {
    canonicalHeadersMap[name.toLowerCase()] = String(value).trim().replace(/\s+/g, " ");
  }
  canonicalHeadersMap.host = target.host;
  canonicalHeadersMap["x-amz-date"] = amzDate;
  canonicalHeadersMap["x-amz-content-sha256"] = payloadHash;

  const signedHeaderNames = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${canonicalHeadersMap[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalQuery = [...target.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b) || 0)
    .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
    .join("&");

  const canonicalRequest = [
    method,
    encodeUriPath(target.pathname),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const kDate = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update(service).digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    amzDate,
    payloadHash,
    canonicalRequest,
    stringToSign,
  };
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
      bytes += chunk.length;
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return { sha256: hash.digest("hex"), bytes };
}

export function artifactFilename(version, role) {
  const safeVersion = String(version).trim();
  if (role === "portable") return `lumen-${safeVersion}-portable.exe`;
  return `lumen-${safeVersion}-setup.exe`;
}

export async function findWindowsArtifacts(dir, version) {
  const entries = await readdir(dir);
  const exes = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".exe")) continue;
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isFile()) exes.push({ name, full });
  }
  const versionedExes = version
    ? exes.filter((file) => file.name.toLowerCase().startsWith(`lumen-${String(version).trim().toLowerCase()}-`))
    : exes;
  const portable = versionedExes.find((file) => /portable/i.test(file.name));
  const setup = versionedExes.find((file) => file !== portable && /(setup|win-x64|nsis)/i.test(file.name));
  if (!setup || !portable) {
    const found = exes.map((file) => file.name).join(", ") || "(ninguno)";
    throw new Error(
      `En ${dir} hacen falta el instalador (setup, win-x64 o nsis) y el portable. Encontrados: ${found}`,
    );
  }
  return { setup: setup.full, portable: portable.full };
}

export async function buildReleaseManifest({ version, releasedAt, setupPath, portablePath, downloadBaseUrl }) {
  const [setupHash, portableHash] = await Promise.all([hashFile(setupPath), hashFile(portablePath)]);
  return {
    version,
    releasedAt,
    downloadBaseUrl: (downloadBaseUrl || DEFAULT_DOWNLOAD_BASE_URL).replace(/\/+$/, ""),
    files: [
      {
        id: "setup",
        role: "primary",
        label: "Instalador para Windows",
        filename: artifactFilename(version, "setup"),
        bytes: setupHash.bytes,
        sha256: setupHash.sha256,
      },
      {
        id: "portable",
        role: "secondary",
        label: "Versión portable",
        filename: artifactFilename(version, "portable"),
        bytes: portableHash.bytes,
        sha256: portableHash.sha256,
      },
    ],
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value.trim();
}

export async function findUpdaterMetadata(dir, setupFullPath) {
  const entries = await readdir(dir);
  const latestName = entries.find((name) => name.toLowerCase() === "latest.yml") ?? null;
  const setupBase = path.basename(setupFullPath);
  const blockmapName = entries.find((name) => name === `${setupBase}.blockmap`) ?? null;
  return {
    latestPath: latestName ? path.join(dir, latestName) : null,
    latestKey: latestName,
    blockmapPath: blockmapName ? path.join(dir, blockmapName) : null,
    blockmapKey: blockmapName,
    setupBase,
  };
}

export async function hashFileFull(filePath) {
  const sha = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      sha.update(chunk);
      md5.update(chunk);
      bytes += chunk.length;
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return { sha256: sha.digest("hex"), md5: md5.digest("hex"), bytes };
}

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

function describeError(error) {
  const cause = error && typeof error === "object" ? error.cause : null;
  const parts = [error instanceof Error ? error.message : String(error)];
  if (error && error.code) parts.push(`code=${error.code}`);
  if (cause) parts.push(`cause=${cause.code ?? ""} ${cause.message ?? cause}`.trim());
  return parts.join(" | ");
}

function sendRequest({ method, url, headers, filePath, body, timeoutMs = 600_000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "http:" ? http : https;
    const req = transport.request(target, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Tiempo de espera agotado (${timeoutMs} ms)`)));
    req.on("error", reject);
    if (filePath) {
      const stream = createReadStream(filePath);
      stream.on("error", (error) => req.destroy(error));
      stream.pipe(req);
    } else {
      req.end(body);
    }
  });
}

function signedHeaders({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const signed = signS3Request({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region, amzDate });
  return {
    ...headers,
    Authorization: signed.authorization,
    "x-amz-date": signed.amzDate,
    "x-amz-content-sha256": signed.payloadHash,
  };
}

/** HEAD an R2 object. Returns { size, etag } (etag without quotes) or null when it does not exist. */
export async function headObject({ url, region, accessKeyId, secretAccessKey }) {
  const headers = signedHeaders({ method: "HEAD", url, headers: {}, payloadHash: EMPTY_SHA256, accessKeyId, secretAccessKey, region });
  const response = await sendRequest({ method: "HEAD", url, headers, timeoutMs: 60_000 });
  if (response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`R2 respondió ${response.status} al consultar ${url.split("/").pop()}`);
  }
  return {
    size: Number(response.headers["content-length"]),
    etag: String(response.headers.etag ?? "").replace(/"/g, "").toLowerCase(),
  };
}

/**
 * PUT an object by streaming the file with an explicit Content-Length (small
 * bodies are sent as a buffer). Retries with exponential backoff and prints
 * the real error.cause instead of just "fetch failed".
 */
export async function putObjectWithRetry({
  url, headers, body, filePath, size, payloadHash, accessKeyId, secretAccessKey, region, label,
  attempts = 4, backoffMs = 2000, timeoutMs = 600_000,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const signed = signedHeaders({ method: "PUT", url, headers, payloadHash, accessKeyId, secretAccessKey, region });
      const response = await sendRequest({
        method: "PUT",
        url,
        headers: { ...signed, "content-length": String(size) },
        filePath: body ? undefined : filePath,
        body,
        timeoutMs,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`R2 rechazó ${label} (${response.status}). ${response.text.slice(0, 400)}`);
      }
      return;
    } catch (error) {
      lastError = error;
      console.error(`Fallo subiendo ${label} (intento ${attempt}/${attempts}): ${describeError(error)}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`No se pudo subir ${label} tras ${attempts} intentos: ${describeError(lastError)}`);
}

/**
 * Check the public result from outside: releases.json and latest.yml name the
 * expected version, and every artifact answers 200 with the expected size.
 * Returns the list of problems (empty when everything is fine).
 */
export async function verifyPublicRelease({ manifest, baseUrl, fetchImpl = fetch }) {
  const problems = [];
  const base = baseUrl.replace(/\/+$/, "");
  const getText = async (key) => {
    const response = await fetchImpl(`${base}/${key}?verify=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${key} respondió ${response.status}`);
    return response.text();
  };
  try {
    const remote = JSON.parse(await getText("releases.json"));
    if (remote.version !== manifest.version) problems.push(`releases.json dice ${remote.version}, se esperaba ${manifest.version}`);
    for (const file of manifest.files) {
      const entry = remote.files?.find((item) => item.filename === file.filename);
      if (!entry || entry.sha256 !== file.sha256 || entry.bytes !== file.bytes) {
        problems.push(`releases.json no coincide (tamaño/sha256) para ${file.filename}`);
      }
    }
  } catch (error) {
    problems.push(`releases.json: ${describeError(error)}`);
  }
  let latest = null;
  try {
    const text = await getText("latest.yml");
    const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1];
    latest = {
      version,
      path: /^path:\s*['"]?([^'"\n]+?)['"]?\s*$/m.exec(text)?.[1],
      size: Number(/^\s+size:\s*(\d+)/m.exec(text)?.[1]),
    };
    if (version !== manifest.version) problems.push(`latest.yml dice ${version}, se esperaba ${manifest.version}`);
  } catch (error) {
    problems.push(`latest.yml: ${describeError(error)}`);
  }
  const targets = manifest.files.map((file) => ({ key: file.filename, size: file.bytes }));
  if (latest?.path) {
    targets.push({ key: latest.path, size: latest.size });
    targets.push({ key: `${latest.path}.blockmap`, size: null });
  }
  for (const target of targets) {
    try {
      const response = await fetchImpl(`${base}/${encodeURIComponent(target.key)}`, { method: "HEAD" });
      if (response.status !== 200) {
        problems.push(`${target.key} respondió ${response.status}`);
      } else if (target.size && Number(response.headers.get("content-length")) !== target.size) {
        problems.push(`${target.key} tiene otro tamaño (${response.headers.get("content-length")} ≠ ${target.size})`);
      }
    } catch (error) {
      problems.push(`${target.key}: ${describeError(error)}`);
    }
  }
  return problems;
}

export async function uploadToR2({ manifest, setupPath, portablePath, dir, force = false }) {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = (process.env.R2_BUCKET || "desktop-releases").trim();
  const region = (process.env.R2_REGION || "auto").trim();
  const endpoint = (process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  const baseUrl = resolveDownloadBaseUrl();

  const releasesBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const uploads = [
    { key: manifest.files[0].filename, filePath: setupPath, contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable", skipIfSame: true },
    { key: manifest.files[1].filename, filePath: portablePath, contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable", skipIfSame: true },
    { key: "releases.json", body: releasesBody, contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=60" },
  ];

  // electron-updater reads https://downloads.7lineas.com/latest.yml, which points
  // at the builder artifact name (Lumen-<version>-win-x64.exe). Upload that name
  // plus its blockmap so the in-app Actualizar button can download and install.
  if (dir) {
    const meta = await findUpdaterMetadata(dir, setupPath);
    if (!meta.latestPath) {
      throw new Error(`En ${dir} falta latest.yml para la actualización automática`);
    }
    if (meta.setupBase !== manifest.files[0].filename) {
      uploads.push({
        key: meta.setupBase,
        filePath: setupPath,
        contentType: "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
        skipIfSame: true,
      });
    }
    if (meta.blockmapPath && meta.blockmapKey) {
      uploads.push({
        key: meta.blockmapKey,
        filePath: meta.blockmapPath,
        contentType: "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
        skipIfSame: true,
      });
    }
    uploads.push({
      key: "latest.yml",
      filePath: meta.latestPath,
      contentType: "text/yaml; charset=utf-8",
      cacheControl: "public, max-age=60",
    });
  }

  // A half-finished run must never advertise a version whose files are missing:
  // artifacts first, then releases.json, and latest.yml (what installed apps
  // read to update) strictly last.
  const rank = (item) => (item.key === "latest.yml" ? 2 : item.key === "releases.json" ? 1 : 0);
  uploads.sort((x, y) => rank(x) - rank(y));

  const ctx = { endpoint, bucket, region, accessKeyId, secretAccessKey };
  for (const item of uploads) {
    const key = safeObjectKey(item.key);
    if (!key) throw new Error(`Nombre de objeto no válido: ${item.key}`);
    const url = `${endpoint}/${bucket}/${key}`;
    const headers = {
      "content-type": item.contentType,
      "cache-control": item.cacheControl,
      "content-disposition": `attachment; filename="${key}"`,
    };
    const local = item.body
      ? {
          bytes: item.body.length,
          sha256: createHash("sha256").update(item.body).digest("hex"),
          md5: createHash("md5").update(item.body).digest("hex"),
        }
      : await hashFileFull(item.filePath);
    if (item.skipIfSame && !force) {
      const remote = await headObject({ ...ctx, url });
      if (remote && remote.size === local.bytes && remote.etag === local.md5) {
        console.log(`Omitido (ya está en R2, mismo tamaño y MD5) ${joinDownloadUrl(baseUrl, key)}`);
        continue;
      }
    }
    await putObjectWithRetry({
      ...ctx,
      url,
      headers,
      body: item.body,
      filePath: item.filePath,
      size: local.bytes,
      payloadHash: local.sha256,
      label: key,
    });
    console.log(`Subido ${joinDownloadUrl(baseUrl, key)}`);
  }
}

function parseArgs(argv) {
  const args = { dir: path.join(repoRoot, "release"), dryRun: false, out: null, force: false, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--force") args.force = true;
    else if (token === "--verify") args.verify = true;
    else if (token === "--dir") args.dir = path.resolve(argv[++i] || "");
    else if (token === "--out") args.out = path.resolve(argv[++i] || "");
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`Argumento desconocido: ${token}`);
  }
  return args;
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  return pkg.version;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function publishRelease(options) {
  const version = options.version || (await readVersion());
  const artifacts = await findWindowsArtifacts(options.dir, version);
  const releasedAt = new Date().toISOString().slice(0, 10);
  const downloadBaseUrl = resolveDownloadBaseUrl();
  const manifest = await buildReleaseManifest({
    version,
    releasedAt,
    setupPath: artifacts.setup,
    portablePath: artifacts.portable,
    downloadBaseUrl,
  });
  const outPath = options.out || path.join(repoRoot, "landing", "releases.json");
  if (!options.dryRun || options.out) {
    await writeJson(outPath, manifest);
    console.log(`Manifest escrito en ${outPath}`);
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }
  if (options.dryRun) return manifest;

  await uploadToR2({ manifest, setupPath: artifacts.setup, portablePath: artifacts.portable, dir: options.dir, force: options.force });
  const configPath = path.join(repoRoot, "landing", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.DOWNLOAD_BASE_URL = downloadBaseUrl;
  await writeJson(configPath, config);
  console.log(`DOWNLOAD_BASE_URL actualizado en ${configPath}`);
  await verifyOrThrow(manifest);
  return manifest;
}

async function verifyOrThrow(manifest) {
  const problems = await verifyPublicRelease({ manifest, baseUrl: manifest.downloadBaseUrl });
  if (problems.length) {
    throw new Error(`Verificación pública fallida:\n - ${problems.join("\n - ")}`);
  }
  console.log(`Verificación pública OK: v${manifest.version} (releases.json, latest.yml, .exe y .blockmap responden con el tamaño esperado)`);
}

/** Verify the already-published release described by landing/releases.json (no upload). */
export async function verifyOnly() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "landing", "releases.json"), "utf8"));
  await verifyOrThrow(manifest);
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Uso: node scripts/publish-release.mjs [--dir release] [--dry-run] [--out archivo.json] [--force] [--verify]

Obligatorias al subir: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
Opcionales: R2_BUCKET (desktop-releases), R2_ENDPOINT, R2_REGION (auto), DOWNLOAD_BASE_URL (https://downloads.7lineas.com).
--force  vuelve a subir aunque R2 ya tenga el mismo tamaño y MD5.
--verify solo verifica el resultado público de landing/releases.json (no sube nada).`);
    process.exit(0);
  }
  (args.verify ? verifyOnly() : publishRelease(args)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
