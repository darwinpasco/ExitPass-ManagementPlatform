export type LoadStatus = "idle" | "loading" | "loaded" | "error";

export interface ManagementPlatformPrincipal {
  authenticated: boolean;
  subjectRef?: string;
  username?: string;
  displayName?: string;
  audience?: string;
  privilegedAccount?: boolean;
  mfaRequired?: boolean;
  mfaSatisfied?: boolean;
  passwordChangeRequired?: boolean;
  sessionExpiresAt?: string;
  permissions: string[];
  authorizedSites: ManagementPlatformSite[];
  authorizedSiteReferences?: string[];
  authorizedSiteGroupReferences?: string[];
  hasGlobalScope?: boolean;
}

export interface ManagementPlatformAuthState {
  status: "loading" | "unauthenticated" | "authenticated" | "error";
  principal?: ManagementPlatformPrincipal;
  message?: string;
}

export interface ManagementPlatformSite {
  siteId: string;
  siteGroupId?: string;
  siteGroupDisplayName?: string;
  sitePosServerId?: string;
  displayName: string;
}

export interface ManagementPlatformConfig {
  appBasePath: string;
  centralPmsApiBasePath: string;
  environmentName: string;
  featureFlags: Record<string, boolean>;
}

export type ManagementPlatformErrorKind =
  | "validation"
  | "authentication-required"
  | "permission-denied"
  | "site-scope-denied"
  | "not-found"
  | "conflict"
  | "throttled"
  | "integration-unavailable"
  | "timeout"
  | "mutation-uncertain"
  | "malformed-response"
  | "feature-disabled"
  | "unknown";

export interface ManagementPlatformUiError {
  kind: ManagementPlatformErrorKind;
  code: string;
  message: string;
  correlationId?: string;
  httpStatus?: number;
  retryable: boolean;
  mutationUncertain: boolean;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  correlationId?: string;
}

export interface CentralPmsApiClient {
  request<TResponse>(path: string, options?: ApiRequestOptions): Promise<TResponse>;
}
