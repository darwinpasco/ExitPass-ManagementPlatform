import type { ManagementPlatformAuthState, ManagementPlatformPrincipal, ManagementPlatformSite } from "./types";

export const humanAuthenticationBaseRoute = "/v1/human-authentication";
export const humanLoginRoute = `${humanAuthenticationBaseRoute}/login`;
export const humanSessionRoute = `${humanAuthenticationBaseRoute}/session`;
export const humanSessionContinueRoute = `${humanSessionRoute}/continue`;
export const humanLogoutRoute = `${humanAuthenticationBaseRoute}/logout`;
export const managementPlatformAudience = "MANAGEMENT_PLATFORM";
export const csrfHeaderName = "X-CSRF-Token";

const forbiddenBrowserHeaderNames = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-exitpass-user-id",
  "x-operator-user-id",
  "x-exitpass-permissions",
  "x-management-platform-permissions",
  "x-exitpass-service-identity-id",
  "x-exitpass-site-id",
  "x-exitpass-site-group-id",
  "x-management-platform-site-id",
  "x-management-platform-site-group-id"
]);

export interface HumanLoginRequest {
  username: string;
  password: string;
  audience: typeof managementPlatformAudience;
  totpCode?: string;
}

export interface HumanSessionDto {
  sessionReference: string;
  userReference: string;
  username: string;
  displayName: string;
  audience: string;
  assurance: string;
  privilegedAccount: boolean;
  passwordChangeRequired: boolean;
  mfaRequired: boolean;
  mfaSatisfied: boolean;
  authenticatedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  permissions: string[];
  siteReferences: string[];
  siteGroupReferences: string[];
  hasGlobalScope: boolean;
  deviceServiceIdentityReference: string | null;
  correlationId: string;
}

export interface HumanAuthenticationResponse {
  outcome: string;
  authenticated: boolean;
  session: HumanSessionDto | null;
  aptSessionToken: string | null;
  errorCode: string | null;
  retryable: boolean;
  correlationId: string;
}

export type HumanAuthenticationErrorKind =
  | "invalid-credentials"
  | "mfa-required"
  | "invalid-totp"
  | "throttled"
  | "session-expired"
  | "session-revoked"
  | "authentication-required"
  | "permission-denied"
  | "csrf"
  | "unavailable"
  | "malformed-response"
  | "unknown";

export class HumanAuthenticationError extends Error {
  constructor(
    readonly kind: HumanAuthenticationErrorKind,
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "HumanAuthenticationError";
  }
}

export interface HumanAuthenticationClient {
  login(username: string, password: string, totpCode?: string, signal?: AbortSignal): Promise<HumanAuthenticationResponse>;
  getCurrentSession(signal?: AbortSignal): Promise<HumanAuthenticationResponse>;
  continueSession(signal?: AbortSignal): Promise<HumanAuthenticationResponse>;
  logout(signal?: AbortSignal): Promise<void>;
  clearRuntimeState(): void;
  hasCsrfToken(): boolean;
}

export function createHumanAuthenticationClient(options: { fetchImpl?: typeof fetch } = {}): HumanAuthenticationClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  let csrfToken: string | undefined;

  async function request(path: string, method: "GET" | "POST", body: unknown | undefined, csrfRequired: boolean, signal?: AbortSignal): Promise<HumanAuthenticationResponse> {
    assertHumanAuthenticationPath(path);
    if (csrfRequired && !csrfToken) {
      throw new HumanAuthenticationError("csrf", "CSRF_TOKEN_UNAVAILABLE", "The secure session request could not be completed. Refresh and try again.");
    }

    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (csrfRequired && csrfToken) {
      headers.set(csrfHeaderName, csrfToken);
    }
    assertSafeAuthenticationHeaders(headers);

    let response: Response;
    try {
      response = await fetchImpl(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
        signal
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new HumanAuthenticationError("unavailable", "HUMAN_AUTHENTICATION_UNAVAILABLE", "Sign-in services are temporarily unavailable. Try again.", undefined, true);
    }

    const responseToken = response.headers.get(csrfHeaderName);
    if (responseToken) {
      csrfToken = responseToken;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.status === 204 && response.ok) {
        return emptySuccessResponse();
      }
      throw new HumanAuthenticationError("malformed-response", "HUMAN_AUTHENTICATION_MALFORMED_RESPONSE", "The authentication response could not be read safely.");
    }

    const parsed = parseAuthenticationResponse(payload);
    if (!response.ok) {
      if (response.status === 401) {
        csrfToken = undefined;
      }
      throw mapAuthenticationError(response.status, parsed);
    }
    return parsed;
  }

  return {
    login(username, password, totpCode, signal) {
      const requestBody: HumanLoginRequest = {
        username,
        password,
        audience: managementPlatformAudience,
        ...(totpCode ? { totpCode } : {})
      };
      return request(humanLoginRoute, "POST", requestBody, false, signal);
    },
    getCurrentSession(signal) {
      return request(humanSessionRoute, "GET", undefined, false, signal);
    },
    continueSession(signal) {
      return request(humanSessionContinueRoute, "POST", {}, true, signal);
    },
    async logout(signal) {
      await request(humanLogoutRoute, "POST", undefined, true, signal);
      csrfToken = undefined;
    },
    clearRuntimeState() {
      csrfToken = undefined;
    },
    hasCsrfToken() {
      return Boolean(csrfToken);
    }
  };
}

export function toManagementPlatformAuthState(session: HumanSessionDto): ManagementPlatformAuthState {
  if (session.audience !== managementPlatformAudience) {
    throw new HumanAuthenticationError("permission-denied", "SESSION_AUDIENCE_MISMATCH", "This session is not available for the Management Platform.", 403);
  }

  const authorizedSites: ManagementPlatformSite[] = session.siteReferences.map((siteReference, index) => ({
    siteId: siteReference,
    displayName: `Site scope ${index + 1}`
  }));
  const principal: ManagementPlatformPrincipal = {
    authenticated: true,
    subjectRef: session.userReference,
    username: session.username,
    displayName: session.displayName,
    audience: session.audience,
    privilegedAccount: session.privilegedAccount,
    mfaRequired: session.mfaRequired,
    mfaSatisfied: session.mfaSatisfied,
    passwordChangeRequired: session.passwordChangeRequired,
    sessionExpiresAt: earlierDate(session.idleExpiresAt, session.absoluteExpiresAt),
    permissions: [...session.permissions],
    authorizedSites,
    authorizedSiteReferences: [...session.siteReferences],
    authorizedSiteGroupReferences: [...session.siteGroupReferences],
    hasGlobalScope: session.hasGlobalScope
  };
  return { status: "authenticated", principal };
}

export function isRestrictedSession(session: HumanSessionDto): boolean {
  return session.passwordChangeRequired || (session.mfaRequired && !session.mfaSatisfied);
}

export function assertHumanAuthenticationPath(path: string): void {
  if (!path.startsWith(`${humanAuthenticationBaseRoute}/`) || /^\/\//.test(path) || /^https?:\/\//i.test(path)) {
    throw new HumanAuthenticationError("unknown", "HUMAN_AUTHENTICATION_RELATIVE_ROUTE_REQUIRED", "The authentication request was blocked safely.");
  }
}

export function assertSafeAuthenticationHeaders(headers: Headers): void {
  for (const headerName of headers.keys()) {
    const normalized = headerName.toLowerCase();
    if (forbiddenBrowserHeaderNames.has(normalized) || normalized.startsWith("x-posserver-")) {
      throw new HumanAuthenticationError("unknown", "HUMAN_AUTHENTICATION_FORBIDDEN_HEADER", "The authentication request was blocked safely.");
    }
  }
}

function parseAuthenticationResponse(value: unknown): HumanAuthenticationResponse {
  if (!isRecord(value)
    || typeof value.outcome !== "string"
    || typeof value.authenticated !== "boolean"
    || typeof value.retryable !== "boolean"
    || typeof value.correlationId !== "string"
    || !(value.aptSessionToken === null || value.aptSessionToken === undefined)
    || !(value.session === null || value.session === undefined || isHumanSession(value.session))) {
    throw new HumanAuthenticationError("malformed-response", "HUMAN_AUTHENTICATION_MALFORMED_RESPONSE", "The authentication response could not be read safely.");
  }

  return {
    outcome: value.outcome,
    authenticated: value.authenticated,
    session: value.session ?? null,
    aptSessionToken: null,
    errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
    retryable: value.retryable,
    correlationId: value.correlationId
  };
}

function isHumanSession(value: unknown): value is HumanSessionDto {
  if (!isRecord(value)) {
    return false;
  }
  const stringFields = ["sessionReference", "userReference", "username", "displayName", "audience", "assurance", "authenticatedAt", "lastSeenAt", "idleExpiresAt", "absoluteExpiresAt", "correlationId"];
  const booleanFields = ["privilegedAccount", "passwordChangeRequired", "mfaRequired", "mfaSatisfied", "hasGlobalScope"];
  return stringFields.every((field) => typeof value[field] === "string")
    && booleanFields.every((field) => typeof value[field] === "boolean")
    && isStringArray(value.permissions)
    && isStringArray(value.siteReferences)
    && isStringArray(value.siteGroupReferences)
    && (value.deviceServiceIdentityReference === null || typeof value.deviceServiceIdentityReference === "string");
}

function mapAuthenticationError(status: number, response: HumanAuthenticationResponse): HumanAuthenticationError {
  const code = response.errorCode ?? response.outcome ?? `HTTP_${status}`;
  if (code === "TOTP_REQUIRED") {
    return new HumanAuthenticationError("mfa-required", code, "Enter the verification code from your authenticator app.", status);
  }
  if (code === "TOTP_INVALID") {
    return new HumanAuthenticationError("invalid-totp", code, "The verification code was not accepted. Try again.", status);
  }
  if (code === "INVALID_CREDENTIALS") {
    return new HumanAuthenticationError("invalid-credentials", code, "The username or password was not accepted.", status);
  }
  if (code === "SESSION_EXPIRED") {
    return new HumanAuthenticationError("session-expired", code, "Your session expired. Sign in again.", status);
  }
  if (code === "SESSION_REVOKED") {
    return new HumanAuthenticationError("session-revoked", code, "Your session is no longer active. Sign in again.", status);
  }
  if (code === "CSRF_VALIDATION_FAILED" || code === "CSRF_TOKEN_UNAVAILABLE") {
    return new HumanAuthenticationError("csrf", code, "The secure session request could not be completed. Refresh and try again.", status);
  }
  if (status === 401) {
    return new HumanAuthenticationError("authentication-required", code, "Sign in to continue.", status);
  }
  if (status === 403) {
    return new HumanAuthenticationError("permission-denied", code, "This account cannot access the requested Management Platform session.", status);
  }
  if (status === 429) {
    return new HumanAuthenticationError("throttled", code, "Too many attempts were received. Wait and try again.", status, true);
  }
  if (status === 502 || status === 503 || status === 504) {
    return new HumanAuthenticationError("unavailable", code, "Sign-in services are temporarily unavailable. Try again.", status, true);
  }
  return new HumanAuthenticationError("unknown", code, "The authentication request failed safely.", status, response.retryable);
}

function emptySuccessResponse(): HumanAuthenticationResponse {
  return {
    outcome: "SUCCEEDED",
    authenticated: false,
    session: null,
    aptSessionToken: null,
    errorCode: null,
    retryable: false,
    correlationId: ""
  };
}

function earlierDate(left: string, right: string): string {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) {
    return right;
  }
  if (!Number.isFinite(rightTime)) {
    return left;
  }
  return leftTime <= rightTime ? left : right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
