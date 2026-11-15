import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "client",
);

const pages = (await readdir(clientDir)).filter((f) => f.endsWith(".html"));
const hashes = new Set();
for (const page of pages) {
  const html = await readFile(path.join(clientDir, page), "utf8");
  for (const m of html.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const digest = createHash("sha256").update(m[1], "utf8").digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
}

const scriptSrc = ["'self'", ...hashes].join(" ");
const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: ${csp}
`;

await writeFile(path.join(clientDir, "_headers"), headers);
process.stdout.write(
  `_headers escrito (${hashes.size} hash de script inline)\n`,
);
