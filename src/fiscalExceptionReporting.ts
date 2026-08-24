import { createUiError } from "./apiClient";
import type { DashboardAvailability, DashboardScope } from "./dashboardReporting";
import type { CentralPmsApiClient, ManagementPlatformUiError } from "./types";

export const fiscalExceptionContractVersion = "management-platform-fiscal-exception-reporting:v1";
export const fiscalExceptionReportId = "fiscal-exception-summary";
export const fiscalExceptionRoute = "/management-platform/reports/fiscal-exceptions";
export const fiscalExceptionApiRoute = "/v1/management-platform/dashboard/fiscal-exception-summary";
export const fiscalExceptionPermission = "sales-invoice-report.view";
export const fiscalExceptionTimeBasis = "FISCAL_ISSUANCE_REFERENCE_FIRST_RECORDED_AT";
export const maximumFiscalReportingPeriodDays = 31;

export interface FiscalReportingPeriod {
  periodStart: string;
  periodEnd: string;
}

export type FiscalReportAvailability = "PARTIAL" | "NO_ACTIVITY";
export type FiscalReportFreshness = "CURRENT" | "NOT_APPLICABLE";
export type FiscalLifecycleState =
  | "NOT_REQUIRED"
  | "PENDING"
  | "REQUESTED"
  | "ISSUED"
  | "FAILED"
  | "CONFLICT"
  | "OUTCOME_UNAVAILABLE"
  | "MANUAL_REVIEW"
  | "EXCEPTION_RELEASED"
  | "OTHER";
export type FiscalExceptionCategory =
  | "SALES_INVOICE_ISSUANCE_FAILED"
  | "SALES_INVOICE_REFERENCE_CONFLICT"
  | "SALES_INVOICE_OUTCOME_UNAVAILABLE";

export interface FiscalSourceCoverage {
  sourceId: string;
  availability: DashboardAvailability;
  dataAsOf?: string;
  description: string;
  limitations: string[];
}

export interface FiscalLifecycleSummary {
  lifecycleState: FiscalLifecycleState;
  count: number;
}

export interface FiscalAmountSummary {
  currencyCode: string;
  amount: number;
}

export interface FiscalExceptionSummary {
  categoryId: FiscalExceptionCategory;
  availability: DashboardAvailability;
  count: number;
  affectedExpectedAmounts: FiscalAmountSummary[];
  definition: string;
  terminal: boolean;
  canResolveLater: boolean;
  limitations: string[];
}

export interface FiscalCurrencySummary {
  currencyCode: string;
  issuanceExpectationCount: number;
  expectedIssuanceAmount: number;
  issuedCount: number;
  failedCount: number;
}

export interface FiscalExceptionReport {
  contractVersion: typeof fiscalExceptionContractVersion;
  reportId: typeof fiscalExceptionReportId;
  requestedScope: DashboardScope;
  effectiveScope: DashboardScope;
  periodStart: string;
  periodEnd: string;
  timeBasis: typeof fiscalExceptionTimeBasis;
  generatedAt: string;
  dataAsOf?: string;
  availability: FiscalReportAvailability;
  freshness: FiscalReportFreshness;
  correlationId: string;
  sourceCoverage: FiscalSourceCoverage[];
  lifecycleSummaries: FiscalLifecycleSummary[];
  exceptionSummaries: FiscalExceptionSummary[];
  currencySummaries: FiscalCurrencySummary[];
  warnings: string[];
  limitations: string[];
  unavailableFacts: string[];
  sourceAuthority: string;
}

export interface FiscalExceptionReportingClient {
  getSummary(
    scope: Pick<DashboardScope, "scopeType" | "scopeReference">,
    period: FiscalReportingPeriod,
    signal?: AbortSignal
  ): Promise<FiscalExceptionReport>;
}

export function createFiscalExceptionReportingClient(apiClient: CentralPmsApiClient): FiscalExceptionReportingClient {
  return {
    getSummary: (scope, period, signal) => apiClient.request<unknown>(
      fiscalExceptionRequestPath(scope, period),
      { method: "GET", signal, requireJsonContentType: true }
    ).then((value) => {
      const report = parseFiscalExceptionReport(value);
      assertResponseBinding(report, scope, period);
      return report;
    })
  };
}

export function fiscalExceptionRequestPath(
  scope: Pick<DashboardScope, "scopeType" | "scopeReference">,
  period: FiscalReportingPeriod
): string {
  if ((scope.scopeType !== "SITE" && scope.scopeType !== "SITE_GROUP") || !isUuid(scope.scopeReference)) {
    throw malformed("FISCAL_REPORT_EXPLICIT_SCOPE_REQUIRED", "An explicit authorized Site or Site Group is required.");
  }
  const validated = validateFiscalReportingPeriod(period);
  if (!validated.valid) throw createUiError("validation", validated.code, validated.message);
  const query = new URLSearchParams({
    scopeType: scope.scopeType,
    scopeReference: scope.scopeReference,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd
  });
  return `${fiscalExceptionApiRoute}?${query.toString()}`;
}

export function validateFiscalReportingPeriod(period: FiscalReportingPeriod):
  | { valid: true }
  | { valid: false; code: string; message: string } {
  const start = parseUtcInstant(period.periodStart);
  if (start === undefined) return { valid: false, code: "INVALID_FISCAL_EXCEPTION_PERIOD_START", message: "Enter a valid UTC period start." };
  const end = parseUtcInstant(period.periodEnd);
  if (end === undefined) return { valid: false, code: "INVALID_FISCAL_EXCEPTION_PERIOD_END", message: "Enter a valid UTC period end." };
  if (start >= end) return { valid: false, code: "INVALID_FISCAL_EXCEPTION_PERIOD_RANGE", message: "Period end must be later than period start." };
  if (end - start > maximumFiscalReportingPeriodDays * 24 * 60 * 60 * 1000) {
    return { valid: false, code: "FISCAL_EXCEPTION_PERIOD_TOO_LONG", message: "The reporting period cannot exceed 31 days." };
  }
  return { valid: true };
}

export function utcInputValueToFiscalInstant(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const result = `${value}:00Z`;
  return parseUtcInstant(result) === undefined ? undefined : result;
}

export function fiscalInstantToUtcInputValue(value: string): string {
  const parsed = parseUtcInstant(value);
  return parsed === undefined ? "" : new Date(parsed).toISOString().slice(0, 16);
}

export function defaultFiscalReportingPeriod(now = new Date()): FiscalReportingPeriod {
  const end = new Date(now);
  end.setUTCSeconds(0, 0);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { periodStart: withoutMilliseconds(start), periodEnd: withoutMilliseconds(end) };
}

function withoutMilliseconds(value: Date): string { return value.toISOString().replace(".000Z", "Z"); }

export function parseFiscalExceptionReport(value: unknown): FiscalExceptionReport {
  assertNoSensitiveFields(value);
  const record = object(value, "report");
  if (record.contractVersion !== fiscalExceptionContractVersion) throw malformed("FISCAL_REPORT_CONTRACT_VERSION_UNSUPPORTED", "The fiscal exception report contract version is not supported.");
  if (record.reportId !== fiscalExceptionReportId) throw malformed("FISCAL_REPORT_ID_UNSUPPORTED", "The fiscal exception report identifier is not supported.");
  if (record.timeBasis !== fiscalExceptionTimeBasis) throw malformed("FISCAL_REPORT_TIME_BASIS_UNSUPPORTED", "The fiscal exception report time basis is not supported.");
  const availabilityValue = reportAvailability(record.availability);
  const freshnessValue = reportFreshness(record.freshness);
  const report: FiscalExceptionReport = {
    contractVersion: fiscalExceptionContractVersion,
    reportId: fiscalExceptionReportId,
    requestedScope: parseScope(record.requestedScope, "requestedScope"),
    effectiveScope: parseScope(record.effectiveScope, "effectiveScope"),
    periodStart: timestamp(record.periodStart, "periodStart"),
    periodEnd: timestamp(record.periodEnd, "periodEnd"),
    timeBasis: fiscalExceptionTimeBasis,
    generatedAt: timestamp(record.generatedAt, "generatedAt"),
    dataAsOf: optionalTimestamp(record.dataAsOf, "dataAsOf"),
    availability: availabilityValue,
    freshness: freshnessValue,
    correlationId: uuid(record.correlationId, "correlationId"),
    sourceCoverage: array(record.sourceCoverage, "sourceCoverage").map(parseSourceCoverage),
    lifecycleSummaries: array(record.lifecycleSummaries, "lifecycleSummaries").map(parseLifecycleSummary),
    exceptionSummaries: array(record.exceptionSummaries, "exceptionSummaries").map(parseExceptionSummary),
    currencySummaries: array(record.currencySummaries, "currencySummaries").map(parseCurrencySummary),
    warnings: stringArray(record.warnings, "warnings"),
    limitations: stringArray(record.limitations, "limitations"),
    unavailableFacts: stringArray(record.unavailableFacts, "unavailableFacts"),
    sourceAuthority: text(record.sourceAuthority, "sourceAuthority")
  };
  if (availabilityValue === "NO_ACTIVITY" && hasAuthoritativeValues(report)) {
    throw malformed("FISCAL_REPORT_NO_ACTIVITY_VALUES_REJECTED", "A no-activity fiscal report cannot contain authoritative aggregates.");
  }
  if (availabilityValue === "NO_ACTIVITY" && freshnessValue !== "NOT_APPLICABLE") {
    throw malformed("FISCAL_REPORT_NO_ACTIVITY_FRESHNESS_INVALID", "A no-activity fiscal report must use not-applicable freshness.");
  }
  return report;
}

function parseSourceCoverage(value: unknown, index: number): FiscalSourceCoverage {
  const row = object(value, `sourceCoverage[${index}]`);
  return {
    sourceId: text(row.sourceId, "sourceId"),
    availability: dashboardAvailability(row.availability),
    dataAsOf: optionalTimestamp(row.dataAsOf, "sourceCoverage.dataAsOf"),
    description: text(row.description, "description"),
    limitations: stringArray(row.limitations, "sourceCoverage.limitations")
  };
}

const lifecycleStates = new Set<FiscalLifecycleState>([
  "NOT_REQUIRED", "PENDING", "REQUESTED", "ISSUED", "FAILED", "CONFLICT", "OUTCOME_UNAVAILABLE", "MANUAL_REVIEW", "EXCEPTION_RELEASED", "OTHER"
]);

function parseLifecycleSummary(value: unknown, index: number): FiscalLifecycleSummary {
  const row = object(value, `lifecycleSummaries[${index}]`);
  const lifecycleState = text(row.lifecycleState, "lifecycleState") as FiscalLifecycleState;
  if (!lifecycleStates.has(lifecycleState)) throw malformed("FISCAL_REPORT_LIFECYCLE_UNSUPPORTED", "The fiscal exception report contains an unsupported lifecycle state.");
  return { lifecycleState, count: count(row.count) };
}

const exceptionCategories = new Set<FiscalExceptionCategory>([
  "SALES_INVOICE_ISSUANCE_FAILED", "SALES_INVOICE_REFERENCE_CONFLICT", "SALES_INVOICE_OUTCOME_UNAVAILABLE"
]);

function parseExceptionSummary(value: unknown, index: number): FiscalExceptionSummary {
  const row = object(value, `exceptionSummaries[${index}]`);
  const categoryId = text(row.categoryId, "categoryId") as FiscalExceptionCategory;
  if (!exceptionCategories.has(categoryId)) throw malformed("FISCAL_REPORT_EXCEPTION_CATEGORY_UNSUPPORTED", "The fiscal exception report contains an unsupported exception category.");
  return {
    categoryId,
    availability: dashboardAvailability(row.availability),
    count: count(row.count),
    affectedExpectedAmounts: array(row.affectedExpectedAmounts, "affectedExpectedAmounts").map((entry, amountIndex) => {
      const amount = object(entry, `affectedExpectedAmounts[${amountIndex}]`);
      return { currencyCode: currency(amount.currencyCode), amount: money(amount.amount) };
    }),
    definition: text(row.definition, "definition"),
    terminal: boolean(row.terminal, "terminal"),
    canResolveLater: boolean(row.canResolveLater, "canResolveLater"),
    limitations: stringArray(row.limitations, "exceptionSummaries.limitations")
  };
}

function parseCurrencySummary(value: unknown, index: number): FiscalCurrencySummary {
  const row = object(value, `currencySummaries[${index}]`);
  return {
    currencyCode: currency(row.currencyCode),
    issuanceExpectationCount: count(row.issuanceExpectationCount),
    expectedIssuanceAmount: money(row.expectedIssuanceAmount),
    issuedCount: count(row.issuedCount),
    failedCount: count(row.failedCount)
  };
}

function assertResponseBinding(report: FiscalExceptionReport, scope: Pick<DashboardScope, "scopeType" | "scopeReference">, period: FiscalReportingPeriod): void {
  if (report.requestedScope.scopeType !== scope.scopeType || report.requestedScope.scopeReference.toLowerCase() !== scope.scopeReference.toLowerCase()) {
    throw malformed("FISCAL_REPORT_SCOPE_RESPONSE_MISMATCH", "The fiscal exception report does not match the requested scope.");
  }
  if (Date.parse(report.periodStart) !== Date.parse(period.periodStart) || Date.parse(report.periodEnd) !== Date.parse(period.periodEnd)) {
    throw malformed("FISCAL_REPORT_PERIOD_RESPONSE_MISMATCH", "The fiscal exception report does not match the requested period.");
  }
}

function hasAuthoritativeValues(report: FiscalExceptionReport): boolean {
  return report.lifecycleSummaries.length > 0 || report.currencySummaries.length > 0 || report.exceptionSummaries.some((item) => item.count > 0 || item.affectedExpectedAmounts.length > 0);
}

function parseScope(value: unknown, field: string): DashboardScope {
  const row = object(value, field);
  if (row.scopeType !== "SITE" && row.scopeType !== "SITE_GROUP") throw malformed("FISCAL_REPORT_SCOPE_TYPE_UNSUPPORTED", "The fiscal exception report contains an unsupported scope type.");
  return { scopeType: row.scopeType, scopeReference: uuid(row.scopeReference, `${field}.scopeReference`), displayName: text(row.displayName, `${field}.displayName`) };
}

const dashboardAvailabilities = new Set<DashboardAvailability>(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);
function dashboardAvailability(value: unknown): DashboardAvailability {
  if (typeof value === "string" && dashboardAvailabilities.has(value as DashboardAvailability)) return value as DashboardAvailability;
  throw malformed("FISCAL_REPORT_SOURCE_AVAILABILITY_UNSUPPORTED", "The fiscal exception report source availability is unsupported.");
}
function reportAvailability(value: unknown): FiscalReportAvailability {
  if (value === "PARTIAL" || value === "NO_ACTIVITY") return value;
  throw malformed("FISCAL_REPORT_AVAILABILITY_UNSUPPORTED", "The fiscal exception report availability is unsupported.");
}
function reportFreshness(value: unknown): FiscalReportFreshness {
  if (value === "CURRENT" || value === "NOT_APPLICABLE") return value;
  throw malformed("FISCAL_REPORT_FRESHNESS_UNSUPPORTED", "The fiscal exception report freshness is unsupported.");
}

const sensitivePropertyNames = new Set([
  "salesinvoicenumber", "paymentreference", "providerreference", "ticketnumber", "vehicleplate", "payeridentity",
  "statutoryid", "rawposserverresponse", "fiscaldocument", "electronicjournal", "credential", "credentials", "token", "tokens"
]);
function assertNoSensitiveFields(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertNoSensitiveFields); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (sensitivePropertyNames.has(normalized)) throw malformed("FISCAL_REPORT_SENSITIVE_FIELD_REJECTED", "The fiscal exception report contains an unsupported sensitive field.");
    assertNoSensitiveFields(nested);
  }
}

function object(value: unknown, field: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw malformed("FISCAL_REPORT_RESPONSE_MALFORMED", `The fiscal exception report ${field} is malformed.`); return value as Record<string, unknown>; }
function array(value: unknown, field: string): unknown[] { if (!Array.isArray(value)) throw malformed("FISCAL_REPORT_RESPONSE_MALFORMED", `The fiscal exception report ${field} is malformed.`); return value; }
function text(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) throw malformed("FISCAL_REPORT_RESPONSE_MALFORMED", `The fiscal exception report ${field} is malformed.`); return value; }
function stringArray(value: unknown, field: string): string[] { return array(value, field).map((entry) => text(entry, field)); }
function boolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw malformed("FISCAL_REPORT_RESPONSE_MALFORMED", `The fiscal exception report ${field} is malformed.`); return value; }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw malformed("FISCAL_REPORT_COUNT_INVALID", "The fiscal exception report contains an invalid count."); return value; }
function money(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw malformed("FISCAL_REPORT_AMOUNT_INVALID", "The fiscal exception report contains an invalid amount."); return value; }
function currency(value: unknown): string { const result = text(value, "currencyCode").toUpperCase(); if (result !== "PHP") throw malformed("FISCAL_REPORT_CURRENCY_INVALID", "The fiscal exception report contains an unsupported currency."); return result; }
function uuid(value: unknown, field: string): string { const result = text(value, field); if (!isUuid(result)) throw malformed("FISCAL_REPORT_REFERENCE_INVALID", `The fiscal exception report ${field} is malformed.`); return result; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value); }
function parseUtcInstant(value: string): number | undefined { if (!/(Z|\+00:00)$/i.test(value)) return undefined; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined; }
function timestamp(value: unknown, field: string): string { const result = text(value, field); if (parseUtcInstant(result) === undefined) throw malformed("FISCAL_REPORT_TIMESTAMP_INVALID", `The fiscal exception report ${field} timestamp is malformed.`); return result; }
function optionalTimestamp(value: unknown, field: string): string | undefined { return value === null || value === undefined ? undefined : timestamp(value, field); }
function malformed(code: string, message: string): ManagementPlatformUiError { return createUiError("malformed-response", code, message, undefined, undefined, false, false); }

export type FiscalExceptionScenarioName = "partial" | "site-group" | "no-activity" | "unavailable" | "feature-disabled" | "permission-denied" | "scope-denied" | "malformed" | "mismatched-scope" | "mismatched-period" | "retryable-failure" | "refresh-failure";
export interface FiscalExceptionScenario { name: FiscalExceptionScenarioName; client: FiscalExceptionReportingClient; }

export function resolveFiscalExceptionScenario(enabled: boolean, search: string): FiscalExceptionScenario | undefined {
  if (!import.meta.env.DEV || !enabled) return undefined;
  const requested = new URLSearchParams(search).get("mpFiscalScenario") as FiscalExceptionScenarioName | null;
  const names: FiscalExceptionScenarioName[] = ["partial", "site-group", "no-activity", "unavailable", "feature-disabled", "permission-denied", "scope-denied", "malformed", "mismatched-scope", "mismatched-period", "retryable-failure", "refresh-failure"];
  if (!requested || !names.includes(requested)) return undefined;
  return { name: requested, client: fiscalScenarioClient(requested) };
}

function fiscalScenarioClient(name: FiscalExceptionScenarioName): FiscalExceptionReportingClient {
  let requests = 0;
  return { getSummary: async (scope, period) => {
    requests += 1;
    if (name === "feature-disabled") throw createUiError("integration-unavailable", "MANAGEMENT_FISCAL_EXCEPTION_REPORTING_DISABLED", "Fiscal exception reporting is not enabled.", "95000000-0000-4000-8000-000000000501", 503);
    if (name === "permission-denied") throw createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "You do not have permission for this action.", "95000000-0000-4000-8000-000000000502", 403);
    if (name === "scope-denied") throw createUiError("not-found", "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "The requested resource is unavailable.", "95000000-0000-4000-8000-000000000503", 404);
    if (name === "unavailable" || name === "retryable-failure" || (name === "refresh-failure" && requests > 2)) throw createUiError("integration-unavailable", "FISCAL_EXCEPTION_SOURCE_UNAVAILABLE", "The fiscal exception source is unavailable.", "95000000-0000-4000-8000-000000000504", 503, true);
    if (name === "malformed") return parseFiscalExceptionReport({ contractVersion: fiscalExceptionContractVersion });
    const fixture = fiscalExceptionFixture(scope, period, name === "site-group" ? "site-group" : name === "no-activity" ? "no-activity" : "partial");
    if (name === "mismatched-scope") throw malformed("FISCAL_REPORT_SCOPE_RESPONSE_MISMATCH", "The fiscal exception report does not match the requested scope.");
    if (name === "mismatched-period") throw malformed("FISCAL_REPORT_PERIOD_RESPONSE_MISMATCH", "The fiscal exception report does not match the requested period.");
    return fixture;
  } };
}

export function fiscalExceptionFixture(
  scope: Pick<DashboardScope, "scopeType" | "scopeReference">,
  period: FiscalReportingPeriod,
  name: "partial" | "site-group" | "no-activity" = "partial"
): FiscalExceptionReport {
  const noActivity = name === "no-activity";
  const displayName = scope.scopeType === "SITE" ? "Development Site Alpha" : "Development Site Group";
  const lifecycles: FiscalLifecycleState[] = ["NOT_REQUIRED", "PENDING", "REQUESTED", "ISSUED", "FAILED", "CONFLICT", "OUTCOME_UNAVAILABLE", "MANUAL_REVIEW", "EXCEPTION_RELEASED", "OTHER"];
  return {
    contractVersion: fiscalExceptionContractVersion,
    reportId: fiscalExceptionReportId,
    requestedScope: { ...scope, displayName },
    effectiveScope: { ...scope, displayName },
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    timeBasis: fiscalExceptionTimeBasis,
    generatedAt: "2026-08-23T03:00:00Z",
    dataAsOf: noActivity ? undefined : "2026-08-23T02:58:00Z",
    availability: noActivity ? "NO_ACTIVITY" : "PARTIAL",
    freshness: noActivity ? "NOT_APPLICABLE" : "CURRENT",
    correlationId: "95000000-0000-4000-8000-000000000500",
    sourceCoverage: [
      { sourceId: "central-pms-fiscal-issuance-references", availability: "AVAILABLE", dataAsOf: noActivity ? undefined : "2026-08-23T02:58:00Z", description: "Central PMS coordination references and latest persisted Sales Invoice issuance state.", limitations: ["The reference proves coordination state only; POS Server remains the issuance authority."] },
      { sourceId: "central-pms-payment-confirmations", availability: "AVAILABLE", dataAsOf: noActivity ? undefined : "2026-08-23T02:58:00Z", description: "Canonical payment confirmation currency and expected issuance amount linked to each reference.", limitations: ["Payment confirmation alone does not prove Sales Invoice issuance."] },
      { sourceId: "pos-server-fiscal-records", availability: "PARTIAL", dataAsOf: noActivity ? undefined : "2026-08-23T02:58:00Z", description: "Only authoritative POS Server issuance outcomes persisted by Central PMS are represented.", limitations: ["No synchronous POS Server read occurs during report generation."] }
    ],
    lifecycleSummaries: noActivity ? [] : lifecycles.map((lifecycleState, index) => ({ lifecycleState, count: index + 1 })),
    exceptionSummaries: noActivity ? exceptionFixture(true) : exceptionFixture(false),
    currencySummaries: noActivity ? [] : [
      { currencyCode: "PHP", issuanceExpectationCount: 21, expectedIssuanceAmount: 12543.25, issuedCount: 9, failedCount: 4 }
    ],
    warnings: noActivity ? ["NO_SALES_INVOICE_ISSUANCE_ACTIVITY_IN_PERIOD"] : [],
    limitations: ["Current lifecycle state is evaluated when the report is generated and can change after this response.", "The report does not query a Site POS Server and does not certify BIR compliance."],
    unavailableFacts: ["SALES_INVOICE_PRINT_RESULT_UNAVAILABLE", "DIGITAL_COPY_AVAILABILITY_UNAVAILABLE", "REPRINT_ADJUSTMENT_VOID_DELIVERY_UNAVAILABLE", "OVERDUE_DETECTION_UNAVAILABLE", "BIR_COMPLIANCE_CERTIFICATION_UNAVAILABLE"],
    sourceAuthority: "CENTRAL_PMS_FISCAL_ISSUANCE_REFERENCES"
  };
}

function exceptionFixture(empty: boolean): FiscalExceptionSummary[] {
  const definitions: Array<[FiscalExceptionCategory, string]> = [
    ["SALES_INVOICE_ISSUANCE_FAILED", "The latest Central PMS state records a supported issuance failure."],
    ["SALES_INVOICE_REFERENCE_CONFLICT", "The latest Central PMS state records an issuance reference conflict."],
    ["SALES_INVOICE_OUTCOME_UNAVAILABLE", "Central PMS does not hold a conclusive latest issuance outcome."]
  ];
  return definitions.map(([categoryId, definition], index) => ({ categoryId, availability: "AVAILABLE", count: empty ? 0 : index + 1, affectedExpectedAmounts: empty ? [] : [{ currencyCode: "PHP", amount: index + 15.25 }], definition, terminal: false, canResolveLater: true, limitations: ["A later persisted outcome can change this result."] }));
}
