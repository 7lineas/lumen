import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "apps", "landing");
const outDir = path.join(root, "landing-dist");

await new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["build"], {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`landing build salió con ${code}`)),
  );
});

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(appDir, "dist", "client"), outDir, { recursive: true });

console.log(`Landing lista en ${outDir}`);
