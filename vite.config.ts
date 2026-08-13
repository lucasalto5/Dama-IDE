import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The packaged Electron app loads dist/index.html through file://.
  // Absolute /assets paths point to the drive root and leave a blank window.
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
