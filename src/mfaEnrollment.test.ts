import { describe, expect, it, vi } from "vitest";
import {
  createMfaEnrollmentClient,
  totpEnrollmentApiRoute,
  totpEnrollmentConfirmApiRoute,
  totpEnrollmentRestartApiRoute
} from "./mfaEnrollment";
import { csrfHeaderName } from "./humanAuthentication";

describe("W4.4 TOTP enrollment transport", () => {
  it("uses the runtime CSRF source and canonical one-time enrollment values", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(enrollmentResponse("TOTP_ENROLLMENT_STARTED")))
      .mockResolvedValueOnce(jsonResponse(enrollmentResponse("TOTP_ENROLLMENT_RESTARTED", "NEWSECRET", "otpauth://totp/ExitPass:new")))
      .mockResolvedValueOnce(jsonResponse({ ...enrollmentResponse("TOTP_CONFIRMED_REAUTHENTICATION_REQUIRED"), sharedSecret: null, provisioningUri: null }));
    const authenticationClient = {
      authorizeUnsafeRequest(headers: Headers) { headers.set(csrfHeaderName, "runtime-csrf"); }
    };
    const client = createMfaEnrollmentClient(authenticationClient, { fetchImpl });

    await expect(client.begin()).resolves.toMatchObject({ outcome: "TOTP_ENROLLMENT_STARTED", sharedSecret: "SETUPSECRET" });
    await expect(client.restart()).resolves.toMatchObject({ outcome: "TOTP_ENROLLMENT_RESTARTED", sharedSecret: "NEWSECRET" });
    await expect(client.confirm("123456")).resolves.toMatchObject({ outcome: "TOTP_CONFIRMED_REAUTHENTICATION_REQUIRED" });

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      totpEnrollmentApiRoute,
      totpEnrollmentRestartApiRoute,
      totpEnrollmentConfirmApiRoute
    ]);
    for (const call of fetchImpl.mock.calls) {
      expect(new Headers(call[1]?.headers).get(csrfHeaderName)).toBe("runtime-csrf");
      expect(call[1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" });
    }
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toEqual({ code: "123456" });
  });

  it.each([
    [409, "TOTP_AUTHENTICATOR_ALREADY_EXISTS", "pending-exists"],
    [400, "TOTP_CONFIRMATION_FAILED", "invalid-code"],
    [429, "TOTP_THROTTLED", "throttled"],
    [503, "TOTP_PROTECTION_UNAVAILABLE", "unavailable"],
    [401, "SESSION_EXPIRED", "session-ended"],
    [403, "MFA_ENROLLMENT_NOT_REQUIRED", "not-required"]
  ])("maps %s/%s to %s without reflecting internal material", async (status, errorCode, kind) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(rejectedResponse(errorCode), status));
    const client = createMfaEnrollmentClient({ authorizeUnsafeRequest: vi.fn() }, { fetchImpl });

    await expect(client.begin()).rejects.toMatchObject({ kind, code: errorCode });
  });
});

function enrollmentResponse(outcome: string, sharedSecret = "SETUPSECRET", provisioningUri = "otpauth://totp/ExitPass:user?secret=SETUPSECRET") {
  return {
    outcome,
    sharedSecret,
    provisioningUri,
    enrollmentStartedAt: "2030-01-01T00:00:00Z",
    correlationId: "10000000-0000-0000-0000-000000000001",
    errorCode: null
  };
}

function rejectedResponse(errorCode: string) {
  return {
    outcome: "REJECTED",
    sharedSecret: null,
    provisioningUri: null,
    enrollmentStartedAt: null,
    correlationId: "10000000-0000-0000-0000-000000000002",
    errorCode
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
