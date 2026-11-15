import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  define: {
    __DOWNLOAD_BASE_URL_OVERRIDE__: JSON.stringify(
      (process.env.DOWNLOAD_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    ),
  },
  server: { port: 44731, strictPort: true },
  plugins: [
    tanstackStart({
      prerender: { enabled: true, crawlLinks: false },
    }),
    react(),
  ],
});
