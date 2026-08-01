import { createUiError } from "./apiClient";
import type { CentralPmsApiClient, ManagementPlatformSite, ManagementPlatformUiError } from "./types";

export const policyCoverageRoute = "/management-platform/statutory-policy-coverage";
export const policyCoverageApiRoute = "/v1/ops/management-platform/statutory-discounts/policy-coverage";
export const policyCoverageNamedPolicy = "ManagementPlatformStatutoryDiscountPolicyCoverageRead";

export const policyCoverageReadPermission = "statutory-discount-policy.view";

export type PolicyCoverageScopeType = "SITE" | "SITE_GROUP";
export type PolicyCoverageEntitlementFilter = "ALL" | "SENIOR_CITIZEN" | "PWD";

export interface PolicyCoverageRequest {
  scopeType: PolicyCoverageScopeType;
  scopeId: string;
  entitlementType?: Exclude<PolicyCoverageEntitlementFilter, "ALL">;
  includeInactive: boolean;
}

export interface PolicyCoverageResponse {
  requestedScopeType: string;
  requestedScopeReference: string;
  resolvedScopeType: string;
  resolvedScopeReference: string;
  scopeDisplayName?: string | null;
  correlationId: string;
  evaluationTimestamp: string;
  coverageRows: PolicyCoverageRow[];
}

export interface PolicyCoverageRow {
  siteReference: string;
  siteDisplayName?: string | null;
  entitlementType: string;
  coverageClassification: string;
  policyStatusClassification: string;
  authoritativeCoverageAvailable: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  policyReference?: string | null;
  ordinanceOrLegalAuthorityReference?: string | null;
  jurisdictionOrLocalityReference?: string | null;
  policyVersionOrRevisionReference?: string | null;
  lastAuthoritativeUpdateTimestamp?: string | null;
  dataQualityClassification: string;
  reasonClassification: string;
  sourceClassification: string;
}

export interface PolicyCoverageClient {
  getCoverage(request: PolicyCoverageRequest, signal?: AbortSignal): Promise<PolicyCoverageResponse>;
}

export type PolicyCoverageScenarioName =
  | "site-group-covered"
  | "site-covered"
  | "mixed"
  | "senior-citizen"
  | "pwd"
  | "no-coverage"
  | "empty"
  | "scope-denied"
  | "scope-not-found"
  | "source-unavailable"
  | "timeout"
  | "malformed-response"
  | "malformed-authoritative"
  | "unexpected-failure"
  | "ambiguous-scope";

export interface PolicyCoverageScenario {
  name: PolicyCoverageScenarioName;
  client: PolicyCoverageClient;
}

const knownClassifications = new Set([
  "ACTIVE_COVERED",
  "FUTURE_EFFECTIVE",
  "EXPIRED",
  "INACTIVE",
  "INCOMPLETE_CONFIGURATION",
  "NO_APPLICABLE_ORDINANCE",
  "NO_APPLICABLE_POLICY",
  "ENTITLEMENT_NOT_COVERED",
  "AUTHORITATIVE_SOURCE_UNAVAILABLE",
  "MALFORMED_AUTHORITATIVE_RECORD"
]);

export function createPolicyCoverageClient(apiClient: CentralPmsApiClient): PolicyCoverageClient {
  return {
    async getCoverage(request, signal) {
      const params = new URLSearchParams({
        scopeType: request.scopeType,
        scopeId: request.scopeId,
        includeInactive: String(request.includeInactive)
      });

      if (request.entitlementType) {
        params.set("entitlementType", request.entitlementType);
      }

      const response = await apiClient.request<unknown>(`${policyCoverageApiRoute}?${params.toString()}`, { signal });
      return assertPolicyCoverageResponse(response);
    }
  };
}

export function resolvePolicyCoverageScenario(isDevelopment: boolean, search: string): PolicyCoverageScenario | undefined {
  if (!isDevelopment) {
    return undefined;
  }

  const scenarioName = normalizeScenarioName(new URLSearchParams(search).get("mpPolicyCoverageScenario"));
  if (!scenarioName) {
    return undefined;
  }

  return { name: scenarioName, client: createScenarioClient(scenarioName) };
}

export function policyCoverageSiteGroups(sites: readonly ManagementPlatformSite[]): Array<{ siteGroupId: string; displayName: string }> {
  const groups = new Map<string, string>();
  for (const site of sites) {
    if (site.siteGroupId) {
      groups.set(site.siteGroupId, site.siteGroupDisplayName?.trim() || "Authorized Site Group");
    }
  }

  return Array.from(groups.entries())
    .map(([siteGroupId, displayName]) => ({ siteGroupId, displayName }))
    .sort((first, second) => first.displayName.localeCompare(second.displayName));
}

export function coverageStatusLabel(classification: string): string {
  switch (classification) {
    case "ACTIVE_COVERED":
      return "Active covered";
    case "FUTURE_EFFECTIVE":
      return "Future effective";
    case "EXPIRED":
      return "Expired";
    case "INACTIVE":
      return "Inactive";
    case "INCOMPLETE_CONFIGURATION":
      return "Incomplete configuration";
    case "NO_APPLICABLE_ORDINANCE":
      return "No applicable ordinance";
    case "NO_APPLICABLE_POLICY":
      return "No applicable policy";
    case "ENTITLEMENT_NOT_COVERED":
      return "Entitlement not covered";
    case "AUTHORITATIVE_SOURCE_UNAVAILABLE":
      return "Authoritative source unavailable";
    case "MALFORMED_AUTHORITATIVE_RECORD":
      return "Malformed authoritative record";
    default:
      return `Unsupported classification: ${classification || "UNKNOWN"}`;
  }
}

export function entitlementLabel(value: string): string {
  switch (value) {
    case "SENIOR_CITIZEN":
      return "Senior Citizen";
    case "PWD":
      return "PWD";
    default:
      return value || "Unknown entitlement";
  }
}

export function isKnownCoverageClassification(value: string): boolean {
  return knownClassifications.has(value);
}

export function isCoverageRetryable(error: ManagementPlatformUiError): boolean {
  return error.retryable && (error.kind === "integration-unavailable" || error.kind === "timeout");
}

export function toSafePolicyCoverageError(error: unknown): ManagementPlatformUiError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const uiError = error as ManagementPlatformUiError;
    if (uiError.code === "SCOPE_DENIED") {
      return { ...uiError, kind: "site-scope-denied", message: "The requested Site or Site Group is outside your authorized policy coverage scope." };
    }

    if (uiError.code === "MALFORMED_AUTHORITATIVE_DATA") {
      return { ...uiError, kind: "malformed-response", message: "Central PMS reported malformed authoritative policy coverage data." };
    }

    return uiError;
  }

  return createUiError("unknown", "MANAGEMENT_PLATFORM_POLICY_COVERAGE_UNKNOWN", "Statutory policy coverage could not be loaded safely.");
}

function assertPolicyCoverageResponse(value: unknown): PolicyCoverageResponse {
  if (!isRecord(value) ||
    typeof value.requestedScopeType !== "string" ||
    typeof value.requestedScopeReference !== "string" ||
    typeof value.resolvedScopeType !== "string" ||
    typeof value.resolvedScopeReference !== "string" ||
    typeof value.correlationId !== "string" ||
    typeof value.evaluationTimestamp !== "string" ||
    !Array.isArray(value.coverageRows)) {
    throw createUiError("malformed-response", "MANAGEMENT_PLATFORM_POLICY_COVERAGE_MALFORMED", "The statutory policy coverage response could not be read safely.");
  }

  for (const row of value.coverageRows) {
    if (!isRecord(row) ||
      typeof row.siteReference !== "string" ||
      typeof row.entitlementType !== "string" ||
      typeof row.coverageClassification !== "string" ||
      typeof row.policyStatusClassification !== "string" ||
      typeof row.authoritativeCoverageAvailable !== "boolean" ||
      typeof row.dataQualityClassification !== "string" ||
      typeof row.reasonClassification !== "string" ||
      typeof row.sourceClassification !== "string") {
      throw createUiError("malformed-response", "MANAGEMENT_PLATFORM_POLICY_COVERAGE_MALFORMED", "The statutory policy coverage response could not be read safely.");
    }
  }

  return value as unknown as PolicyCoverageResponse;
}

function createScenarioClient(scenario: PolicyCoverageScenarioName): PolicyCoverageClient {
  return {
    async getCoverage(request) {
      await new Promise((resolve) => window.setTimeout(resolve, 5));

      if (scenario === "scope-denied") {
        throw createUiError("site-scope-denied", "SCOPE_DENIED", "The requested Site or Site Group is outside your authorized policy coverage scope.", "dev-policy-scope-denied", 403, false, false);
      }

      if (scenario === "scope-not-found") {
        throw createUiError("not-found", "SCOPE_NOT_FOUND", "The requested Site or Site Group was not found in the governed policy coverage scope.", "dev-policy-scope-not-found", 404, false, false);
      }

      if (scenario === "source-unavailable") {
        throw createUiError("integration-unavailable", "POLICY_SOURCE_UNAVAILABLE", "The statutory policy source is unavailable.", "dev-policy-source-unavailable", 503, true, false);
      }

      if (scenario === "timeout") {
        throw createUiError("timeout", "TRANSIENT_DEPENDENCY_FAILURE", "The statutory policy coverage request timed out.", "dev-policy-timeout", 504, true, false);
      }

      if (scenario === "malformed-response") {
        throw createUiError("malformed-response", "MANAGEMENT_PLATFORM_POLICY_COVERAGE_MALFORMED", "The statutory policy coverage response could not be read safely.", "dev-policy-malformed-response", 200, false, false);
      }

      if (scenario === "unexpected-failure") {
        throw createUiError("unknown", "UNEXPECTED_INTERNAL_FAILURE", "The statutory policy coverage read failed safely.", "dev-policy-unexpected", 500, false, false);
      }

      const response = populatedCoverage(request);
      if (scenario === "empty") {
        return { ...response, coverageRows: [] };
      }

      if (scenario === "senior-citizen") {
        return { ...response, coverageRows: response.coverageRows.filter((row) => row.entitlementType === "SENIOR_CITIZEN") };
      }

      if (scenario === "pwd") {
        return { ...response, coverageRows: response.coverageRows.filter((row) => row.entitlementType === "PWD") };
      }

      if (scenario === "no-coverage") {
        return {
          ...response,
          coverageRows: response.coverageRows.map((row) => ({
            ...row,
            coverageClassification: row.entitlementType === "SENIOR_CITIZEN" ? "NO_APPLICABLE_POLICY" : "ENTITLEMENT_NOT_COVERED",
            policyStatusClassification: "NO_APPLICABLE_POLICY",
            authoritativeCoverageAvailable: false,
            effectiveFrom: null,
            effectiveTo: null,
            policyReference: null,
            ordinanceOrLegalAuthorityReference: null,
            reasonClassification: row.entitlementType === "SENIOR_CITIZEN" ? "NO_APPLICABLE_POLICY" : "ENTITLEMENT_NOT_COVERED"
          }))
        };
      }

      if (scenario === "malformed-authoritative") {
        return {
          ...response,
          coverageRows: response.coverageRows.map((row, index) => index === 0
            ? { ...row, coverageClassification: "MALFORMED_AUTHORITATIVE_RECORD", dataQualityClassification: "MALFORMED_AUTHORITATIVE_RECORD", authoritativeCoverageAvailable: false }
            : row)
        };
      }

      if (scenario === "ambiguous-scope") {
        return {
          ...response,
          coverageRows: response.coverageRows.map((row, index) => index === 0
            ? { ...row, coverageClassification: "AMBIGUOUS_SCOPE", reasonClassification: "AMBIGUOUS_SCOPE", authoritativeCoverageAvailable: false }
            : row)
        };
      }

      if (scenario === "site-covered") {
        return { ...response, requestedScopeType: "SITE", resolvedScopeType: "SITE", scopeDisplayName: "Development Site Alpha" };
      }

      return response;
    }
  };
}

function populatedCoverage(request: PolicyCoverageRequest): PolicyCoverageResponse {
  const siteReference = request.scopeType === "SITE" ? request.scopeId : "71000000-0000-0000-0000-000000000101";
  const scopeDisplayName = request.scopeType === "SITE_GROUP" ? "Development Site Group" : "Development Site Alpha";
  const rows: PolicyCoverageRow[] = [
    {
      siteReference,
      siteDisplayName: "Development Site Alpha",
      entitlementType: "SENIOR_CITIZEN",
      coverageClassification: "ACTIVE_COVERED",
      policyStatusClassification: "ACTIVE",
      authoritativeCoverageAvailable: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      policyReference: "SC-POLICY-2026",
      ordinanceOrLegalAuthorityReference: "SYNTHETIC_LOCAL_AUTHORITY",
      jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
      policyVersionOrRevisionReference: "2026.1",
      lastAuthoritativeUpdateTimestamp: "2026-08-01T00:00:00Z",
      dataQualityClassification: "AUTHORITATIVE",
      reasonClassification: "ACTIVE_COVERED",
      sourceClassification: "LOCAL_DEVELOPMENT_FIXTURE"
    },
    {
      siteReference,
      siteDisplayName: "Development Site Alpha",
      entitlementType: "PWD",
      coverageClassification: "FUTURE_EFFECTIVE",
      policyStatusClassification: "ACTIVE",
      authoritativeCoverageAvailable: true,
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      policyReference: "PWD-POLICY-2026",
      ordinanceOrLegalAuthorityReference: "SYNTHETIC_LOCAL_AUTHORITY",
      jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
      policyVersionOrRevisionReference: "2026.1",
      lastAuthoritativeUpdateTimestamp: "2026-08-01T00:00:00Z",
      dataQualityClassification: "AUTHORITATIVE",
      reasonClassification: "FUTURE_EFFECTIVE",
      sourceClassification: "LOCAL_DEVELOPMENT_FIXTURE"
    },
    {
      siteReference,
      siteDisplayName: "Development Site Alpha",
      entitlementType: "PWD",
      coverageClassification: "EXPIRED",
      policyStatusClassification: "INACTIVE",
      authoritativeCoverageAvailable: false,
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-12-31",
      policyReference: "PWD-EXPIRED-2025",
      ordinanceOrLegalAuthorityReference: "SYNTHETIC_LOCAL_AUTHORITY",
      jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
      policyVersionOrRevisionReference: "2025.1",
      lastAuthoritativeUpdateTimestamp: "2025-12-31T00:00:00Z",
      dataQualityClassification: "AUTHORITATIVE",
      reasonClassification: "EXPIRED",
      sourceClassification: "LOCAL_DEVELOPMENT_FIXTURE"
    },
    {
      siteReference,
      siteDisplayName: "Development Site Alpha",
      entitlementType: "SENIOR_CITIZEN",
      coverageClassification: "INCOMPLETE_CONFIGURATION",
      policyStatusClassification: "ACTIVE",
      authoritativeCoverageAvailable: false,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      policyReference: "SC-INCOMPLETE-2026",
      ordinanceOrLegalAuthorityReference: null,
      jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
      policyVersionOrRevisionReference: "2026.2",
      lastAuthoritativeUpdateTimestamp: "2026-08-01T00:00:00Z",
      dataQualityClassification: "INCOMPLETE_CONFIGURATION",
      reasonClassification: "INCOMPLETE_CONFIGURATION",
      sourceClassification: "LOCAL_DEVELOPMENT_FIXTURE"
    }
  ];

  const filteredRows = request.entitlementType
    ? rows.filter((row) => row.entitlementType === request.entitlementType)
    : rows;

  return {
    requestedScopeType: request.scopeType,
    requestedScopeReference: request.scopeId,
    resolvedScopeType: request.scopeType,
    resolvedScopeReference: request.scopeId,
    scopeDisplayName,
    correlationId: "dev-policy-coverage-correlation",
    evaluationTimestamp: "2026-08-01T00:00:00Z",
    coverageRows: filteredRows
  };
}

function normalizeScenarioName(value: string | null): PolicyCoverageScenarioName | undefined {
  switch (value) {
    case "site-group-covered":
    case "site-covered":
    case "mixed":
    case "senior-citizen":
    case "pwd":
    case "no-coverage":
    case "empty":
    case "scope-denied":
    case "scope-not-found":
    case "source-unavailable":
    case "timeout":
    case "malformed-response":
    case "malformed-authoritative":
    case "unexpected-failure":
    case "ambiguous-scope":
      return value;
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
