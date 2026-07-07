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
    rollupOptions: {
      output: {
        // three.js は大きいので分割し、ゲーム本体の更新時に
        // ブラウザキャッシュが効き続けるようにする
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
