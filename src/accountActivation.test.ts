import { describe, expect, it, vi } from "vitest";
import {
  AccountActivationError,
  accountActivationApiRoute,
  captureAccountActivationMaterial,
  createAccountActivationClient
} from "./accountActivation";

describe("account activation transport", () => {
  it("captures canonical query material and immediately scrubs both secret-bearing parameters", () => {
    const replaceState = vi.fn();
    const material = captureAccountActivationMaterial(
      {
        pathname: "/account/activate",
        href: "https://exitpass.test/account/activate?challengeReference=opaque-reference&challengeSecret=one-time-secret&source=employee"
      },
      { state: { safe: true }, replaceState }
    );

    expect(material).toEqual({ challengeReference: "opaque-reference", challengeSecret: "one-time-secret" });
    expect(replaceState).toHaveBeenCalledWith({ safe: true }, "", "/account/activate?source=employee");
    expect(JSON.stringify(replaceState.mock.calls)).not.toContain("one-time-secret");
  });

  it("supports manual navigation without material and does not rewrite unrelated routes", () => {
    const replaceState = vi.fn();
    expect(captureAccountActivationMaterial(
      { pathname: "/account/activate/", href: "https://exitpass.test/account/activate/" },
      { state: null, replaceState }
    )).toBeUndefined();
    expect(captureAccountActivationMaterial(
      { pathname: "/management-platform/", href: "https://exitpass.test/management-platform/?challengeSecret=unrelated" },
      { state: null, replaceState }
    )).toBeUndefined();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("posts only canonical activation fields with no-store and no-referrer posture", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      outcome: "ACCOUNT_ACTIVATED",
      authenticated: false,
      session: null,
      aptSessionToken: null,
      errorCode: null,
      retryable: false,
      correlationId: "activation-correlation"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createAccountActivationClient({ fetchImpl });

    await client.activate({ challengeReference: "opaque-reference", challengeSecret: "one-time-secret" }, "employee-owned-password");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [path, request] = fetchImpl.mock.calls[0];
    expect(path).toBe(accountActivationApiRoute);
    expect(request).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(JSON.parse(String(request?.body))).toEqual({
      challengeReference: "opaque-reference",
      challengeSecret: "one-time-secret",
      newPassword: "employee-owned-password"
    });
  });

  it("maps password-policy, invalid challenge, and unavailable responses to bounded states", async () => {
    const response = (status: number, body: object) => Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    }));
    const base = { outcome: "REJECTED", authenticated: false, retryable: false, correlationId: "safe-correlation" };

    const passwordClient = createAccountActivationClient({ fetchImpl: vi.fn<typeof fetch>().mockImplementation(() => response(400, { ...base, outcome: "PASSWORD_REJECTED", errorCode: "PASSWORD_POLICY_FAILED" })) });
    await expect(passwordClient.activate({ challengeReference: "r", challengeSecret: "s" }, "p"))
      .rejects.toMatchObject({ kind: "password-rejected" } satisfies Partial<AccountActivationError>);

    const invalidClient = createAccountActivationClient({ fetchImpl: vi.fn<typeof fetch>().mockImplementation(() => response(400, { ...base, outcome: "CHALLENGE_REJECTED", errorCode: "INVALID_OR_EXPIRED_CHALLENGE" })) });
    await expect(invalidClient.activate({ challengeReference: "r", challengeSecret: "s" }, "p"))
      .rejects.toMatchObject({ kind: "invalid-or-expired" } satisfies Partial<AccountActivationError>);

    const unavailableClient = createAccountActivationClient({ fetchImpl: vi.fn<typeof fetch>().mockImplementation(() => response(503, { ...base, errorCode: "AUTHENTICATION_UNAVAILABLE", retryable: true })) });
    await expect(unavailableClient.activate({ challengeReference: "r", challengeSecret: "s" }, "p"))
      .rejects.toMatchObject({ kind: "unavailable", retryable: true } satisfies Partial<AccountActivationError>);
  });
});
