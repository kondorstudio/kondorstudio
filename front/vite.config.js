import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ============================
// KONDOR STUDIO — FRONT (Vite)
// ============================
//
// - Usa React 18 com @vitejs/plugin-react
// - Dev server em http://localhost:5173
// - Preview (build) em http://localhost:4173
// - Build sai em "dist/" (default do Vite), já esperado pelo render.yaml
//

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    sourcemap: false
  },
  resolve: {
    alias: {
      // Permite usar import com "@/" apontando para "src"
      // Ex: import Layout from "@/Layout";
      "@": "/src"
    }
  }
});
