import { describe, expect, it, vi } from "vitest";
import {
  PasswordRecoveryError,
  capturePasswordResetMaterial,
  createPasswordRecoveryClient,
  passwordResetApiRoute,
  passwordResetRequestApiRoute
} from "./passwordRecovery";

describe("password recovery transport", () => {
  it("captures canonical reset material and immediately scrubs both secret-bearing parameters", () => {
    const replaceState = vi.fn();
    const material = capturePasswordResetMaterial({
      pathname: "/account/reset-password",
      href: "https://exitpass.test/account/reset-password?challengeReference=opaque-reference&challengeSecret=one-time-secret&source=email"
    }, { state: { safe: true }, replaceState });

    expect(material).toEqual({ challengeReference: "opaque-reference", challengeSecret: "one-time-secret" });
    expect(replaceState).toHaveBeenCalledWith({ safe: true }, "", "/account/reset-password?source=email");
    expect(JSON.stringify(replaceState.mock.calls)).not.toContain("one-time-secret");
  });

  it("posts username only and accepts the anti-enumerating reset-request contract", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(202, {
      outcome: "REQUEST_ACCEPTED",
      correlationId: "request-correlation"
    }));
    const client = createPasswordRecoveryClient({ fetchImpl });

    await expect(client.requestReset("unknown-or-known-user")).resolves.toEqual({
      outcome: "REQUEST_ACCEPTED",
      correlationId: "request-correlation"
    });
    expect(fetchImpl).toHaveBeenCalledWith(passwordResetRequestApiRoute, expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ username: "unknown-or-known-user" })
    }));
  });

  it("posts only canonical reset fields and requires a non-authenticating completion response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, completion("PASSWORD_RESET_COMPLETED")));
    const client = createPasswordRecoveryClient({ fetchImpl });

    await client.resetPassword({ challengeReference: "opaque-reference", challengeSecret: "one-time-secret" }, "employee-owned-password");

    expect(fetchImpl).toHaveBeenCalledWith(passwordResetApiRoute, expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({
        challengeReference: "opaque-reference",
        challengeSecret: "one-time-secret",
        newPassword: "employee-owned-password"
      })
    }));
  });

  it("maps policy, invalid/replayed challenge, unavailable, and malformed responses safely", async () => {
    const policy = createPasswordRecoveryClient({ fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(400, completion("PASSWORD_REJECTED", "PASSWORD_POLICY_FAILED"))) });
    await expect(policy.resetPassword(material(), "password"))
      .rejects.toMatchObject({ kind: "password-rejected" } satisfies Partial<PasswordRecoveryError>);

    const invalid = createPasswordRecoveryClient({ fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(400, completion("CHALLENGE_REJECTED", "INVALID_OR_EXPIRED_CHALLENGE"))) });
    await expect(invalid.resetPassword(material(), "password"))
      .rejects.toMatchObject({ kind: "invalid-or-expired" } satisfies Partial<PasswordRecoveryError>);

    const unavailable = createPasswordRecoveryClient({ fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(503, { ...completion("FAILED"), retryable: true })) });
    await expect(unavailable.resetPassword(material(), "password"))
      .rejects.toMatchObject({ kind: "unavailable", retryable: true } satisfies Partial<PasswordRecoveryError>);

    const malformed = createPasswordRecoveryClient({ fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(202, { outcome: "REQUEST_ACCEPTED" })) });
    await expect(malformed.requestReset("user"))
      .rejects.toMatchObject({ kind: "unavailable" } satisfies Partial<PasswordRecoveryError>);
  });
});

function material() {
  return { challengeReference: "reference", challengeSecret: "secret" };
}

function completion(outcome: string, errorCode: string | null = null) {
  return { outcome, authenticated: false, errorCode, retryable: false, correlationId: "safe-correlation" };
}

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
