import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const yvpAppKey = (process.env.YVP_APP_KEY ?? env.YVP_APP_KEY ?? "").trim();
  return {
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: {
            main: "electron/main.ts",
            "pptx-worker": "electron/pptx-worker.ts",
          },
          vite: {
            define: { __YVP_APP_KEY__: JSON.stringify(yvpAppKey) },
            build: {
              outDir: "dist-electron",
              rollupOptions: {
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
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${Number(process.env.LUMEN_BROWSER_PORT) || 43124}`,
          changeOrigin: true,
        },
        "/media": {
          target: `http://127.0.0.1:${Number(process.env.LUMEN_BROWSER_PORT) || 43124}`,
          changeOrigin: true,
        },
      },
    },
    base: "./",
  };
});
