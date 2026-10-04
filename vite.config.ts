import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // pptx-worker runs in a utilityProcess (see electron/pptx-render.ts).
        entry: { main: "electron/main.ts", "pptx-worker": "electron/pptx-worker.ts" },
        vite: {
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
});
