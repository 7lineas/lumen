#!/usr/bin/env node
/**
 * Smoke-test the packaged app (win-unpacked under Wine, or linux-unpacked natively).
 * Exits 0 if screenshots complete without throw.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.SCREENSHOT_OUT_DIR ?? "/opt/cursor/artifacts";

function findExecutable() {
  const linuxDir = path.join(root, "release", "linux-unpacked");
  const linuxBin = path.join(linuxDir, "proyector-biblico");
  if (fs.existsSync(linuxBin)) {
    return { cmd: linuxBin, args: [], useWine: false };
  }
  const winDir = path.join(root, "release", "win-unpacked");
  const winExe = path.join(winDir, "Lumen.exe");
  if (fs.existsSync(winExe)) {
    return { cmd: "wine", args: [winExe], useWine: true };
  }
  throw new Error("No packaged build in release/linux-unpacked or release/win-unpacked");
}

const { cmd, args } = findExecutable();

const child = spawn(cmd, args, {
  cwd: root,
  env: {
    ...process.env,
    PROYECTOR_SCREENSHOT: "1",
    SCREENSHOT_OUT_DIR: outDir,
    ELECTRON_DISABLE_GPU: "1",
    DISPLAY: process.env.DISPLAY ?? ":99",
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  if (code !== 0) {
    console.error("Packaged smoke failed with code", code);
    process.exit(code ?? 1);
  }
  for (const file of ["operator-window.png", "projector-window.png", "settings-window.png"]) {
    const p = path.join(outDir, file);
    if (!fs.existsSync(p)) {
      console.error("Missing artifact:", p);
      process.exit(1);
    }
  }
  console.log("Packaged smoke OK");
  process.exit(0);
});
