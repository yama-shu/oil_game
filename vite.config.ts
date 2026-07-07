import { defineConfig } from "vite";

export default defineConfig({
  // モバイル実機からLAN経由でアクセスして動作確認するため host を開放する
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
