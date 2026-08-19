import { loadEnv, type UserConfig } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export const defaultApiProxyTarget = "http://127.0.0.1:8080";
const defaultDevPort = Number(process.env.MANAGEMENT_PLATFORM_DEV_PORT ?? 5178);

export function resolveApiProxyTarget(value?: string): string {
  const candidate = value === undefined ? defaultApiProxyTarget : value.trim();
  if (!candidate) {
    throw new Error("VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET must be an absolute HTTP(S) origin.");
  }

  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    throw new Error("VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET must be an absolute HTTP(S) origin.");
  }

  if ((target.protocol !== "http:" && target.protocol !== "https:")
    || target.username
    || target.password
    || target.pathname !== "/"
    || target.search
    || target.hash) {
    throw new Error("VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET must be an HTTP(S) origin without credentials, path, query, or fragment.");
  }

  return target.origin;
}

export function createManagementPlatformViteConfig(
  apiProxyTarget = defaultApiProxyTarget
): UserConfig {
  const resolvedApiProxyTarget = resolveApiProxyTarget(apiProxyTarget);

  return {
    base: "/management-platform/",
    plugins: [react()],
    server: {
      port: defaultDevPort,
      strictPort: true,
      allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],
      proxy: {
        "/v1": {
          target: resolvedApiProxyTarget,
          changeOrigin: true
        }
      }
    },
    test: {
      environment: "jsdom",
      exclude: [...configDefaults.exclude, "e2e/**"],
      globals: true,
      setupFiles: "./src/test/setup.ts"
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const selectedApiProxyTarget = resolveApiProxyTarget(
    env.VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET
  );
  const config = createManagementPlatformViteConfig(selectedApiProxyTarget);
  if (command === "serve") {
    console.info(`[management-platform] API proxy target: ${selectedApiProxyTarget}`);
  }
  return config;
});
