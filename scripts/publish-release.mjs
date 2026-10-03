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
 */
import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
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

export async function findWindowsArtifacts(dir) {
  const entries = await readdir(dir);
  const exes = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".exe")) continue;
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isFile()) exes.push({ name, full });
  }
  const portable = exes.find((file) => /portable/i.test(file.name));
  const setup = exes.find((file) => file !== portable && /(setup|win-x64|nsis)/i.test(file.name));
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

export async function uploadToR2({ manifest, setupPath, portablePath, dir }) {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = (process.env.R2_BUCKET || "desktop-releases").trim();
  const region = (process.env.R2_REGION || "auto").trim();
  const endpoint = (process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  const baseUrl = resolveDownloadBaseUrl();

  const releasesBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const uploads = [
    { key: manifest.files[0].filename, filePath: setupPath, contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" },
    { key: manifest.files[1].filename, filePath: portablePath, contentType: "application/octet-stream", cacheControl: "public, max-age=31536000, immutable" },
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
      });
    }
    if (meta.blockmapPath && meta.blockmapKey) {
      uploads.push({
        key: meta.blockmapKey,
        filePath: meta.blockmapPath,
        contentType: "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      });
    }
    uploads.push({
      key: "latest.yml",
      filePath: meta.latestPath,
      contentType: "text/yaml; charset=utf-8",
      cacheControl: "public, max-age=60",
    });
  }

  for (const item of uploads) {
    const key = safeObjectKey(item.key);
    if (!key) throw new Error(`Nombre de objeto no válido: ${item.key}`);
    const body = item.body ?? (await readFile(item.filePath));
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const url = `${endpoint}/${bucket}/${key}`;
    const contentDisposition = `attachment; filename="${key}"`;
    const headers = {
      "content-type": item.contentType,
      "cache-control": item.cacheControl,
      "content-disposition": contentDisposition,
    };
    const signed = signS3Request({
      method: "PUT",
      url,
      headers,
      payloadHash,
      accessKeyId,
      secretAccessKey,
      region,
      amzDate,
    });
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        Authorization: signed.authorization,
        "x-amz-date": signed.amzDate,
        "x-amz-content-sha256": signed.payloadHash,
        "content-length": String(body.length),
      },
      body,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`R2 rechazó ${key} (${response.status}). ${detail.slice(0, 400)}`);
    }
    console.log(`Subido ${joinDownloadUrl(baseUrl, key)}`);
  }
}

function parseArgs(argv) {
  const args = { dir: path.join(repoRoot, "release"), dryRun: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
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
  const artifacts = await findWindowsArtifacts(options.dir);
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

  await uploadToR2({ manifest, setupPath: artifacts.setup, portablePath: artifacts.portable, dir: options.dir });
  const configPath = path.join(repoRoot, "landing", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.DOWNLOAD_BASE_URL = downloadBaseUrl;
  await writeJson(configPath, config);
  console.log(`DOWNLOAD_BASE_URL actualizado en ${configPath}`);
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Uso: node scripts/publish-release.mjs [--dir release] [--dry-run] [--out archivo.json]

Obligatorias al subir: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
Opcionales: R2_BUCKET (desktop-releases), R2_ENDPOINT, R2_REGION (auto), DOWNLOAD_BASE_URL (https://downloads.7lineas.com).`);
    process.exit(0);
  }
  publishRelease(args).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
