import fs from "fs";
import path from "path";

/**
 * Resolves the directory containing manifest.json and *.json Bible files.
 * Works in dev (electron .), screenshot mode, and packaged builds (extraResources).
 */
export function resolveBibleDataDir(candidates: string[]): string {
  const tried: string[] = [];
  for (const dir of candidates) {
    const normalized = path.normalize(dir);
    tried.push(normalized);
    const manifest = path.join(normalized, "manifest.json");
    if (fs.existsSync(manifest)) {
      return normalized;
    }
  }
  throw new Error(
    `No se encontró data/bibles/manifest.json. Rutas comprobadas:\n${tried.join("\n")}`,
  );
}

export function buildBibleDataCandidates(
  resourcesPath: string,
  appPath: string,
  mainDir: string,
  cwd: string,
): string[] {
  return [
    path.join(resourcesPath, "data", "bibles"),
    path.join(mainDir, "..", "data", "bibles"),
    path.join(appPath, "data", "bibles"),
    path.join(cwd, "data", "bibles"),
  ];
}
