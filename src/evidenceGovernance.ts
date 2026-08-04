import { createUiError } from "./apiClient";
import type { CentralPmsApiClient, ManagementPlatformUiError } from "./types";

export const evidenceGovernanceRoute = "/management-platform/statutory-evidence-governance";
export const evidenceGovernanceApiRoute = "/v1/ops/management-platform/statutory-discounts/evidence-governance";
export const evidenceGovernancePermission = "statutory-discounts.evidence-governance.view";
export const evidenceGovernanceNamedPolicy = "StatutoryEvidenceGovernanceView";
export const evidenceGovernanceContractVersion = "management-platform-statutory-evidence-governance:v1";

export const governanceStatuses = [
  "CONFIGURED_READY",
  "CONFIGURED_PARTIALLY_READY",
  "CONFIGURATION_INCOMPLETE",
  "CAPTURE_DISABLED",
  "CONFIGURATION_UNAVAILABLE",
  "UNKNOWN"
] as const;

export const capabilityStatuses = [
  "READY",
  "PARTIALLY_READY",
  "NOT_CONFIGURED",
  "DISABLED",
  "NOT_IMPLEMENTED",
  "UNAVAILABLE",
  "STALE",
  "UNKNOWN"
] as const;

export type EvidenceGovernanceScopeType = "ALL" | "SITE" | "SITE_GROUP";
export type EvidenceGovernanceEntitlementFilter = "ALL" | "SENIOR_CITIZEN" | "PWD";
export type EvidenceGovernanceFreshnessFilter = "ALL" | "FRESH" | "STALE";
export type EvidenceGovernanceCaptureFilter = "ALL" | "ENABLED" | "DISABLED";

export interface EvidenceGovernanceRequest {
  scopeType: EvidenceGovernanceScopeType;
  scopeReference?: string;
  entitlementType?: Exclude<EvidenceGovernanceEntitlementFilter, "ALL">;
  governanceStatus?: string;
  readinessStatus?: string;
  captureEnabled?: boolean;
  includeStale: boolean;
}

export interface EvidenceGovernanceResponse {
  contractVersion: string;
  requestedScopeType?: string | null;
  requestedScopeReference?: string | null;
  correlationId: string;
  evaluationTimestamp: string;
  freshnessStatus: string;
  stale: boolean;
  sites: EvidenceGovernanceSite[];
  warnings: string[];
  blockers: string[];
}

export interface EvidenceGovernanceSite {
  siteReference: string;
  siteDisplayName?: string | null;
  siteGroupReference: string;
  siteGroupDisplayName?: string | null;
  entitlementTypesSupported: string[];
  governanceStatus: string;
  readinessStatus: string;
  evidenceCaptureConfigured: boolean;
  evidenceCaptureEnabled: boolean;
  requiredDocumentProfiles: EvidenceGovernanceDocumentProfile[];
  allowedMediaTypes: string[];
  maximumUploadSizeBytes?: number | null;
  uploadAuthorizationTtlSeconds?: number | null;
  uploadAuthorizationReadiness: string;
  uploadFinalizationReadiness: string;
  protectedStorageProviderClassification: string;
  protectedStorageReadiness: string;
  storagePrivateAccessPosture: string;
  serverSideEncryptionPosture: string;
  checksumVerificationReadiness: string;
  providerMetadataVerificationReadiness: string;
  uploadLifecycleReadiness: string;
  validationLifecycleReadiness: string;
  malwareScanLifecycleReadiness: string;
  reviewabilityLifecycleReadiness: string;
  bindingLifecycleReadiness: string;
  holdLifecycleReadiness: string;
  deletionRequestLifecycleReadiness: string;
  malwareScanningExecutionReadiness: string;
  securePreviewReadiness: string;
  retentionPolicyReadiness: string;
  retentionWorkerReadiness: string;
  deletionWorkerReadiness: string;
  objectReconciliationReadiness: string;
  lastEvaluatedAt: string;
  configurationUpdatedAt?: string | null;
  freshnessStatus: string;
  stale: boolean;
  retryable: boolean;
  supportReference: string;
  warnings: string[];
  blockers: string[];
}

export interface EvidenceGovernanceDocumentProfile {
  profileCode: string;
  profileVersion: string;
  retentionClassCode: string;
  retentionPolicyVersion: string;
  retentionPolicyStatus: string;
  retentionPolicyApproved: boolean;
}

export interface EvidenceGovernanceClient {
  getGovernance(request: EvidenceGovernanceRequest, signal?: AbortSignal): Promise<EvidenceGovernanceResponse>;
}

export type EvidenceGovernanceScenarioName =
  | "ready"
  | "partially-ready"
  | "incomplete"
  | "capture-disabled"
  | "configuration-unavailable"
  | "stale"
  | "unknown"
  | "empty-scope"
  | "permission-denied"
  | "site-denied"
  | "site-group-denied"
  | "malformed"
  | "unavailable"
  | "transient-failure";

export interface EvidenceGovernanceScenario {
  name: EvidenceGovernanceScenarioName;
  client: EvidenceGovernanceClient;
}

const warningSummaries: Record<string, string> = {
  CAPTURE_DISABLED: "Evidence capture is disabled for this Site.",
  UPLOAD_PROFILE_INCOMPLETE: "The governed upload profile is incomplete.",
  MAXIMUM_SIZE_NOT_CONFIGURED: "A maximum upload size is not configured.",
  ALLOWED_MEDIA_NOT_CONFIGURED: "Allowed media types are not configured.",
  UPLOAD_TTL_INVALID: "The upload authorization lifetime is invalid.",
  PROTECTED_STORAGE_NOT_CONFIGURED: "Protected storage is not configured.",
  STORAGE_PRIVACY_UNVERIFIED: "Private storage access has not been verified.",
  ENCRYPTION_POSTURE_UNKNOWN: "The server-side encryption posture is unknown.",
  CHECKSUM_CONFIGURATION_INCOMPLETE: "Checksum verification configuration is incomplete.",
  RETENTION_POLICY_UNAVAILABLE: "The retention policy is unavailable.",
  MALWARE_SCANNING_NOT_IMPLEMENTED: "Malware scanning execution is not implemented.",
  SECURE_PREVIEW_NOT_IMPLEMENTED: "Secure preview is not implemented.",
  RETENTION_WORKER_NOT_IMPLEMENTED: "The retention worker is not implemented.",
  DELETION_WORKER_NOT_IMPLEMENTED: "The deletion worker is not implemented.",
  OBJECT_RECONCILIATION_NOT_IMPLEMENTED: "Object reconciliation is not implemented.",
  CONFIGURATION_STALE: "The authoritative configuration is stale.",
  EMPTY_AUTHORIZED_SCOPE: "No evidence-governance Sites are available in the authorized scope."
};

const forbiddenResponseKeys = new Set([
  "evidencesetreference",
  "evidenceitemreference",
  "statutoryrequestreference",
  "statutorydecisionreference",
  "statutorydiscountdecisioncommandid",
  "customeridentity",
  "statutoryid",
  "idissuer",
  "signedurl",
  "uploadurl",
  "previewurl",
  "downloadurl",
  "objectkey",
  "checksum",
  "checksumvalue",
  "bucketname",
  "containername",
  "storageendpoint",
  "providercredential",
  "providersecret",
  "revieweridentity",
  "reviewernotes",
  "platenumber",
  "ticketnumber",
  "parkingsessionreference",
  "paymentreference",
  "payablebasis"
]);

export function createEvidenceGovernanceClient(apiClient: CentralPmsApiClient): EvidenceGovernanceClient {
  return {
    async getGovernance(request, signal) {
      const path = evidenceGovernanceRequestPath(request);
      const response = await apiClient.request<unknown>(path, { signal });
      return assertEvidenceGovernanceResponse(response);
    }
  };
}

export function evidenceGovernanceRequestPath(request: EvidenceGovernanceRequest): string {
  let path = evidenceGovernanceApiRoute;
  if (request.scopeType !== "ALL") {
    const reference = request.scopeReference?.trim();
    if (!reference) {
      throw createUiError("validation", "MANAGEMENT_PLATFORM_EVIDENCE_GOVERNANCE_SCOPE_REQUIRED", "Select an authorized Site or Site Group before loading evidence governance.");
    }

    path += request.scopeType === "SITE"
      ? `/sites/${encodeURIComponent(reference)}`
      : `/site-groups/${encodeURIComponent(reference)}`;
  }

  const params = new URLSearchParams();
  if (request.entitlementType) {
    params.set("entitlementType", request.entitlementType);
  }
  if (request.governanceStatus) {
    params.set("governanceStatus", request.governanceStatus);
  }
  if (request.readinessStatus) {
    params.set("readinessStatus", request.readinessStatus);
  }
  if (request.captureEnabled !== undefined) {
    params.set("captureEnabled", String(request.captureEnabled));
  }
  params.set("includeStale", String(request.includeStale));

  return `${path}?${params.toString()}`;
}

export function resolveEvidenceGovernanceScenario(isDevelopment: boolean, search: string): EvidenceGovernanceScenario | undefined {
  if (!isDevelopment) {
    return undefined;
  }

  const name = normalizeScenarioName(new URLSearchParams(search).get("mpEvidenceGovernanceScenario"));
  return name ? { name, client: createScenarioClient(name) } : undefined;
}

export function governanceStatusLabel(value: string): string {
  switch (value) {
    case "CONFIGURED_READY": return "Configured and ready";
    case "CONFIGURED_PARTIALLY_READY": return "Configured, partially ready";
    case "CONFIGURATION_INCOMPLETE": return "Configuration incomplete";
    case "CAPTURE_DISABLED": return "Capture disabled";
    case "CONFIGURATION_UNAVAILABLE": return "Configuration unavailable";
    case "UNKNOWN": return "Unknown";
    default: return `Unsupported classification: ${safeControlledCode(value)}`;
  }
}

export function capabilityStatusLabel(value: string): string {
  switch (value) {
    case "READY": return "Ready";
    case "PARTIALLY_READY": return "Partially ready";
    case "NOT_CONFIGURED": return "Not configured";
    case "DISABLED": return "Disabled";
    case "NOT_IMPLEMENTED": return "Not implemented";
    case "UNAVAILABLE": return "Unavailable";
    case "STALE": return "Stale";
    case "UNKNOWN": return "Unknown";
    default: return `Unsupported classification: ${safeControlledCode(value)}`;
  }
}

export function entitlementLabel(value: string): string {
  return value === "SENIOR_CITIZEN" ? "Senior Citizen" : value === "PWD" ? "PWD" : safeControlledCode(value);
}

export function warningSummary(code: string): string {
  return warningSummaries[code] ?? "Central PMS returned an unrecognized controlled governance code.";
}

export function safeControlledCode(code: string): string {
  return /^[A-Z0-9_:-]{1,96}$/.test(code) ? code : "UNSUPPORTED_CODE";
}

export function isKnownGovernanceStatus(value: string): boolean {
  return governanceStatuses.includes(value as (typeof governanceStatuses)[number]);
}

export function isKnownCapabilityStatus(value: string): boolean {
  return capabilityStatuses.includes(value as (typeof capabilityStatuses)[number]);
}

export function isEvidenceGovernanceRetryable(error: ManagementPlatformUiError): boolean {
  return error.retryable && (error.kind === "integration-unavailable" || error.kind === "timeout");
}

export function toSafeEvidenceGovernanceError(error: unknown): ManagementPlatformUiError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const uiError = error as ManagementPlatformUiError;
    switch (uiError.code) {
      case "SITE_SCOPE_DENIED":
        return { ...uiError, kind: "site-scope-denied", message: "The requested Site is outside your authorized evidence-governance scope." };
      case "SITE_GROUP_SCOPE_DENIED":
        return { ...uiError, kind: "site-scope-denied", message: "The requested Site Group is outside your authorized evidence-governance scope." };
      case "SCOPE_DENIED":
        return { ...uiError, kind: "site-scope-denied", message: "The requested scope is outside your authorized evidence-governance access." };
      case "MALFORMED_CANONICAL_CONFIGURATION":
        return { ...uiError, kind: "malformed-response", message: "Central PMS could not provide a valid statutory evidence-governance configuration." };
      case "INVALID_FILTER":
        return { ...uiError, kind: "validation", message: "The selected evidence-governance filters are invalid." };
      default:
        return uiError;
    }
  }

  return createUiError("unknown", "MANAGEMENT_PLATFORM_EVIDENCE_GOVERNANCE_UNKNOWN", "Statutory evidence governance could not be loaded safely.");
}

export function matchesEvidenceGovernanceSearch(site: EvidenceGovernanceSite, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    site.siteDisplayName,
    site.siteGroupDisplayName,
    ...site.entitlementTypesSupported,
    site.governanceStatus,
    site.readinessStatus,
    site.protectedStorageProviderClassification,
    ...site.requiredDocumentProfiles.flatMap((profile) => [profile.profileCode, profile.profileVersion, profile.retentionClassCode, profile.retentionPolicyVersion]),
    ...site.warnings,
    ...site.blockers
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}

function assertEvidenceGovernanceResponse(value: unknown): EvidenceGovernanceResponse {
  assertNoForbiddenFields(value);
  const record = requireRecord(value);
  const contractVersion = requireString(record, "contractVersion");
  if (contractVersion !== evidenceGovernanceContractVersion) {
    throw malformedResponse("The statutory evidence-governance contract version is unsupported.");
  }

  return {
    contractVersion,
    requestedScopeType: optionalString(record, "requestedScopeType"),
    requestedScopeReference: optionalString(record, "requestedScopeReference"),
    correlationId: requireString(record, "correlationId"),
    evaluationTimestamp: requireString(record, "evaluationTimestamp"),
    freshnessStatus: requireString(record, "freshnessStatus"),
    stale: requireBoolean(record, "stale"),
    sites: requireArray(record, "sites").map(assertSite),
    warnings: requireStringArray(record, "warnings"),
    blockers: requireStringArray(record, "blockers")
  };
}

function assertSite(value: unknown): EvidenceGovernanceSite {
  const record = requireRecord(value);
  return {
    siteReference: requireString(record, "siteReference"),
    siteDisplayName: optionalString(record, "siteDisplayName"),
    siteGroupReference: requireString(record, "siteGroupReference"),
    siteGroupDisplayName: optionalString(record, "siteGroupDisplayName"),
    entitlementTypesSupported: requireStringArray(record, "entitlementTypesSupported"),
    governanceStatus: requireString(record, "governanceStatus"),
    readinessStatus: requireString(record, "readinessStatus"),
    evidenceCaptureConfigured: requireBoolean(record, "evidenceCaptureConfigured"),
    evidenceCaptureEnabled: requireBoolean(record, "evidenceCaptureEnabled"),
    requiredDocumentProfiles: requireArray(record, "requiredDocumentProfiles").map(assertDocumentProfile),
    allowedMediaTypes: requireStringArray(record, "allowedMediaTypes"),
    maximumUploadSizeBytes: optionalNumber(record, "maximumUploadSizeBytes"),
    uploadAuthorizationTtlSeconds: optionalNumber(record, "uploadAuthorizationTtlSeconds"),
    uploadAuthorizationReadiness: requireString(record, "uploadAuthorizationReadiness"),
    uploadFinalizationReadiness: requireString(record, "uploadFinalizationReadiness"),
    protectedStorageProviderClassification: requireString(record, "protectedStorageProviderClassification"),
    protectedStorageReadiness: requireString(record, "protectedStorageReadiness"),
    storagePrivateAccessPosture: requireString(record, "storagePrivateAccessPosture"),
    serverSideEncryptionPosture: requireString(record, "serverSideEncryptionPosture"),
    checksumVerificationReadiness: requireString(record, "checksumVerificationReadiness"),
    providerMetadataVerificationReadiness: requireString(record, "providerMetadataVerificationReadiness"),
    uploadLifecycleReadiness: requireString(record, "uploadLifecycleReadiness"),
    validationLifecycleReadiness: requireString(record, "validationLifecycleReadiness"),
    malwareScanLifecycleReadiness: requireString(record, "malwareScanLifecycleReadiness"),
    reviewabilityLifecycleReadiness: requireString(record, "reviewabilityLifecycleReadiness"),
    bindingLifecycleReadiness: requireString(record, "bindingLifecycleReadiness"),
    holdLifecycleReadiness: requireString(record, "holdLifecycleReadiness"),
    deletionRequestLifecycleReadiness: requireString(record, "deletionRequestLifecycleReadiness"),
    malwareScanningExecutionReadiness: requireString(record, "malwareScanningExecutionReadiness"),
    securePreviewReadiness: requireString(record, "securePreviewReadiness"),
    retentionPolicyReadiness: requireString(record, "retentionPolicyReadiness"),
    retentionWorkerReadiness: requireString(record, "retentionWorkerReadiness"),
    deletionWorkerReadiness: requireString(record, "deletionWorkerReadiness"),
    objectReconciliationReadiness: requireString(record, "objectReconciliationReadiness"),
    lastEvaluatedAt: requireString(record, "lastEvaluatedAt"),
    configurationUpdatedAt: optionalString(record, "configurationUpdatedAt"),
    freshnessStatus: requireString(record, "freshnessStatus"),
    stale: requireBoolean(record, "stale"),
    retryable: requireBoolean(record, "retryable"),
    supportReference: requireString(record, "supportReference"),
    warnings: requireStringArray(record, "warnings"),
    blockers: requireStringArray(record, "blockers")
  };
}

function assertDocumentProfile(value: unknown): EvidenceGovernanceDocumentProfile {
  const record = requireRecord(value);
  return {
    profileCode: requireString(record, "profileCode"),
    profileVersion: requireString(record, "profileVersion"),
    retentionClassCode: requireString(record, "retentionClassCode"),
    retentionPolicyVersion: requireString(record, "retentionPolicyVersion"),
    retentionPolicyStatus: requireString(record, "retentionPolicyStatus"),
    retentionPolicyApproved: requireBoolean(record, "retentionPolicyApproved")
  };
}

function assertNoForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenFields);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenResponseKeys.has(key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase())) {
      throw malformedResponse("The statutory evidence-governance response contained an unsupported field.");
    }
    assertNoForbiddenFields(nested);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw malformedResponse();
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw malformedResponse();
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== "string") {
    throw malformedResponse();
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  if (typeof record[key] !== "boolean") {
    throw malformedResponse();
  }
  return record[key];
}

function optionalNumber(record: Record<string, unknown>, key: string): number | null | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw malformedResponse();
  }
  return value;
}

function requireArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw malformedResponse();
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string): string[] {
  const values = requireArray(record, key);
  if (!values.every((value) => typeof value === "string")) {
    throw malformedResponse();
  }
  return values as string[];
}

function malformedResponse(message = "The statutory evidence-governance response could not be read safely."): ManagementPlatformUiError {
  return createUiError("malformed-response", "MANAGEMENT_PLATFORM_EVIDENCE_GOVERNANCE_MALFORMED", message);
}

function createScenarioClient(scenario: EvidenceGovernanceScenarioName): EvidenceGovernanceClient {
  return {
    async getGovernance(request) {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      if (scenario === "permission-denied") {
        throw createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "You do not have permission for this Management Platform action.", "H004-PERMISSION-DENIED", 403);
      }
      if (scenario === "site-denied") {
        throw createUiError("permission-denied", "SITE_SCOPE_DENIED", "Scope denied.", "H004-SITE-DENIED", 403);
      }
      if (scenario === "site-group-denied") {
        throw createUiError("permission-denied", "SITE_GROUP_SCOPE_DENIED", "Scope denied.", "H004-SITE-GROUP-DENIED", 403);
      }
      if (scenario === "malformed") {
        throw malformedResponse();
      }
      if (scenario === "unavailable") {
        throw createUiError("integration-unavailable", "CONFIGURATION_UNAVAILABLE", "Central PMS or its downstream administration boundary is unavailable.", "H004-UNAVAILABLE", 503, true);
      }
      if (scenario === "transient-failure") {
        throw createUiError("integration-unavailable", "TRANSIENT_DATABASE_FAILURE", "Central PMS or its downstream administration boundary is unavailable.", "H004-TRANSIENT", 503, true);
      }

      let response = scenarioResponse(scenario);
      response = applyScenarioRequest(response, request);
      return response;
    }
  };
}

function scenarioResponse(scenario: EvidenceGovernanceScenarioName): EvidenceGovernanceResponse {
  const alpha = fixtureSite();
  let sites: EvidenceGovernanceSite[] = [alpha, fixtureSite({
    siteReference: "71000000-0000-0000-0000-000000000102",
    siteDisplayName: "Development Site Beta",
    governanceStatus: "CONFIGURED_PARTIALLY_READY",
    readinessStatus: "PARTIALLY_READY",
    malwareScanningExecutionReadiness: "NOT_IMPLEMENTED",
    securePreviewReadiness: "NOT_IMPLEMENTED",
    retentionWorkerReadiness: "NOT_IMPLEMENTED",
    deletionWorkerReadiness: "NOT_IMPLEMENTED",
    objectReconciliationReadiness: "NOT_IMPLEMENTED",
    warnings: ["MALWARE_SCANNING_NOT_IMPLEMENTED", "SECURE_PREVIEW_NOT_IMPLEMENTED", "RETENTION_WORKER_NOT_IMPLEMENTED", "DELETION_WORKER_NOT_IMPLEMENTED", "OBJECT_RECONCILIATION_NOT_IMPLEMENTED"]
  })];

  if (scenario === "partially-ready") {
    sites = [sites[1]];
  } else if (scenario === "incomplete") {
    sites = [fixtureSite({
      governanceStatus: "CONFIGURATION_INCOMPLETE",
      readinessStatus: "NOT_CONFIGURED",
      uploadAuthorizationReadiness: "NOT_CONFIGURED",
      protectedStorageReadiness: "NOT_CONFIGURED",
      maximumUploadSizeBytes: null,
      blockers: ["UPLOAD_PROFILE_INCOMPLETE"],
      warnings: ["MAXIMUM_SIZE_NOT_CONFIGURED"]
    })];
  } else if (scenario === "capture-disabled") {
    sites = [fixtureSite({ governanceStatus: "CAPTURE_DISABLED", readinessStatus: "DISABLED", evidenceCaptureEnabled: false, warnings: ["CAPTURE_DISABLED"] })];
  } else if (scenario === "configuration-unavailable") {
    sites = [fixtureSite({ governanceStatus: "CONFIGURATION_UNAVAILABLE", readinessStatus: "UNAVAILABLE", protectedStorageReadiness: "UNAVAILABLE", retryable: true, blockers: ["PROTECTED_STORAGE_NOT_CONFIGURED"] })];
  } else if (scenario === "stale") {
    sites = [fixtureSite({ freshnessStatus: "STALE", stale: true, readinessStatus: "STALE", retryable: true, warnings: ["CONFIGURATION_STALE"] })];
  } else if (scenario === "unknown") {
    sites = [fixtureSite({ governanceStatus: "UNKNOWN", readinessStatus: "UNKNOWN", protectedStorageReadiness: "UNKNOWN" })];
  } else if (scenario === "empty-scope") {
    sites = [];
  }

  return {
    contractVersion: evidenceGovernanceContractVersion,
    requestedScopeType: null,
    requestedScopeReference: null,
    correlationId: "91400000-0000-0000-0000-000000000301",
    evaluationTimestamp: "2026-08-04T08:00:00Z",
    freshnessStatus: scenario === "stale" ? "STALE" : "FRESH",
    stale: scenario === "stale",
    sites,
    warnings: scenario === "empty-scope" ? ["EMPTY_AUTHORIZED_SCOPE"] : [],
    blockers: []
  };
}

function fixtureSite(overrides: Partial<EvidenceGovernanceSite> = {}): EvidenceGovernanceSite {
  return {
    siteReference: "71000000-0000-0000-0000-000000000101",
    siteDisplayName: "Development Site Alpha",
    siteGroupReference: "71000000-0000-0000-0000-000000000900",
    siteGroupDisplayName: "Development Site Group",
    entitlementTypesSupported: ["SENIOR_CITIZEN", "PWD"],
    governanceStatus: "CONFIGURED_READY",
    readinessStatus: "READY",
    evidenceCaptureConfigured: true,
    evidenceCaptureEnabled: true,
    requiredDocumentProfiles: [{ profileCode: "STATUTORY_ID", profileVersion: "v1", retentionClassCode: "STATUTORY_EVIDENCE_STANDARD", retentionPolicyVersion: "v1", retentionPolicyStatus: "APPROVED_ENABLED", retentionPolicyApproved: true }],
    allowedMediaTypes: ["image/jpeg", "image/png"],
    maximumUploadSizeBytes: 5_242_880,
    uploadAuthorizationTtlSeconds: 300,
    uploadAuthorizationReadiness: "READY",
    uploadFinalizationReadiness: "READY",
    protectedStorageProviderClassification: "S3_COMPATIBLE",
    protectedStorageReadiness: "READY",
    storagePrivateAccessPosture: "PRIVATE_ACCESS_REQUIRED",
    serverSideEncryptionPosture: "REQUIRED_VERIFIED",
    checksumVerificationReadiness: "READY",
    providerMetadataVerificationReadiness: "READY",
    uploadLifecycleReadiness: "READY",
    validationLifecycleReadiness: "READY",
    malwareScanLifecycleReadiness: "READY",
    reviewabilityLifecycleReadiness: "READY",
    bindingLifecycleReadiness: "READY",
    holdLifecycleReadiness: "READY",
    deletionRequestLifecycleReadiness: "READY",
    malwareScanningExecutionReadiness: "READY",
    securePreviewReadiness: "READY",
    retentionPolicyReadiness: "READY",
    retentionWorkerReadiness: "READY",
    deletionWorkerReadiness: "READY",
    objectReconciliationReadiness: "READY",
    lastEvaluatedAt: "2026-08-04T08:00:00Z",
    configurationUpdatedAt: "2026-08-04T07:55:00Z",
    freshnessStatus: "FRESH",
    stale: false,
    retryable: false,
    supportReference: "I014-H004-SYNTHETIC-SUPPORT",
    warnings: [],
    blockers: [],
    ...overrides
  };
}

function applyScenarioRequest(response: EvidenceGovernanceResponse, request: EvidenceGovernanceRequest): EvidenceGovernanceResponse {
  let sites = response.sites;
  if (request.scopeType === "SITE" && request.scopeReference) {
    sites = sites.filter((site) => site.siteReference === request.scopeReference);
  } else if (request.scopeType === "SITE_GROUP" && request.scopeReference) {
    sites = sites.filter((site) => site.siteGroupReference === request.scopeReference);
  }
  if (request.entitlementType) {
    sites = sites.filter((site) => site.entitlementTypesSupported.includes(request.entitlementType!));
  }
  if (request.governanceStatus) {
    sites = sites.filter((site) => site.governanceStatus === request.governanceStatus);
  }
  if (request.readinessStatus) {
    sites = sites.filter((site) => site.readinessStatus === request.readinessStatus);
  }
  if (request.captureEnabled !== undefined) {
    sites = sites.filter((site) => site.evidenceCaptureEnabled === request.captureEnabled);
  }
  if (!request.includeStale) {
    sites = sites.filter((site) => !site.stale);
  }
  return { ...response, requestedScopeType: request.scopeType === "ALL" ? null : request.scopeType, requestedScopeReference: request.scopeReference ?? null, sites };
}

function normalizeScenarioName(value: string | null): EvidenceGovernanceScenarioName | undefined {
  switch (value) {
    case "ready":
    case "partially-ready":
    case "incomplete":
    case "capture-disabled":
    case "configuration-unavailable":
    case "stale":
    case "unknown":
    case "empty-scope":
    case "permission-denied":
    case "site-denied":
    case "site-group-denied":
    case "malformed":
    case "unavailable":
    case "transient-failure":
      return value;
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
