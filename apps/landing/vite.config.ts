import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// The landing is prerendered to static HTML (dist/client) so it can be served
// from any static host, including Cloudflare Workers Static Assets.
export default defineConfig({
  define: {
    // Optional build-time override of landing/config.json DOWNLOAD_BASE_URL.
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
