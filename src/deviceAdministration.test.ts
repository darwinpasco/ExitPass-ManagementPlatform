import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import { createDeviceAdministrationClient, deviceAdministrationApiRoute } from "./deviceAdministration";

describe("device administration API client", () => {
  it("uses only governed same-origin routes and shared CSRF composition", async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = [];
    const authorizeUnsafeRequest = vi.fn((headers: Headers) => headers.set("X-CSRF-Token", "device-admin-csrf"));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("X-ExitPass-User-Id")).toBeNull();
      if (init?.method === "POST") expect(headers.get("X-CSRF-Token")).toBe("device-admin-csrf");
      calls.push({ path: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return json({});
    });
    const client = createDeviceAdministrationClient(createCentralPmsApiClient({ fetchImpl, authorizeUnsafeRequest }));

    await client.list();
    await client.listScopes();
    await client.get("device/encoded");
    await client.register({ deviceName: "APT", deviceType: "ASSISTED_PAYMENT_TERMINAL", description: null, siteId: "site-1", siteGroupId: null, terminalIdentifier: "APT-01", terminalSerialNumber: "APT-HARDWARE-001" });
    await client.provision("device-1");
    await client.cancelProvisioning("device-1", "ADMINISTRATOR_CANCELLED");
    await client.suspend("device-1", "SECURITY_REVIEW");
    await client.reactivate("device-1", "REVIEW_COMPLETE");
    await client.revoke("device-1", "RETIRED");
    await client.rotate("device-1", "ROTATION");
    await client.replace("device-1", { deviceName: "APT replacement", description: null, siteId: null, siteGroupId: null, terminalIdentifier: "APT-02", terminalSerialNumber: "APT-HARDWARE-002", reasonCode: "HARDWARE_REPLACEMENT" });

    expect(calls.map(call => [call.method, call.path])).toEqual([
      ["GET", deviceAdministrationApiRoute],
      ["GET", `${deviceAdministrationApiRoute}/scopes`],
      ["GET", `${deviceAdministrationApiRoute}/device%2Fencoded`],
      ["POST", deviceAdministrationApiRoute],
      ["POST", `${deviceAdministrationApiRoute}/device-1/provisioning`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/provisioning/cancel`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/suspend`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/reactivate`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/revoke`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/rotate`],
      ["POST", `${deviceAdministrationApiRoute}/device-1/replace`]
    ]);
    expect(calls[5].body).toEqual({ reasonCode: "ADMINISTRATOR_CANCELLED" });
    expect(calls[6].body).toEqual({ reasonCode: "SECURITY_REVIEW" });
    expect(calls[10].body).toMatchObject({ reasonCode: "HARDWARE_REPLACEMENT", terminalIdentifier: "APT-02", terminalSerialNumber: "APT-HARDWARE-002" });
    expect(authorizeUnsafeRequest).toHaveBeenCalledTimes(8);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
