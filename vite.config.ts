import { loadEnv, type Plugin, type UserConfig } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export const defaultApiProxyTarget = "https://localhost:56064";
const defaultDevPort = Number(process.env.MANAGEMENT_PLATFORM_DEV_PORT ?? 5178);
const accountActivationRoute = "/account/activate";
const forgotPasswordRoute = "/account/forgot-password";
const resetPasswordRoute = "/account/reset-password";
export const publicAccountLifecycleRoutes = [accountActivationRoute, forgotPasswordRoute, resetPasswordRoute] as const;
const activationBootstrapScript = `(() => {
  const path = window.location.pathname.replace(/\\/+$/, "");
  const bootstrapKey = path === "${accountActivationRoute}"
    ? "__EXITPASS_TRANSIENT_ACCOUNT_ACTIVATION__"
    : path === "${resetPasswordRoute}"
      ? "__EXITPASS_TRANSIENT_PASSWORD_RESET__"
      : undefined;
  if (!bootstrapKey) return;
  const url = new URL(window.location.href);
  const challengeReference = (url.searchParams.get("challengeReference") || "").trim();
  const challengeSecret = (url.searchParams.get("challengeSecret") || "").trim();
  if (challengeReference && challengeSecret) {
    Object.defineProperty(window, bootstrapKey, {
      value: { challengeReference, challengeSecret }, configurable: true
    });
  }
  if (url.searchParams.has("challengeReference") || url.searchParams.has("challengeSecret")) {
    url.searchParams.delete("challengeReference");
    url.searchParams.delete("challengeSecret");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
})();`;

const developmentAccountLifecycleHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="referrer" content="no-referrer" />
    <title>ExitPass Management Platform</title>
    <script>${activationBootstrapScript}</script>
    <script type="module">
      import RefreshRuntime from "/management-platform/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/management-platform/src/main.tsx"></script>
  </body>
</html>`;

export function accountActivationHistoryFallback(): Plugin {
  const rewrite = (request: { url?: string }) => {
    if (!request.url) return false;
    const [path, query] = request.url.split("?", 2);
    if (publicAccountLifecycleRoutes.includes(path.replace(/\/+$/, "") as typeof publicAccountLifecycleRoutes[number])) {
      request.url = `/management-platform/${query ? `?${query}` : ""}`;
      return true;
    }
    return false;
  };
  return {
    name: "exitpass-account-activation-history-fallback",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [{
          tag: "script",
          injectTo: "head-prepend",
          children: activationBootstrapScript
        }];
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?", 1)[0].replace(/\/+$/, "");
        if (publicAccountLifecycleRoutes.includes(path as typeof publicAccountLifecycleRoutes[number])) {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store, private");
          response.setHeader("Referrer-Policy", "no-referrer");
          response.end(developmentAccountLifecycleHtml);
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (rewrite(request)) {
          response.setHeader("Cache-Control", "no-store, private");
          response.setHeader("Referrer-Policy", "no-referrer");
        }
        next();
      });
    }
  };
}

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
    plugins: [accountActivationHistoryFallback(), react()],
    server: {
      port: defaultDevPort,
      strictPort: true,
      allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],
      proxy: {
        "/v1": {
          target: resolvedApiProxyTarget,
          changeOrigin: true,
          secure: resolvedApiProxyTarget !== defaultApiProxyTarget
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
