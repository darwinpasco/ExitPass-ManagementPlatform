// @vitest-environment node

import { describe, expect, it } from "vitest";
import { humanSessionRoute } from "./src/humanAuthentication";
import {
  createManagementPlatformViteConfig,
  defaultApiProxyTarget,
  resolveApiProxyTarget
} from "./vite.config";

describe("Management Platform Vite proxy configuration", () => {
  it("defaults relative API requests to the local .NET Central PMS", () => {
    const config = createManagementPlatformViteConfig();

    expect(defaultApiProxyTarget).toBe("http://127.0.0.1:56065");
    expect(config.base).toBe("/management-platform/");
    expect(config.server?.port).toBe(5178);
    expect(config.server?.proxy?.["/v1"]).toMatchObject({
      target: "http://127.0.0.1:56065",
      changeOrigin: true
    });
  });

  it("uses an explicit safe proxy origin override", () => {
    expect(resolveApiProxyTarget(" https://central-pms.local:8443 ")).toBe("https://central-pms.local:8443");
    expect(createManagementPlatformViteConfig("https://central-pms.local:8443").server?.proxy?.["/v1"]).toMatchObject({
      target: "https://central-pms.local:8443"
    });
  });

  it.each([
    "",
    "localhost:8080",
    "javascript:alert(1)",
    "http://user:secret@127.0.0.1:8080",
    "http://127.0.0.1:8080/v1",
    "http://127.0.0.1:8080?mode=test",
    "http://127.0.0.1:8080#fragment"
  ])("rejects malformed or unsafe proxy target %j", (target) => {
    expect(() => resolveApiProxyTarget(target)).toThrow(/HTTP\(S\) origin/);
  });

  it("keeps the H-006 session check relative and covered by the API proxy", () => {
    const config = createManagementPlatformViteConfig();

    expect(humanSessionRoute).toBe("/v1/human-authentication/session");
    expect(humanSessionRoute.startsWith("/v1/")).toBe(true);
    expect(config.server?.proxy).toHaveProperty("/v1");
    expect(config.server?.proxy?.["/v1"]).not.toHaveProperty("headers");
  });
});
