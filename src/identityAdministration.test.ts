import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import { createIdentityAdministrationClient, delegableScopesApiRoute, identityAdministrationApiRoute } from "./identityAdministration";

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

  it("loads authoritative delegable scope metadata from the dedicated server route", async () => {
    const payload = {
      siteGroups: [{ siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null }],
      sites: [
        { siteId: "2d1dcdf8-f563-537c-8542-0bde7cc9da97", siteCode: "PITX-LEVEL-3", siteName: "PITX Level 3", siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null },
        { siteId: "b336964f-3b84-5404-8690-97ead0929b1f", siteCode: "PITX-OPEN-LOT", siteName: "PITX Open Lot", siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null }
      ]
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(delegableScopesApiRoute);
      return json(payload);
    });
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl }));
    await expect(client.getDelegableScopes()).resolves.toEqual(payload);
  });

  it("requests server-owned compatible direct Add User roles and accepts canonical metadata", async () => {
    const payload = [{
      roleReference: "role-finance", code: "FINANCE_RECONCILIATION_ANALYST", name: "Finance / Reconciliation Analyst",
      description: "Read-only reconciliation", type: "SYSTEM", status: "ACTIVE", isPrivileged: false,
      requiresElevatedApproval: false, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1,
      provenance: "CANONICAL_ROLE", directAddUserEligible: true, humanAssignable: true, allowedUserTypes: ["FINANCE_USER"]
    }];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${identityAdministrationApiRoute}/roles?userType=FINANCE_USER&directAddUserOnly=true`);
      return json(payload);
    });
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl }));
    await expect(client.listRoles({ userType: "FINANCE_USER", directAddUserOnly: true })).resolves.toEqual(payload);
  });

  it.each([
    ["service role", { roleReference: "service", code: "SERVICE_PRINCIPAL", name: "Service Principal", type: "SYSTEM", status: "ACTIVE", isPrivileged: false, requiresElevatedApproval: false, provenance: "SERVICE_ROLE", directAddUserEligible: false, humanAssignable: false, allowedUserTypes: [] }],
    ["invented role", { roleReference: "invented", code: "SITE_ADMINISTRATOR", name: "Site Administrator", type: "SYSTEM", status: "ACTIVE", isPrivileged: false, requiresElevatedApproval: false, provenance: "CANONICAL_ROLE", directAddUserEligible: true, humanAssignable: true, allowedUserTypes: ["SITE_OPERATOR"] }]
  ])("fails closed if the server returns a %s in the human catalog", async (_name, role) => {
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => json([role])) }));
    await expect(client.listRoles()).rejects.toMatchObject({ kind: "malformed-response", code: "IDENTITY_ADMIN_MALFORMED_RESPONSE" });
  });

  it("rejects malformed delegable scope metadata instead of synthesizing labels", async () => {
    const client = createIdentityAdministrationClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => json({ siteGroups: [{ siteGroupId: "unresolved" }], sites: [] })) }));
    await expect(client.getDelegableScopes()).rejects.toMatchObject({ kind: "malformed-response", code: "IDENTITY_ADMIN_MALFORMED_RESPONSE" });
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
