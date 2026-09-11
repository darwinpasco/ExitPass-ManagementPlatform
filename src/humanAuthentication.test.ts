import { describe, expect, it, vi } from "vitest";
import {
  HumanAuthenticationError,
  createHumanAuthenticationClient,
  csrfHeaderName,
  humanLoginRoute,
  humanLogoutRoute,
  humanSessionContinueRoute,
  humanSessionRoute,
  managementPlatformAudience,
  toManagementPlatformAuthState,
  type HumanAuthenticationResponse,
  type HumanSessionDto
} from "./humanAuthentication";

describe("I-020 human authentication client", () => {
  it("uses the relative session route, same-origin credentials, and no privileged identity headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(successResponse(), 200, { [csrfHeaderName]: "csrf-runtime" }));
    const client = createHumanAuthenticationClient({ fetchImpl });

    const result = await client.getCurrentSession();

    expect(result.authenticated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(humanSessionRoute, expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store" }));
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-ExitPass-User-Id")).toBe(false);
    expect(headers.has("X-ExitPass-Permissions")).toBe(false);
    expect(headers.has("X-ExitPass-Site-Id")).toBe(false);
    expect(client.hasCsrfToken()).toBe(true);
  });

  it("sends only username, password, fixed audience, and optional TOTP to login", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(successResponse()));
    const client = createHumanAuthenticationClient({ fetchImpl });

    await client.login("ordinary.user", "password-value");
    await client.login("privileged.admin", "password-value", "123456");

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([humanLoginRoute, humanLoginRoute]);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ username: "ordinary.user", password: "password-value", audience: managementPlatformAudience });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({ username: "privileged.admin", password: "password-value", audience: managementPlatformAudience, totpCode: "123456" });
  });

  it("keeps the antiforgery token in runtime memory and sends it only on state-changing session requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(successResponse(), 200, { [csrfHeaderName]: "csrf-runtime" }))
      .mockResolvedValueOnce(jsonResponse(successResponse()))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createHumanAuthenticationClient({ fetchImpl });

    await client.getCurrentSession();
    await client.continueSession();
    await client.logout();

    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).has(csrfHeaderName)).toBe(false);
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get(csrfHeaderName)).toBe("csrf-runtime");
    expect(new Headers(fetchImpl.mock.calls[2][1]?.headers).get(csrfHeaderName)).toBe("csrf-runtime");
    expect(fetchImpl.mock.calls[1][0]).toBe(humanSessionContinueRoute);
    expect(fetchImpl.mock.calls[2][0]).toBe(humanLogoutRoute);
    expect(client.hasCsrfToken()).toBe(false);
  });

  it("fails closed before a CSRF-protected request when no runtime token is available", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createHumanAuthenticationClient({ fetchImpl });

    await expect(client.logout()).rejects.toMatchObject({ kind: "csrf", code: "CSRF_TOKEN_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("decorates administration requests from the same bounded runtime CSRF source", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(successResponse(), 200, { "X-CSRF-Token": "runtime-only-token" }));
    const client = createHumanAuthenticationClient({ fetchImpl });
    await client.getCurrentSession();
    const headers = new Headers();

    client.authorizeUnsafeRequest(headers);

    expect(headers.get("X-CSRF-Token")).toBe("runtime-only-token");
    client.clearRuntimeState();
    expect(() => client.authorizeUnsafeRequest(new Headers())).toThrowError(/secure administration request/i);
  });

  it.each([
    ["TOTP_REQUIRED", 401, "mfa-required"],
    ["TOTP_INVALID", 401, "invalid-totp"],
    ["INVALID_CREDENTIALS", 401, "invalid-credentials"],
    ["AUTHENTICATION_THROTTLED", 429, "throttled"],
    ["SESSION_EXPIRED", 401, "session-expired"],
    ["SESSION_REVOKED", 401, "session-revoked"],
    ["CSRF_VALIDATION_FAILED", 400, "csrf"]
  ])("maps %s to a controlled %s response", async (errorCode, status, expectedKind) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(errorResponse(errorCode), status));
    const client = createHumanAuthenticationClient({ fetchImpl });
    const action = errorCode === "CSRF_VALIDATION_FAILED"
      ? async () => {
          await client.getCurrentSession().catch(() => undefined);
          return client.login("user", "password");
        }
      : () => client.login("user", "password");

    await expect(action()).rejects.toMatchObject({ kind: expectedKind, code: errorCode });
  });

  it("rejects malformed responses and APT session tokens without reflecting raw content", async () => {
    const malformedClient = createHumanAuthenticationClient({ fetchImpl: vi.fn(async () => new Response("provider stack trace", { status: 200 })) as unknown as typeof fetch });
    await expect(malformedClient.getCurrentSession()).rejects.toMatchObject({ kind: "malformed-response", message: "The authentication response could not be read safely." });

    const aptTokenClient = createHumanAuthenticationClient({ fetchImpl: vi.fn(async () => jsonResponse({ ...successResponse(), aptSessionToken: "must-not-enter-browser-state" })) as unknown as typeof fetch });
    await expect(aptTokenClient.getCurrentSession()).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("maps only server-returned permissions and scope into presentation state", () => {
    const state = toManagementPlatformAuthState(session());
    expect(state.principal?.permissions).toEqual(["management-platform.overview.read"]);
    expect(state.principal?.authorizedSiteReferences).toEqual(["71000000-0000-0000-0000-000000000101"]);
    expect(state.principal?.authorizedSiteGroupReferences).toEqual(["71000000-0000-0000-0000-000000000900"]);
    expect(state.principal?.authorizedSites).toEqual([]);
    expect(state.principal?.hasGlobalScope).toBe(false);
  });
});

export function session(overrides: Partial<HumanSessionDto> = {}): HumanSessionDto {
  return {
    sessionReference: "10000000-0000-0000-0000-000000000001",
    userReference: "10000000-0000-0000-0000-000000000002",
    username: "ordinary.user",
    displayName: "Ordinary Management User",
    audience: managementPlatformAudience,
    assurance: "PASSWORD",
    privilegedAccount: false,
    passwordChangeRequired: false,
    mfaRequired: false,
    mfaSatisfied: false,
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: ["management-platform.overview.read"],
    siteReferences: ["71000000-0000-0000-0000-000000000101"],
    siteGroupReferences: ["71000000-0000-0000-0000-000000000900"],
    hasGlobalScope: false,
    deviceServiceIdentityReference: null,
    correlationId: "10000000-0000-0000-0000-000000000003",
    ...overrides
  };
}

export function successResponse(sessionValue: HumanSessionDto = session()): HumanAuthenticationResponse {
  return {
    outcome: "AUTHENTICATED",
    authenticated: true,
    session: sessionValue,
    aptSessionToken: null,
    errorCode: null,
    retryable: false,
    correlationId: "10000000-0000-0000-0000-000000000003"
  };
}

function errorResponse(errorCode: string): HumanAuthenticationResponse {
  return {
    outcome: errorCode === "TOTP_REQUIRED" || errorCode === "TOTP_INVALID" ? "MFA_REQUIRED" : "FAILED",
    authenticated: false,
    session: null,
    aptSessionToken: null,
    errorCode,
    retryable: errorCode.includes("THROTTLED"),
    correlationId: "10000000-0000-0000-0000-000000000004"
  };
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
