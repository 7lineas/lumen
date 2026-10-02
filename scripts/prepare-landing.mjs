import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "landing-dist");

const files = ["index.html", "styles.css", "app.js", "download-url.js", "config.json", "releases.json"];

await mkdir(outDir, { recursive: true });

for (const name of files) {
  await cp(path.join(root, "landing", name), path.join(outDir, name));
}

await cp(path.join(root, "shared", "bible-licenses.json"), path.join(outDir, "licenses.json"));

const assetDir = path.join(outDir, "assets");
await mkdir(assetDir, { recursive: true });
for (const name of ["logo-light.png", "logo-light.avif", "logo-dark.png", "logo-dark.avif"]) {
  await cp(path.join(root, "landing", "assets", name), path.join(assetDir, name));
}

const override = process.env.DOWNLOAD_BASE_URL;
if (override && override.trim()) {
  const configPath = path.join(outDir, "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.DOWNLOAD_BASE_URL = override.trim().replace(/\/+$/, "");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

console.log(`Landing lista en ${outDir}`);
