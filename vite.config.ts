import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";

export default defineConfig(({ mode }) => {
  // YVP_APP_KEY (YouVersion Platform) comes from .env.local or the environment
  // at build time and is embedded only in the Electron main bundle. It is not
  // committed and never reaches the renderer or the projector.
  const env = loadEnv(mode, process.cwd(), "");
  const yvpAppKey = (process.env.YVP_APP_KEY ?? env.YVP_APP_KEY ?? "").trim();
  return {
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // pptx-worker runs in a utilityProcess (see electron/pptx-render.ts).
        entry: { main: "electron/main.ts", "pptx-worker": "electron/pptx-worker.ts" },
        vite: {
          define: { __YVP_APP_KEY__: JSON.stringify(yvpAppKey) },
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              // pptx-glimpse must stay a real node_modules dependency: its Node
              // entry loads @resvg/resvg-wasm's .wasm and system fonts at
              // runtime, which breaks (or silently drops text) once bundled
              // into dist-electron. electron-builder ships it inside the asar.
              external: ["electron", "pptx-glimpse"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: Number(process.env.PORT) || 43123,
    strictPort: true,
  },
  base: "./",
};
});
