import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawBase = env.VITE_BASE_PATH || env.VITE_PUBLIC_APP_URL || "";
  let base = "/";

  if (rawBase) {
    try {
      base = new URL(rawBase).pathname || "/";
    } catch (err) {
      base = rawBase;
    }
    if (!base.startsWith("/")) base = `/${base}`;
    if (!base.endsWith("/")) base += "/";
  }

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    define: {
      // Garante que a API URL esteja disponível no frontend em tempo de build:
      // - VITE_API_URL (principal)
      // - VITE_APP_API_URL (legado)
      "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_URL),
      "import.meta.env.VITE_APP_API_URL": JSON.stringify(env.VITE_APP_API_URL)
    },
    build: {
      outDir: "dist",
      sourcemap: false
    },
    server: {
      port: 5173,
      strictPort: true
    },
    preview: {
      port: 4173,
      strictPort: true
    }
  };
});
