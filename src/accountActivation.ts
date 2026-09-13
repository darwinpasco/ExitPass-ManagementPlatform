export const accountActivationRoute = "/account/activate";
export const accountActivationApiRoute = "/v1/human-authentication/activations";
const transientBootstrapKey = "__EXITPASS_TRANSIENT_ACCOUNT_ACTIVATION__";

export interface AccountActivationMaterial {
  challengeReference: string;
  challengeSecret: string;
}

export interface AccountActivationResponse {
  outcome: string;
  authenticated: boolean;
  errorCode: string | null;
  retryable: boolean;
  correlationId: string;
}

export type AccountActivationErrorKind = "invalid-or-expired" | "password-rejected" | "unavailable" | "malformed-response";

export class AccountActivationError extends Error {
  constructor(
    readonly kind: AccountActivationErrorKind,
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "AccountActivationError";
  }
}

export interface AccountActivationClient {
  activate(material: AccountActivationMaterial, newPassword: string, signal?: AbortSignal): Promise<AccountActivationResponse>;
}

export function captureAccountActivationMaterial(
  location: Pick<Location, "href" | "pathname"> = window.location,
  history: Pick<History, "replaceState" | "state"> = window.history
): AccountActivationMaterial | undefined {
  if (normalizePath(location.pathname) !== accountActivationRoute) return undefined;

  const url = new URL(location.href);
  const challengeReference = url.searchParams.get("challengeReference")?.trim() ?? "";
  const challengeSecret = url.searchParams.get("challengeSecret")?.trim() ?? "";
  const carriedActivationMaterial = url.searchParams.has("challengeReference") || url.searchParams.has("challengeSecret");
  if (carriedActivationMaterial) {
    url.searchParams.delete("challengeReference");
    url.searchParams.delete("challengeSecret");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return challengeReference && challengeSecret ? { challengeReference, challengeSecret } : undefined;
}

export function consumeAccountActivationBootstrap(): AccountActivationMaterial | undefined {
  const target = window as unknown as Window & Record<string, unknown>;
  const candidate = target[transientBootstrapKey];
  delete target[transientBootstrapKey];
  if (!isRecord(candidate)
    || typeof candidate.challengeReference !== "string"
    || typeof candidate.challengeSecret !== "string"
    || !candidate.challengeReference
    || !candidate.challengeSecret) {
    return undefined;
  }
  return { challengeReference: candidate.challengeReference, challengeSecret: candidate.challengeSecret };
}

export function createAccountActivationClient(options: { fetchImpl?: typeof fetch } = {}): AccountActivationClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async activate(material, newPassword, signal) {
      let response: Response;
      try {
        response = await fetchImpl(accountActivationApiRoute, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeReference: material.challengeReference,
            challengeSecret: material.challengeSecret,
            newPassword
          }),
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new AccountActivationError("unavailable", "ACCOUNT_ACTIVATION_UNAVAILABLE", "Account activation is temporarily unavailable. Try again.", true);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AccountActivationError("malformed-response", "ACCOUNT_ACTIVATION_MALFORMED_RESPONSE", "The activation response could not be read safely.");
      }
      const parsed = parseResponse(payload);
      if (!response.ok) throw mapError(response.status, parsed);
      if (parsed.outcome !== "ACCOUNT_ACTIVATED" || parsed.authenticated) {
        throw new AccountActivationError("malformed-response", "ACCOUNT_ACTIVATION_UNEXPECTED_RESPONSE", "The activation response could not be read safely.");
      }
      return parsed;
    }
  };
}

function parseResponse(value: unknown): AccountActivationResponse {
  if (!isRecord(value)
    || typeof value.outcome !== "string"
    || typeof value.authenticated !== "boolean"
    || typeof value.retryable !== "boolean"
    || typeof value.correlationId !== "string") {
    throw new AccountActivationError("malformed-response", "ACCOUNT_ACTIVATION_MALFORMED_RESPONSE", "The activation response could not be read safely.");
  }
  return {
    outcome: value.outcome,
    authenticated: value.authenticated,
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
    retryable: value.retryable,
    correlationId: value.correlationId
  };
}

function mapError(status: number, response: AccountActivationResponse): AccountActivationError {
  const code = response.errorCode ?? response.outcome;
  if (code === "PASSWORD_POLICY_FAILED") {
    return new AccountActivationError("password-rejected", code, "That password was not accepted by the ExitPass password policy. Choose a different password and try again.");
  }
  if (code === "INVALID_OR_EXPIRED_CHALLENGE" || response.outcome === "CHALLENGE_REJECTED") {
    return new AccountActivationError("invalid-or-expired", code, "This activation invitation or code is invalid, expired, or has already been used.");
  }
  if (status === 502 || status === 503 || status === 504 || response.retryable) {
    return new AccountActivationError("unavailable", code, "Account activation is temporarily unavailable. Try again.", true);
  }
  return new AccountActivationError("invalid-or-expired", code, "This activation invitation or code could not be accepted.");
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
