import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@mumsio/quality-ui": fileURLToPath(new URL("../../packages/quality-ui/src/index.ts", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: { "/api": { target: "http://127.0.0.1:4100", changeOrigin: true } },
  },
  build: { sourcemap: true },
});
