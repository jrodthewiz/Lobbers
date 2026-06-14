import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "client",
  publicDir: false,
  test: {
    root: projectRoot,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(projectRoot, "shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:2567",
    },
    fs: {
      allow: [projectRoot],
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    assetsInlineLimit: (filePath) => (filePath.toLowerCase().endsWith(".ogg") ? false : undefined),
  },
});
