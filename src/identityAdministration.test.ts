import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import { createIdentityAdministrationClient, identityAdministrationApiRoute } from "./identityAdministration";

describe("identity administration API client", () => {
  it("uses only the same-origin I-021 routes and shared unsafe-request composition", async () => {
    const authorizeUnsafeRequest = vi.fn((headers: Headers) => headers.set("X-CSRF-Token", "bounded-runtime-token"));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toMatch(/^\/v1\/management-platform\/identity/);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("X-ExitPass-User-Id")).toBeNull();
      expect(headers.get("X-ExitPass-Permissions")).toBeNull();
      expect(headers.get("X-CSRF-Token")).toBe("bounded-runtime-token");
      return json({ userReference: "user-1", username: "synthetic.user", displayName: "Synthetic User", maskedEmail: null, maskedMobileNumber: null, userType: "HUMAN", status: "INVITED", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastLoginAt: null, rowVersion: 1 });
    });
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl, authorizeUnsafeRequest }));

    await client.createUser({ username: "synthetic.user" });

    expect(authorizeUnsafeRequest).toHaveBeenCalledOnce();
  });

  it("builds server-driven user filters without sending scope authority", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${identityAdministrationApiRoute}/users?query=alex&status=ACTIVE&offset=25&limit=25`);
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("X-Management-Platform-Site-Id")).toBeNull();
      return json([]);
    });
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl }));
    await expect(client.listUsers({ query: "alex", status: "ACTIVE", offset: 25, limit: 25 })).resolves.toEqual([]);
  });

  it.each([
    ["activate", "/activate"], ["suspend", "/suspend"], ["inactivate", "/inactivate"],
    ["retire", "/retire"], ["lock", "/lock"], ["unlock", "/unlock"]
  ])("uses the governed %s lifecycle route", async (action, suffix) => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${identityAdministrationApiRoute}/users/user-1${suffix}`);
      return json({ ok: true });
    });
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl, authorizeUnsafeRequest: () => undefined }));
    await client.changeLifecycle("user-1", action, { expectedRowVersion: 1, reasonCode: "TEST" });
  });

  it("fails closed for unknown lifecycle actions", async () => {
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl: vi.fn(), authorizeUnsafeRequest: () => undefined }));
    expect(() => client.changeLifecycle("user-1", "delete", {})).toThrowError(/Account Status action is unavailable/i);
  });

  it("rejects malformed successful list payloads before they reach the workspace", async () => {
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => json({ unexpected: true })) }));
    await expect(client.listUsers()).rejects.toMatchObject({ kind: "malformed-response", code: "IDENTITY_ADMIN_MALFORMED_RESPONSE" });
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
