import { createUiError } from "./apiClient";
import { fiscalExceptionContractVersion } from "./fiscalExceptionReporting";
import { paymentReconciliationContractVersion } from "./paymentReconciliationReporting";
import type { CentralPmsApiClient, ManagementPlatformUiError } from "./types";

export const dashboardContractVersion = "management-platform-dashboard-reporting:v1";
export const dashboardCatalogRoute = "/v1/management-platform/dashboard/catalog";
export const dashboardOperationalOverviewRoute = "/v1/management-platform/dashboard/operational-overview";

export type DashboardAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type DashboardFreshness = "CURRENT" | "STALE" | "PARTIAL" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type DashboardScopeType = "SITE" | "SITE_GROUP";

export interface DashboardScope {
  scopeType: DashboardScopeType;
  scopeReference: string;
  displayName: string;
}

export interface DashboardMetric {
  metricId: string;
  displayLabel: string;
  value: number;
  unit: string;
}

export interface DashboardOverviewSection {
  sectionId: string;
  displayTitle: string;
  availability: DashboardAvailability;
  freshness: DashboardFreshness;
  sourceAuthority: string;
  dataAsOf?: string;
  metrics: DashboardMetric[];
  warnings: string[];
  limitations: string[];
}

export interface DashboardOperationalOverview {
  contractVersion: typeof dashboardContractVersion;
  reportId: "operational-overview";
  requestedScope: DashboardScope;
  effectiveScope: DashboardScope;
  generatedAt: string;
  dataAsOf?: string;
  availability: DashboardAvailability;
  freshness: DashboardFreshness;
  correlationId: string;
  sections: DashboardOverviewSection[];
  warnings: string[];
  limitations: string[];
}

export interface DashboardCatalogEntry {
  reportId: string;
  contractVersion: typeof dashboardContractVersion | typeof paymentReconciliationContractVersion | typeof fiscalExceptionContractVersion;
  displayTitle: string;
  functionalDomain: string;
  description: string;
  supportedScopeTypes: DashboardScopeType[];
  requiredPermission: string;
  availability: DashboardAvailability;
  sourceAuthority: string;
  privacyClassification: string;
  supportedFilters: string[];
  freshnessSemantics: string;
  warnings: string[];
  limitations: string[];
}

export interface DashboardCatalog {
  contractVersion: typeof dashboardContractVersion;
  generatedAt: string;
  reports: DashboardCatalogEntry[];
}

export interface DashboardReportingClient {
  getCatalog(signal?: AbortSignal): Promise<DashboardCatalog>;
  getOperationalOverview(scope: Pick<DashboardScope, "scopeType" | "scopeReference">, signal?: AbortSignal): Promise<DashboardOperationalOverview>;
}

export function createDashboardReportingClient(apiClient: CentralPmsApiClient): DashboardReportingClient {
  return {
    getCatalog: (signal) => apiClient.request<unknown>(dashboardCatalogRoute, { method: "GET", signal }).then(parseDashboardCatalog),
    getOperationalOverview: (scope, signal) => apiClient.request<unknown>(dashboardOverviewRequestPath(scope), { method: "GET", signal }).then((value) => {
      const overview = parseDashboardOperationalOverview(value);
      if (overview.requestedScope.scopeType !== scope.scopeType || overview.requestedScope.scopeReference.toLowerCase() !== scope.scopeReference.toLowerCase()) {
        throw malformed("DASHBOARD_SCOPE_RESPONSE_MISMATCH", "The dashboard response does not match the requested reporting scope.");
      }
      return overview;
    })
  };
}

export function dashboardOverviewRequestPath(scope: Pick<DashboardScope, "scopeType" | "scopeReference">): string {
  if ((scope.scopeType !== "SITE" && scope.scopeType !== "SITE_GROUP") || !isUuid(scope.scopeReference)) {
    throw malformed("DASHBOARD_EXPLICIT_SCOPE_REQUIRED", "An explicit authorized Site or Site Group reporting scope is required.");
  }

  const query = new URLSearchParams({ scopeType: scope.scopeType, scopeReference: scope.scopeReference });
  return `${dashboardOperationalOverviewRoute}?${query.toString()}`;
}

export function parseDashboardCatalog(value: unknown): DashboardCatalog {
  const record = object(value, "catalog");
  contractVersion(record.contractVersion);
  return {
    contractVersion: dashboardContractVersion,
    generatedAt: timestamp(record.generatedAt, "generatedAt"),
    reports: array(record.reports, "reports").map((entry, index) => parseCatalogEntry(entry, index))
  };
}

export function parseDashboardOperationalOverview(value: unknown): DashboardOperationalOverview {
  const record = object(value, "operational overview");
  contractVersion(record.contractVersion);
  if (record.reportId !== "operational-overview") {
    throw malformed("DASHBOARD_REPORT_ID_UNSUPPORTED", "The operational dashboard response uses an unsupported report identifier.");
  }

  const sections = array(record.sections, "sections").map((section, index) => parseSection(section, index));
  if (new Set(sections.map((section) => section.sectionId)).size !== sections.length) {
    throw malformed("DASHBOARD_SECTION_DUPLICATE", "The operational dashboard response contains duplicate sections.");
  }

  return {
    contractVersion: dashboardContractVersion,
    reportId: "operational-overview",
    requestedScope: parseScope(record.requestedScope, "requestedScope"),
    effectiveScope: parseScope(record.effectiveScope, "effectiveScope"),
    generatedAt: timestamp(record.generatedAt, "generatedAt"),
    dataAsOf: optionalTimestamp(record.dataAsOf, "dataAsOf"),
    availability: availability(record.availability),
    freshness: freshness(record.freshness),
    correlationId: uuid(record.correlationId, "correlationId"),
    sections,
    warnings: stringArray(record.warnings, "warnings"),
    limitations: stringArray(record.limitations, "limitations")
  };
}

function parseCatalogEntry(value: unknown, index: number): DashboardCatalogEntry {
  const record = object(value, `reports[${index}]`);
  const reportId = text(record.reportId, "reportId");
  const entryContractVersion = catalogEntryContractVersion(record.contractVersion, reportId);
  return {
    reportId,
    contractVersion: entryContractVersion,
    displayTitle: text(record.displayTitle, "displayTitle"),
    functionalDomain: text(record.functionalDomain, "functionalDomain"),
    description: text(record.description, "description"),
    supportedScopeTypes: array(record.supportedScopeTypes, "supportedScopeTypes").map(scopeType),
    requiredPermission: text(record.requiredPermission, "requiredPermission"),
    availability: availability(record.availability),
    sourceAuthority: text(record.sourceAuthority, "sourceAuthority"),
    privacyClassification: text(record.privacyClassification, "privacyClassification"),
    supportedFilters: stringArray(record.supportedFilters, "supportedFilters"),
    freshnessSemantics: text(record.freshnessSemantics, "freshnessSemantics"),
    warnings: stringArray(record.warnings, "warnings"),
    limitations: stringArray(record.limitations, "limitations")
  };
}

function catalogEntryContractVersion(value: unknown, reportId: string): DashboardCatalogEntry["contractVersion"] {
  const expected = reportId === "payment-reconciliation-summary"
    ? paymentReconciliationContractVersion
    : reportId === "fiscal-exception-summary"
      ? fiscalExceptionContractVersion
      : dashboardContractVersion;
  if (value === expected) return expected;
  throw malformed("DASHBOARD_CATALOG_ENTRY_CONTRACT_VERSION_UNSUPPORTED", "A report catalog entry uses an unsupported contract version.");
}

function parseScope(value: unknown, field: string): DashboardScope {
  const record = object(value, field);
  return {
    scopeType: scopeType(record.scopeType),
    scopeReference: uuid(record.scopeReference, `${field}.scopeReference`),
    displayName: text(record.displayName, `${field}.displayName`)
  };
}

function parseSection(value: unknown, index: number): DashboardOverviewSection {
  const record = object(value, `sections[${index}]`);
  const sectionAvailability = availability(record.availability);
  const metrics = array(record.metrics, "metrics").map((metric, metricIndex) => parseMetric(metric, metricIndex));
  if ((sectionAvailability === "UNAVAILABLE" || sectionAvailability === "NOT_APPLICABLE") && metrics.length > 0) {
    throw malformed("DASHBOARD_UNAVAILABLE_METRICS_REJECTED", "Unavailable dashboard sections cannot contain authoritative metric values.");
  }

  return {
    sectionId: text(record.sectionId, "sectionId"),
    displayTitle: text(record.displayTitle, "displayTitle"),
    availability: sectionAvailability,
    freshness: freshness(record.freshness),
    sourceAuthority: text(record.sourceAuthority, "sourceAuthority"),
    dataAsOf: optionalTimestamp(record.dataAsOf, "dataAsOf"),
    metrics,
    warnings: stringArray(record.warnings, "warnings"),
    limitations: stringArray(record.limitations, "limitations")
  };
}

function parseMetric(value: unknown, index: number): DashboardMetric {
  const record = object(value, `metrics[${index}]`);
  if (typeof record.value !== "number" || !Number.isSafeInteger(record.value) || record.value < 0) {
    throw malformed("DASHBOARD_METRIC_INVALID", "The operational dashboard contains an invalid metric value.");
  }
  return {
    metricId: text(record.metricId, "metricId"),
    displayLabel: text(record.displayLabel, "displayLabel"),
    value: record.value,
    unit: text(record.unit, "unit")
  };
}

const availabilityValues = new Set<DashboardAvailability>(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);
const freshnessValues = new Set<DashboardFreshness>(["CURRENT", "STALE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);

function availability(value: unknown): DashboardAvailability {
  if (typeof value === "string" && availabilityValues.has(value as DashboardAvailability)) return value as DashboardAvailability;
  throw malformed("DASHBOARD_AVAILABILITY_UNSUPPORTED", "The dashboard response contains an unsupported availability classification.");
}

function freshness(value: unknown): DashboardFreshness {
  if (typeof value === "string" && freshnessValues.has(value as DashboardFreshness)) return value as DashboardFreshness;
  throw malformed("DASHBOARD_FRESHNESS_UNSUPPORTED", "The dashboard response contains an unsupported freshness classification.");
}

function scopeType(value: unknown): DashboardScopeType {
  if (value === "SITE" || value === "SITE_GROUP") return value;
  throw malformed("DASHBOARD_SCOPE_TYPE_UNSUPPORTED", "The dashboard response contains an unsupported scope type.");
}

function contractVersion(value: unknown): asserts value is typeof dashboardContractVersion {
  if (value !== dashboardContractVersion) {
    throw malformed("DASHBOARD_CONTRACT_VERSION_UNSUPPORTED", "The dashboard response contract version is not supported.");
  }
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformed("DASHBOARD_RESPONSE_MALFORMED", `The dashboard ${field} response is malformed.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw malformed("DASHBOARD_RESPONSE_MALFORMED", `The dashboard ${field} field is malformed.`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw malformed("DASHBOARD_RESPONSE_MALFORMED", `The dashboard ${field} field is malformed.`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  return array(value, field).map((entry) => text(entry, field));
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field);
  if (!Number.isFinite(Date.parse(result))) throw malformed("DASHBOARD_TIMESTAMP_INVALID", `The dashboard ${field} timestamp is malformed.`);
  return result;
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  return value === null || value === undefined ? undefined : timestamp(value, field);
}

function uuid(value: unknown, field: string): string {
  const result = text(value, field);
  if (!isUuid(result)) throw malformed("DASHBOARD_REFERENCE_INVALID", `The dashboard ${field} reference is malformed.`);
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function malformed(code: string, message: string): ManagementPlatformUiError {
  return createUiError("malformed-response", code, message, undefined, undefined, false, false);
}

export type DashboardScenarioName =
  | "current"
  | "partial-connectors"
  | "stale-projection"
  | "unavailable-projection"
  | "not-configured"
  | "site"
  | "site-group"
  | "feature-disabled"
  | "permission-denied"
  | "scope-denied"
  | "malformed"
  | "retryable-failure";

export interface DashboardScenario {
  name: DashboardScenarioName;
  client: DashboardReportingClient;
}

export function resolveDashboardScenario(enabled: boolean, search: string): DashboardScenario | undefined {
  if (!import.meta.env.DEV || !enabled) return undefined;
  const requested = new URLSearchParams(search).get("mpDashboardScenario");
  const names: DashboardScenarioName[] = ["current", "partial-connectors", "stale-projection", "unavailable-projection", "not-configured", "site", "site-group", "feature-disabled", "permission-denied", "scope-denied", "malformed", "retryable-failure"];
  if (!names.includes(requested as DashboardScenarioName)) return undefined;
  const name = requested as DashboardScenarioName;
  return { name, client: scenarioClient(name) };
}

function scenarioClient(name: DashboardScenarioName): DashboardReportingClient {
  return {
    getCatalog: async () => fixtureCatalog(),
    getOperationalOverview: async (scope) => {
      if (name === "feature-disabled") throw createUiError("feature-disabled", "MANAGEMENT_DASHBOARD_REPORTING_DISABLED", "Management Dashboard and Reporting is not enabled for this environment.", "dashboard-feature-disabled", 503);
      if (name === "permission-denied") throw createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "You do not have permission for this Management Platform action.", "dashboard-permission-denied", 403);
      if (name === "scope-denied") throw createUiError("not-found", "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "The requested resource is unavailable.", "dashboard-scope-denied", 404);
      if (name === "retryable-failure") throw createUiError("integration-unavailable", "DASHBOARD_SOURCE_UNAVAILABLE", "Central PMS is unavailable.", "dashboard-retryable", 503, true);
      if (name === "malformed") return parseDashboardOperationalOverview({ contractVersion: dashboardContractVersion });
      return fixtureOverview(scope, name);
    }
  };
}

function fixtureCatalog(): DashboardCatalog {
  const reports = [
    ["operational-overview", "Operational overview", "PARTIAL"],
    ["payment-reconciliation-summary", "Payment and Reconciliation", "PARTIAL"],
    ["fiscal-exception-summary", "Sales Invoice Exceptions", "PARTIAL"],
    ["management-activity-summary", "Management activity summary", "UNAVAILABLE"]
  ] as const;
  return {
    contractVersion: dashboardContractVersion,
    generatedAt: "2026-08-21T02:00:00Z",
    reports: reports.map(([reportId, displayTitle, state]) => ({
      reportId,
      contractVersion: dashboardContractVersion,
      displayTitle,
      functionalDomain: "Management operations",
      description: reportId === "operational-overview" ? "Current Site and connector operating posture." : reportId === "payment-reconciliation-summary" ? "Internal Central PMS payment activity and consistency reporting." : reportId === "fiscal-exception-summary" ? "Persisted Sales Invoice issuance lifecycle and supported exception summaries." : "This reporting source is not available in phase 1.",
      supportedScopeTypes: ["SITE", "SITE_GROUP"],
      requiredPermission: reportId === "operational-overview" ? "dashboard.view" : reportId === "payment-reconciliation-summary" ? "reconciliation.view" : reportId === "fiscal-exception-summary" ? "sales-invoice-report.view" : "reports.view",
      availability: state,
      sourceAuthority: reportId === "operational-overview" ? "CENTRAL_PMS" : reportId === "payment-reconciliation-summary" ? "CENTRAL_PMS_CANONICAL_PAYMENT_RECORDS" : reportId === "fiscal-exception-summary" ? "CENTRAL_PMS_FISCAL_ISSUANCE_REFERENCES" : "PHASE_1_SOURCE_NOT_APPROVED",
      privacyClassification: "INTERNAL_OPERATIONAL_AGGREGATE",
      supportedFilters: ["scopeType", "scopeReference"],
      freshnessSemantics: "Source-owned timestamps and classifications.",
      warnings: state === "UNAVAILABLE" ? ["No phase-1 result is available."] : reportId === "fiscal-exception-summary" ? ["Only outcomes persisted in Central PMS are represented."] : [],
      limitations: state === "UNAVAILABLE" ? ["No placeholder result is presented."] : reportId === "payment-reconciliation-summary" ? ["Provider settlement and financial finality are unavailable."] : reportId === "fiscal-exception-summary" ? ["The report does not query Site POS Servers live or certify BIR compliance."] : []
    }))
  };
}

function fixtureOverview(scope: Pick<DashboardScope, "scopeType" | "scopeReference">, name: DashboardScenarioName): DashboardOperationalOverview {
  const stale = name === "stale-projection";
  const unavailable = name === "unavailable-projection";
  const notConfigured = name === "not-configured";
  const partial = name === "partial-connectors" || unavailable;
  const generatedAt = "2026-08-21T02:00:00Z";
  const dataAsOf = stale ? "2026-08-21T00:40:00Z" : "2026-08-21T01:59:00Z";
  const displayName = scope.scopeType === "SITE" ? "Development Site Alpha" : "Development Site Group";
  const connectorAvailability: DashboardAvailability = unavailable ? "UNAVAILABLE" : notConfigured ? "NOT_APPLICABLE" : partial ? "PARTIAL" : "AVAILABLE";
  const connectorFreshness: DashboardFreshness = unavailable ? "UNAVAILABLE" : notConfigured ? "NOT_APPLICABLE" : stale ? "STALE" : partial ? "PARTIAL" : "CURRENT";
  const connectorMetrics = unavailable || notConfigured ? [] : [
    { metricId: "connector-targets", displayLabel: "Connector targets", value: 2, unit: "COUNT" },
    { metricId: "connector-targets-healthy", displayLabel: "Healthy targets", value: partial ? 1 : 2, unit: "COUNT" }
  ];
  return {
    contractVersion: dashboardContractVersion,
    reportId: "operational-overview",
    requestedScope: { ...scope, displayName },
    effectiveScope: { ...scope, displayName },
    generatedAt,
    dataAsOf,
    availability: partial ? "PARTIAL" : "AVAILABLE",
    freshness: stale ? "STALE" : partial ? "PARTIAL" : "CURRENT",
    correlationId: "93000000-0000-4000-8000-000000000301",
    sections: [
      {
        sectionId: "site-operational-status",
        displayTitle: "Site operational status",
        availability: "AVAILABLE",
        freshness: "CURRENT",
        sourceAuthority: "CENTRAL_PMS_SITE_REGISTRY",
        dataAsOf,
        metrics: [
          { metricId: "sites-total", displayLabel: "Sites", value: scope.scopeType === "SITE" ? 1 : 2, unit: "COUNT" },
          { metricId: "sites-active", displayLabel: "Active Sites", value: scope.scopeType === "SITE" ? 1 : 2, unit: "COUNT" }
        ],
        warnings: [],
        limitations: ["Configuration posture does not prove payment or gate availability."]
      },
      {
        sectionId: "connector-health",
        displayTitle: "Connector health",
        availability: connectorAvailability,
        freshness: connectorFreshness,
        sourceAuthority: "CENTRAL_PMS_VENDOR_SESSION_PROJECTION",
        dataAsOf: unavailable || notConfigured ? undefined : dataAsOf,
        metrics: connectorMetrics,
        warnings: unavailable ? ["VENDOR_PROJECTION_SOURCE_UNAVAILABLE"] : notConfigured ? ["No connector target is configured for this scope."] : partial ? ["One connector target is not healthy."] : [],
        limitations: unavailable || notConfigured ? ["No metric values are available."] : []
      },
      {
        sectionId: "vendor-projection-freshness",
        displayTitle: "Vendor projection freshness",
        availability: unavailable ? "UNAVAILABLE" : "AVAILABLE",
        freshness: unavailable ? "UNAVAILABLE" : stale ? "STALE" : "CURRENT",
        sourceAuthority: "CENTRAL_PMS_VENDOR_SESSION_PROJECTION",
        dataAsOf: unavailable ? undefined : dataAsOf,
        metrics: unavailable ? [] : [
          { metricId: "active-projections", displayLabel: "Active projections", value: 17, unit: "COUNT" },
          { metricId: "stale-projection-targets", displayLabel: "Stale targets", value: stale ? 1 : 0, unit: "COUNT" }
        ],
        warnings: stale ? ["Projection information is stale."] : unavailable ? ["Projection freshness cannot be read."] : [],
        limitations: ["Projection data is operational visibility only."]
      }
    ],
    warnings: stale ? ["One or more sections contain stale information."] : partial ? ["Some operational sources are incomplete."] : [],
    limitations: ["This dashboard is not payment, fiscal, settlement, or exit authority."]
  };
}
