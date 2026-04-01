import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

function copyCodiconsPlugin() {
  return {
    name: "copy-codicons",
    closeBundle() {
      const src = resolve(__dirname, "node_modules/@vscode/codicons/dist");
      const dest = resolve(__dirname, "dist/webview/assets");
      mkdirSync(dest, { recursive: true });
      copyFileSync(resolve(src, "codicon.css"), resolve(dest, "codicon.css"));
      copyFileSync(resolve(src, "codicon.ttf"), resolve(dest, "codicon.ttf"));
    },
  };
}

export default defineConfig({
  root: "src/webview",
  plugins: [tailwindcss(), react(), copyCodiconsPlugin()],
  build: {
    outDir: "../../dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, "src/webview/sidebar/index.html"),
        editor: resolve(__dirname, "src/webview/editor/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
