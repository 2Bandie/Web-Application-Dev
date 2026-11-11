import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (env.VITE_BACKEND_URL) {
    const url = new URL(env.VITE_BACKEND_URL);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "VITE_BACKEND_URL must be a backend origin, without /api, a path, or credentials.",
      );
    }
    if (
      mode === "production" &&
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      throw new Error("Published backends must use HTTPS.");
    }
  }
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react()],
    server: {
      port: 5500,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:8001",
        "/ws": { target: "ws://127.0.0.1:8001", ws: true },
      },
    },
  };
});
