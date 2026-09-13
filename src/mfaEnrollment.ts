import { assertHumanAuthenticationPath, type HumanAuthenticationClient } from "./humanAuthentication";

export const mfaEnrollmentRoute = "/account/mfa-enrollment";
export const totpEnrollmentApiRoute = "/v1/human-authentication/totp/enrollment";
export const totpEnrollmentRestartApiRoute = `${totpEnrollmentApiRoute}/restart`;
export const totpEnrollmentConfirmApiRoute = `${totpEnrollmentApiRoute}/confirm`;

export interface TotpEnrollmentResponse {
  outcome: string;
  sharedSecret: string | null;
  provisioningUri: string | null;
  enrollmentStartedAt: string | null;
  correlationId: string;
  errorCode: string | null;
}

export type MfaEnrollmentErrorKind =
  | "session-ended"
  | "pending-exists"
  | "invalid-code"
  | "throttled"
  | "not-required"
  | "invalid-state"
  | "unavailable"
  | "malformed-response";

export class MfaEnrollmentError extends Error {
  constructor(
    readonly kind: MfaEnrollmentErrorKind,
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "MfaEnrollmentError";
  }
}

export interface MfaEnrollmentClient {
  begin(signal?: AbortSignal): Promise<TotpEnrollmentResponse>;
  restart(signal?: AbortSignal): Promise<TotpEnrollmentResponse>;
  confirm(code: string, signal?: AbortSignal): Promise<TotpEnrollmentResponse>;
}

export function createMfaEnrollmentClient(
  authenticationClient: Pick<HumanAuthenticationClient, "authorizeUnsafeRequest">,
  options: { fetchImpl?: typeof fetch } = {}
): MfaEnrollmentClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, body: object | undefined, signal?: AbortSignal): Promise<TotpEnrollmentResponse> {
    assertHumanAuthenticationPath(path);
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    authenticationClient.authorizeUnsafeRequest(headers);

    let response: Response;
    try {
      response = await fetchImpl(path, {
        method: "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new MfaEnrollmentError("unavailable", "TOTP_ENROLLMENT_UNAVAILABLE", "Authenticator setup is temporarily unavailable. Try again.", true);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw malformedResponse();
    }
    const parsed = parseResponse(payload);
    if (!response.ok) throw mapError(response.status, parsed);
    return parsed;
  }

  async function issue(path: string, signal?: AbortSignal): Promise<TotpEnrollmentResponse> {
    const response = await request(path, undefined, signal);
    if ((response.outcome !== "TOTP_ENROLLMENT_STARTED" && response.outcome !== "TOTP_ENROLLMENT_RESTARTED")
      || !response.sharedSecret || !response.provisioningUri || !response.enrollmentStartedAt) {
      throw malformedResponse();
    }
    return response;
  }

  return {
    begin: (signal) => issue(totpEnrollmentApiRoute, signal),
    restart: (signal) => issue(totpEnrollmentRestartApiRoute, signal),
    async confirm(code, signal) {
      const response = await request(totpEnrollmentConfirmApiRoute, { code }, signal);
      if (response.outcome !== "TOTP_CONFIRMED_REAUTHENTICATION_REQUIRED"
        || response.sharedSecret !== null || response.provisioningUri !== null) {
        throw malformedResponse();
      }
      return response;
    }
  };
}

function parseResponse(value: unknown): TotpEnrollmentResponse {
  if (!isRecord(value)
    || typeof value.outcome !== "string"
    || !(value.sharedSecret === null || typeof value.sharedSecret === "string")
    || !(value.provisioningUri === null || typeof value.provisioningUri === "string")
    || !(value.enrollmentStartedAt === null || typeof value.enrollmentStartedAt === "string")
    || typeof value.correlationId !== "string"
    || !(value.errorCode === null || typeof value.errorCode === "string")) {
    throw malformedResponse();
  }
  return {
    outcome: value.outcome,
    sharedSecret: value.sharedSecret,
    provisioningUri: value.provisioningUri,
    enrollmentStartedAt: value.enrollmentStartedAt,
    correlationId: value.correlationId,
    errorCode: value.errorCode
  };
}

function mapError(status: number, response: TotpEnrollmentResponse): MfaEnrollmentError {
  const code = response.errorCode ?? response.outcome;
  if (status === 401 || code === "SESSION_REQUIRED" || code === "SESSION_INVALID"
    || code === "SESSION_EXPIRED" || code === "SESSION_REVOKED") {
    return new MfaEnrollmentError("session-ended", code, "Your enrollment session is no longer active. Sign in again.");
  }
  if (code === "TOTP_AUTHENTICATOR_ALREADY_EXISTS") {
    return new MfaEnrollmentError("pending-exists", code, "Authenticator setup was already started. Restart setup to receive new one-time material.");
  }
  if (code === "TOTP_CONFIRMATION_FAILED") {
    return new MfaEnrollmentError("invalid-code", code, "The authenticator code was not accepted. Check the current code and try again.");
  }
  if (code === "TOTP_THROTTLED" || status === 429) {
    return new MfaEnrollmentError("throttled", code, "Too many authenticator attempts were received. Wait and try again.", true);
  }
  if (code === "MFA_ENROLLMENT_NOT_REQUIRED" || status === 403) {
    return new MfaEnrollmentError("not-required", code, "This session is not eligible for first-login authenticator enrollment.");
  }
  if (code === "TOTP_ENROLLMENT_RESTART_NOT_ALLOWED" || code === "TOTP_ENROLLMENT_NOT_PENDING") {
    return new MfaEnrollmentError("invalid-state", code, "Authenticator setup is not pending. Sign in again to continue safely.");
  }
  if (code === "TOTP_PROTECTION_UNAVAILABLE" || status === 502 || status === 503 || status === 504) {
    return new MfaEnrollmentError("unavailable", code, "Authenticator setup is temporarily unavailable. Try again.", true);
  }
  return new MfaEnrollmentError("invalid-state", code, "Authenticator setup could not continue safely.", response.errorCode === "TOTP_ENROLLMENT_CONFLICT");
}

function malformedResponse(): MfaEnrollmentError {
  return new MfaEnrollmentError("malformed-response", "TOTP_ENROLLMENT_MALFORMED_RESPONSE", "The authenticator setup response could not be read safely.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
