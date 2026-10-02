#!/usr/bin/env node
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = "/opt/cursor/artifacts";

const child = spawn(
  "pnpm",
  ["exec", "electron", "."],
  {
    cwd: path.join(root, ".."),
    env: {
      ...process.env,
      PROYECTOR_SCREENSHOT: "1",
      SCREENSHOT_OUT_DIR: outDir,
      DISPLAY: process.env.DISPLAY ?? ":99",
    },
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
