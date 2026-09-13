import {
  captureCredentialChallengeMaterial,
  consumeCredentialChallengeBootstrap,
  type AccountActivationMaterial
} from "./accountActivation";

export const forgotPasswordRoute = "/account/forgot-password";
export const resetPasswordRoute = "/account/reset-password";
export const passwordResetRequestApiRoute = "/v1/human-authentication/password-reset-requests";
export const passwordResetApiRoute = "/v1/human-authentication/password-resets";
export const passwordResetBootstrapKey = "__EXITPASS_TRANSIENT_PASSWORD_RESET__";

export type PasswordResetMaterial = AccountActivationMaterial;

export interface PasswordResetAcceptedResponse {
  outcome: "REQUEST_ACCEPTED";
  correlationId: string;
}

export interface PasswordResetCompletionResponse {
  outcome: string;
  authenticated: boolean;
  errorCode: string | null;
  retryable: boolean;
  correlationId: string;
}

export type PasswordRecoveryErrorKind = "invalid-or-expired" | "password-rejected" | "unavailable" | "malformed-response";

export class PasswordRecoveryError extends Error {
  constructor(
    readonly kind: PasswordRecoveryErrorKind,
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "PasswordRecoveryError";
  }
}

export interface PasswordRecoveryClient {
  requestReset(username: string, signal?: AbortSignal): Promise<PasswordResetAcceptedResponse>;
  resetPassword(material: PasswordResetMaterial, newPassword: string, signal?: AbortSignal): Promise<PasswordResetCompletionResponse>;
}

export function capturePasswordResetMaterial(
  location: Pick<Location, "href" | "pathname"> = window.location,
  history: Pick<History, "replaceState" | "state"> = window.history
): PasswordResetMaterial | undefined {
  return captureCredentialChallengeMaterial(resetPasswordRoute, location, history);
}

export function consumePasswordResetBootstrap(): PasswordResetMaterial | undefined {
  return consumeCredentialChallengeBootstrap(passwordResetBootstrapKey);
}

export function createPasswordRecoveryClient(options: { fetchImpl?: typeof fetch } = {}): PasswordRecoveryClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async requestReset(username, signal) {
      const response = await safeFetch(fetchImpl, passwordResetRequestApiRoute, { username }, signal);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw malformedResponse();
      }
      if (response.status !== 202 || !response.ok || !isRecord(payload)
        || payload.outcome !== "REQUEST_ACCEPTED" || typeof payload.correlationId !== "string") {
        throw new PasswordRecoveryError("unavailable", "PASSWORD_RESET_REQUEST_UNAVAILABLE", "Password recovery is temporarily unavailable. Try again.", true);
      }
      return { outcome: "REQUEST_ACCEPTED", correlationId: payload.correlationId };
    },
    async resetPassword(material, newPassword, signal) {
      const response = await safeFetch(fetchImpl, passwordResetApiRoute, {
        challengeReference: material.challengeReference,
        challengeSecret: material.challengeSecret,
        newPassword
      }, signal);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw malformedResponse();
      }
      const parsed = parseCompletionResponse(payload);
      if (!response.ok) throw mapCompletionError(response.status, parsed);
      if (parsed.outcome !== "PASSWORD_RESET_COMPLETED" || parsed.authenticated) {
        throw malformedResponse();
      }
      return parsed;
    }
  };
}

async function safeFetch(fetchImpl: typeof fetch, path: string, body: object, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new PasswordRecoveryError("unavailable", "PASSWORD_RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable. Try again.", true);
  }
}

function parseCompletionResponse(value: unknown): PasswordResetCompletionResponse {
  if (!isRecord(value)
    || typeof value.outcome !== "string"
    || typeof value.authenticated !== "boolean"
    || typeof value.retryable !== "boolean"
    || typeof value.correlationId !== "string") {
    throw malformedResponse();
  }
  return {
    outcome: value.outcome,
    authenticated: value.authenticated,
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
    retryable: value.retryable,
    correlationId: value.correlationId
  };
}

function mapCompletionError(status: number, response: PasswordResetCompletionResponse): PasswordRecoveryError {
  const code = response.errorCode ?? response.outcome;
  if (code === "PASSWORD_POLICY_FAILED") {
    return new PasswordRecoveryError("password-rejected", code, "That password was not accepted by the ExitPass password policy. Choose a different password and try again.");
  }
  if (code === "INVALID_OR_EXPIRED_CHALLENGE" || response.outcome === "CHALLENGE_REJECTED") {
    return new PasswordRecoveryError("invalid-or-expired", code, "This password reset link or code is invalid, expired, or has already been used.");
  }
  if (status === 502 || status === 503 || status === 504 || response.retryable) {
    return new PasswordRecoveryError("unavailable", code, "Password recovery is temporarily unavailable. Try again.", true);
  }
  return new PasswordRecoveryError("invalid-or-expired", code, "This password reset link or code could not be accepted.");
}

function malformedResponse(): PasswordRecoveryError {
  return new PasswordRecoveryError("malformed-response", "PASSWORD_RECOVERY_MALFORMED_RESPONSE", "The password recovery response could not be read safely.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
