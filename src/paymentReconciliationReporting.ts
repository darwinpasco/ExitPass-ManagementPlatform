import { createUiError } from "./apiClient";
import type { DashboardAvailability, DashboardFreshness, DashboardScope, DashboardScopeType } from "./dashboardReporting";
import type { CentralPmsApiClient, ManagementPlatformUiError } from "./types";

export const paymentReconciliationContractVersion = "management-platform-payment-reconciliation-reporting:v1";
export const paymentReconciliationReportId = "payment-reconciliation-summary";
export const paymentReconciliationRoute = "/management-platform/reports/payment-reconciliation";
export const paymentReconciliationApiRoute = "/v1/management-platform/dashboard/payment-reconciliation-summary";
export const maximumPaymentReportingPeriodDays = 31;

export interface PaymentReportingPeriod {
  periodStart: string;
  periodEnd: string;
}

export interface PaymentCurrencySummary {
  currencyCode: string;
  attemptCount: number;
  attemptedAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
}

export interface PaymentStatusSummary {
  status: string;
  currencyCode: string;
  count: number;
  amount: number;
}

export interface PaymentCanonicalStatusSummary extends PaymentStatusSummary {
  recordType: string;
}

export interface PaymentChannelSummary {
  channelCode: string;
  channelType: string;
  currencyCode: string;
  attemptCount: number;
  attemptedAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
}

export interface PaymentProviderSummary extends PaymentCurrencySummary {
  providerCode: string;
  verifiedOutcomeCount: number;
  verifiedOutcomeAmount: number;
}

export interface ReconciliationAmountSummary {
  currencyCode: string;
  amount: number;
}

export interface InternalReconciliationSummary {
  categoryId: ReconciliationCategory;
  availability: DashboardAvailability;
  count?: number;
  amounts: ReconciliationAmountSummary[];
  definition: string;
  monetaryTreatment: string;
  limitations: string[];
}

export type ReconciliationCategory =
  | "ATTEMPT_CONFIRMATION_AMOUNT_MISMATCH"
  | "ATTEMPT_CONFIRMATION_CURRENCY_MISMATCH"
  | "DUPLICATE_AUTHORITATIVE_PROVIDER_REFERENCE"
  | "CONFIRMED_OUTCOME_WITHOUT_CONFIRMATION"
  | "CONFIRMATION_ATTEMPT_STATUS_INCONSISTENT";

export interface PaymentReconciliationReport {
  contractVersion: typeof paymentReconciliationContractVersion;
  reportId: typeof paymentReconciliationReportId;
  requestedScope: DashboardScope;
  effectiveScope: DashboardScope;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  dataAsOf?: string;
  availability: DashboardAvailability;
  freshness: DashboardFreshness;
  correlationId: string;
  currencySummaries: PaymentCurrencySummary[];
  paymentAttemptSummaries: PaymentStatusSummary[];
  confirmedPaymentSummaries: PaymentStatusSummary[];
  canonicalStatusSummaries: PaymentCanonicalStatusSummary[];
  channelSummaries: PaymentChannelSummary[];
  providerSummaries: PaymentProviderSummary[];
  internalReconciliationSummaries: InternalReconciliationSummary[];
  warnings: string[];
  limitations: string[];
  sourceAuthority: string;
}

export interface PaymentReconciliationReportingClient {
  getSummary(
    scope: Pick<DashboardScope, "scopeType" | "scopeReference">,
    period: PaymentReportingPeriod,
    signal?: AbortSignal
  ): Promise<PaymentReconciliationReport>;
}

export function createPaymentReconciliationReportingClient(apiClient: CentralPmsApiClient): PaymentReconciliationReportingClient {
  return {
    getSummary: (scope, period, signal) => apiClient.request<unknown>(
      paymentReconciliationRequestPath(scope, period),
      { method: "GET", signal, requireJsonContentType: true }
    ).then((value) => {
      const report = parsePaymentReconciliationReport(value);
      assertResponseBinding(report, scope, period);
      return report;
    })
  };
}

export function paymentReconciliationRequestPath(
  scope: Pick<DashboardScope, "scopeType" | "scopeReference">,
  period: PaymentReportingPeriod
): string {
  if ((scope.scopeType !== "SITE" && scope.scopeType !== "SITE_GROUP") || !isUuid(scope.scopeReference)) {
    throw malformed("PAYMENT_REPORT_EXPLICIT_SCOPE_REQUIRED", "An explicit authorized Site or Site Group is required.");
  }
  const validated = validatePaymentReportingPeriod(period);
  if (!validated.valid) {
    throw createUiError("validation", validated.code, validated.message);
  }
  const query = new URLSearchParams({
    scopeType: scope.scopeType,
    scopeReference: scope.scopeReference,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd
  });
  return `${paymentReconciliationApiRoute}?${query.toString()}`;
}

export function validatePaymentReportingPeriod(period: PaymentReportingPeriod):
  | { valid: true }
  | { valid: false; code: string; message: string } {
  const start = parseUtcInstant(period.periodStart);
  if (start === undefined) return { valid: false, code: "INVALID_PAYMENT_RECONCILIATION_PERIOD_START", message: "Enter a valid UTC period start." };
  const end = parseUtcInstant(period.periodEnd);
  if (end === undefined) return { valid: false, code: "INVALID_PAYMENT_RECONCILIATION_PERIOD_END", message: "Enter a valid UTC period end." };
  if (start >= end) return { valid: false, code: "INVALID_PAYMENT_RECONCILIATION_PERIOD_RANGE", message: "Period end must be later than period start." };
  if (end - start > maximumPaymentReportingPeriodDays * 24 * 60 * 60 * 1000) {
    return { valid: false, code: "PAYMENT_RECONCILIATION_PERIOD_TOO_LONG", message: "The reporting period cannot exceed 31 days." };
  }
  return { valid: true };
}

export function utcInputValueToInstant(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const result = `${value}:00Z`;
  return parseUtcInstant(result) === undefined ? undefined : result;
}

export function utcInstantToInputValue(value: string): string {
  const parsed = parseUtcInstant(value);
  if (parsed === undefined) return "";
  return new Date(parsed).toISOString().slice(0, 16);
}

export function defaultPaymentReportingPeriod(now = new Date()): PaymentReportingPeriod {
  const end = new Date(now);
  end.setUTCSeconds(0, 0);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export function parsePaymentReconciliationReport(value: unknown): PaymentReconciliationReport {
  const record = object(value, "report");
  if (record.contractVersion !== paymentReconciliationContractVersion) throw malformed("PAYMENT_REPORT_CONTRACT_VERSION_UNSUPPORTED", "The payment report contract version is not supported.");
  if (record.reportId !== paymentReconciliationReportId) throw malformed("PAYMENT_REPORT_ID_UNSUPPORTED", "The payment report identifier is not supported.");
  const availabilityValue = availability(record.availability);
  const report: PaymentReconciliationReport = {
    contractVersion: paymentReconciliationContractVersion,
    reportId: paymentReconciliationReportId,
    requestedScope: parseScope(record.requestedScope, "requestedScope"),
    effectiveScope: parseScope(record.effectiveScope, "effectiveScope"),
    periodStart: timestamp(record.periodStart, "periodStart"),
    periodEnd: timestamp(record.periodEnd, "periodEnd"),
    generatedAt: timestamp(record.generatedAt, "generatedAt"),
    dataAsOf: optionalTimestamp(record.dataAsOf, "dataAsOf"),
    availability: availabilityValue,
    freshness: freshness(record.freshness),
    correlationId: uuid(record.correlationId, "correlationId"),
    currencySummaries: array(record.currencySummaries, "currencySummaries").map(parseCurrencySummary),
    paymentAttemptSummaries: array(record.paymentAttemptSummaries, "paymentAttemptSummaries").map(parseStatusSummary),
    confirmedPaymentSummaries: array(record.confirmedPaymentSummaries, "confirmedPaymentSummaries").map(parseStatusSummary),
    canonicalStatusSummaries: array(record.canonicalStatusSummaries, "canonicalStatusSummaries").map(parseCanonicalStatusSummary),
    channelSummaries: array(record.channelSummaries, "channelSummaries").map(parseChannelSummary),
    providerSummaries: array(record.providerSummaries, "providerSummaries").map(parseProviderSummary),
    internalReconciliationSummaries: array(record.internalReconciliationSummaries, "internalReconciliationSummaries").map(parseReconciliationSummary),
    warnings: stringArray(record.warnings, "warnings"),
    limitations: stringArray(record.limitations, "limitations"),
    sourceAuthority: text(record.sourceAuthority, "sourceAuthority")
  };
  if (availabilityValue === "UNAVAILABLE" && hasReportValues(report)) {
    throw malformed("PAYMENT_REPORT_UNAVAILABLE_VALUES_REJECTED", "An unavailable payment report cannot contain authoritative values.");
  }
  return report;
}

function parseCurrencySummary(value: unknown, index: number): PaymentCurrencySummary {
  const row = object(value, `currencySummaries[${index}]`);
  return { currencyCode: currency(row.currencyCode), attemptCount: count(row.attemptCount), attemptedAmount: money(row.attemptedAmount), confirmedCount: count(row.confirmedCount), confirmedAmount: money(row.confirmedAmount) };
}

function parseStatusSummary(value: unknown, index: number): PaymentStatusSummary {
  const row = object(value, `statusSummaries[${index}]`);
  return { status: text(row.status, "status"), currencyCode: currency(row.currencyCode), count: count(row.count), amount: money(row.amount) };
}

function parseCanonicalStatusSummary(value: unknown, index: number): PaymentCanonicalStatusSummary {
  const row = object(value, `canonicalStatusSummaries[${index}]`);
  return { recordType: text(row.recordType, "recordType"), status: text(row.status, "status"), currencyCode: currency(row.currencyCode), count: count(row.count), amount: money(row.amount) };
}

function parseChannelSummary(value: unknown, index: number): PaymentChannelSummary {
  const row = object(value, `channelSummaries[${index}]`);
  return { channelCode: text(row.channelCode, "channelCode"), channelType: text(row.channelType, "channelType"), currencyCode: currency(row.currencyCode), attemptCount: count(row.attemptCount), attemptedAmount: money(row.attemptedAmount), confirmedCount: count(row.confirmedCount), confirmedAmount: money(row.confirmedAmount) };
}

function parseProviderSummary(value: unknown, index: number): PaymentProviderSummary {
  const row = object(value, `providerSummaries[${index}]`);
  return { providerCode: text(row.providerCode, "providerCode"), currencyCode: currency(row.currencyCode), attemptCount: count(row.attemptCount), attemptedAmount: money(row.attemptedAmount), confirmedCount: count(row.confirmedCount), confirmedAmount: money(row.confirmedAmount), verifiedOutcomeCount: count(row.verifiedOutcomeCount), verifiedOutcomeAmount: money(row.verifiedOutcomeAmount) };
}

const reconciliationCategories = new Set<ReconciliationCategory>([
  "ATTEMPT_CONFIRMATION_AMOUNT_MISMATCH",
  "ATTEMPT_CONFIRMATION_CURRENCY_MISMATCH",
  "DUPLICATE_AUTHORITATIVE_PROVIDER_REFERENCE",
  "CONFIRMED_OUTCOME_WITHOUT_CONFIRMATION",
  "CONFIRMATION_ATTEMPT_STATUS_INCONSISTENT"
]);

function parseReconciliationSummary(value: unknown, index: number): InternalReconciliationSummary {
  const row = object(value, `internalReconciliationSummaries[${index}]`);
  const categoryId = text(row.categoryId, "categoryId") as ReconciliationCategory;
  if (!reconciliationCategories.has(categoryId)) throw malformed("PAYMENT_REPORT_RECONCILIATION_CATEGORY_UNSUPPORTED", "The payment report contains an unsupported reconciliation category.");
  return {
    categoryId,
    availability: availability(row.availability),
    count: row.count === null || row.count === undefined ? undefined : count(row.count),
    amounts: array(row.amounts, "amounts").map((entry, amountIndex) => {
      const amount = object(entry, `amounts[${amountIndex}]`);
      return { currencyCode: currency(amount.currencyCode), amount: money(amount.amount) };
    }),
    definition: text(row.definition, "definition"),
    monetaryTreatment: text(row.monetaryTreatment, "monetaryTreatment"),
    limitations: stringArray(row.limitations, "limitations")
  };
}

function assertResponseBinding(report: PaymentReconciliationReport, scope: Pick<DashboardScope, "scopeType" | "scopeReference">, period: PaymentReportingPeriod): void {
  if (report.requestedScope.scopeType !== scope.scopeType || report.requestedScope.scopeReference.toLowerCase() !== scope.scopeReference.toLowerCase()) {
    throw malformed("PAYMENT_REPORT_SCOPE_RESPONSE_MISMATCH", "The payment report does not match the requested scope.");
  }
  if (Date.parse(report.periodStart) !== Date.parse(period.periodStart) || Date.parse(report.periodEnd) !== Date.parse(period.periodEnd)) {
    throw malformed("PAYMENT_REPORT_PERIOD_RESPONSE_MISMATCH", "The payment report does not match the requested period.");
  }
}

function hasReportValues(report: PaymentReconciliationReport): boolean {
  return report.currencySummaries.length > 0 || report.paymentAttemptSummaries.length > 0 || report.confirmedPaymentSummaries.length > 0 || report.canonicalStatusSummaries.length > 0 || report.channelSummaries.length > 0 || report.providerSummaries.length > 0 || report.internalReconciliationSummaries.some((item) => (item.count ?? 0) > 0 || item.amounts.length > 0);
}

function parseScope(value: unknown, field: string): DashboardScope {
  const row = object(value, field);
  const type = row.scopeType;
  if (type !== "SITE" && type !== "SITE_GROUP") throw malformed("PAYMENT_REPORT_SCOPE_TYPE_UNSUPPORTED", "The payment report contains an unsupported scope type.");
  return { scopeType: type, scopeReference: uuid(row.scopeReference, `${field}.scopeReference`), displayName: text(row.displayName, `${field}.displayName`) };
}

const availabilityValues = new Set<DashboardAvailability>(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);
const freshnessValues = new Set<DashboardFreshness>(["CURRENT", "STALE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]);

function availability(value: unknown): DashboardAvailability {
  if (typeof value === "string" && availabilityValues.has(value as DashboardAvailability)) return value as DashboardAvailability;
  throw malformed("PAYMENT_REPORT_AVAILABILITY_UNSUPPORTED", "The payment report availability is unsupported.");
}

function freshness(value: unknown): DashboardFreshness {
  if (typeof value === "string" && freshnessValues.has(value as DashboardFreshness)) return value as DashboardFreshness;
  throw malformed("PAYMENT_REPORT_FRESHNESS_UNSUPPORTED", "The payment report freshness is unsupported.");
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformed("PAYMENT_REPORT_RESPONSE_MALFORMED", `The payment report ${field} is malformed.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw malformed("PAYMENT_REPORT_RESPONSE_MALFORMED", `The payment report ${field} is malformed.`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw malformed("PAYMENT_REPORT_RESPONSE_MALFORMED", `The payment report ${field} is malformed.`);
  return value;
}

function stringArray(value: unknown, field: string): string[] { return array(value, field).map((entry) => text(entry, field)); }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw malformed("PAYMENT_REPORT_COUNT_INVALID", "The payment report contains an invalid count."); return value; }
function money(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw malformed("PAYMENT_REPORT_AMOUNT_INVALID", "The payment report contains an invalid amount."); return value; }
function currency(value: unknown): string { const result = text(value, "currencyCode").toUpperCase(); if (!/^[A-Z]{3}$/.test(result)) throw malformed("PAYMENT_REPORT_CURRENCY_INVALID", "The payment report contains an invalid currency."); return result; }
function uuid(value: unknown, field: string): string { const result = text(value, field); if (!isUuid(result)) throw malformed("PAYMENT_REPORT_REFERENCE_INVALID", `The payment report ${field} is malformed.`); return result; }
function isUuid(value: string): boolean { return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value); }
function parseUtcInstant(value: string): number | undefined { if (!/(Z|\+00:00)$/i.test(value)) return undefined; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined; }
function timestamp(value: unknown, field: string): string { const result = text(value, field); if (parseUtcInstant(result) === undefined) throw malformed("PAYMENT_REPORT_TIMESTAMP_INVALID", `The payment report ${field} timestamp is malformed.`); return result; }
function optionalTimestamp(value: unknown, field: string): string | undefined { return value === null || value === undefined ? undefined : timestamp(value, field); }
function malformed(code: string, message: string): ManagementPlatformUiError { return createUiError("malformed-response", code, message, undefined, undefined, false, false); }

export type PaymentReconciliationScenarioName = "current" | "site-group" | "partial" | "unavailable" | "no-activity" | "feature-disabled" | "permission-denied" | "scope-denied" | "malformed" | "retryable-failure";

export interface PaymentReconciliationScenario { name: PaymentReconciliationScenarioName; client: PaymentReconciliationReportingClient; }

export function resolvePaymentReconciliationScenario(enabled: boolean, search: string): PaymentReconciliationScenario | undefined {
  if (!import.meta.env.DEV || !enabled) return undefined;
  const requested = new URLSearchParams(search).get("mpPaymentScenario") as PaymentReconciliationScenarioName | null;
  const names: PaymentReconciliationScenarioName[] = ["current", "site-group", "partial", "unavailable", "no-activity", "feature-disabled", "permission-denied", "scope-denied", "malformed", "retryable-failure"];
  if (!requested || !names.includes(requested)) return undefined;
  return { name: requested, client: paymentScenarioClient(requested) };
}

function paymentScenarioClient(name: PaymentReconciliationScenarioName): PaymentReconciliationReportingClient {
  return { getSummary: async (scope, period) => {
    if (name === "feature-disabled") throw createUiError("feature-disabled", "MANAGEMENT_PAYMENT_RECONCILIATION_REPORTING_DISABLED", "Payment and reconciliation reporting is not enabled.", "94000000-0000-4000-8000-000000000401", 503);
    if (name === "permission-denied") throw createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "You do not have permission for this action.", "94000000-0000-4000-8000-000000000402", 403);
    if (name === "scope-denied") throw createUiError("not-found", "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "The requested resource is unavailable.", "94000000-0000-4000-8000-000000000403", 404);
    if (name === "retryable-failure") throw createUiError("integration-unavailable", "PAYMENT_RECONCILIATION_SOURCE_UNAVAILABLE", "Central PMS is unavailable.", "94000000-0000-4000-8000-000000000404", 503, true);
    if (name === "malformed") return parsePaymentReconciliationReport({ contractVersion: paymentReconciliationContractVersion });
    const fixture = paymentReconciliationFixture(scope, period, name);
    return fixture;
  } };
}

export function paymentReconciliationFixture(scope: Pick<DashboardScope, "scopeType" | "scopeReference">, period: PaymentReportingPeriod, name: PaymentReconciliationScenarioName = "current"): PaymentReconciliationReport {
  const noActivity = name === "no-activity";
  const partial = name === "partial";
  const unavailable = name === "unavailable";
  const displayName = scope.scopeType === "SITE" ? "Development Site Alpha" : "Development Site Group";
  const values = unavailable || noActivity ? [] : [
    { currencyCode: "PHP", attemptCount: 18, attemptedAmount: 12500.75, confirmedCount: 14, confirmedAmount: 9700.25 },
    { currencyCode: "USD", attemptCount: 3, attemptedAmount: 42.5, confirmedCount: 2, confirmedAmount: 30 }
  ];
  return {
    contractVersion: paymentReconciliationContractVersion,
    reportId: paymentReconciliationReportId,
    requestedScope: { ...scope, displayName },
    effectiveScope: { ...scope, displayName },
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    generatedAt: "2026-08-22T03:00:00Z",
    dataAsOf: noActivity || unavailable ? undefined : "2026-08-22T02:58:00Z",
    availability: unavailable ? "UNAVAILABLE" : partial ? "PARTIAL" : "AVAILABLE",
    freshness: unavailable ? "UNAVAILABLE" : noActivity ? "NOT_APPLICABLE" : partial ? "PARTIAL" : "CURRENT",
    correlationId: "94000000-0000-4000-8000-000000000400",
    currencySummaries: values,
    paymentAttemptSummaries: values.length ? [{ status: "PENDING", currencyCode: "PHP", count: 4, amount: 2800.5 }, { status: "OTHER", currencyCode: "USD", count: 1, amount: 12.5 }] : [],
    confirmedPaymentSummaries: values.length ? [{ status: "RECORDED", currencyCode: "PHP", count: 14, amount: 9700.25 }] : [],
    canonicalStatusSummaries: values.length ? [{ recordType: "PAYMENT_ATTEMPT", status: "PENDING", currencyCode: "PHP", count: 4, amount: 2800.5 }] : [],
    channelSummaries: values.length ? [{ channelCode: "WEBPAY", channelType: "DIGITAL", currencyCode: "PHP", attemptCount: 12, attemptedAmount: 9000.25, confirmedCount: 10, confirmedAmount: 7600.25 }, { channelCode: "APT_CASH", channelType: "CASH", currencyCode: "PHP", attemptCount: 6, attemptedAmount: 3500.5, confirmedCount: 4, confirmedAmount: 2100 }] : [],
    providerSummaries: values.length ? [{ providerCode: "MAYA", currencyCode: "PHP", attemptCount: 12, attemptedAmount: 9000.25, confirmedCount: 10, confirmedAmount: 7600.25, verifiedOutcomeCount: 10, verifiedOutcomeAmount: 7600.25 }] : [],
    internalReconciliationSummaries: unavailable ? [] : reconciliationFixture(noActivity),
    warnings: noActivity ? ["NO_PAYMENT_ACTIVITY_IN_PERIOD"] : partial ? ["Some expected source dimensions are unavailable."] : unavailable ? ["The canonical payment source is unavailable."] : [],
    limitations: ["This report proves internal Central PMS consistency only.", "Provider settlement, payout, bank deposit, cash custody, fees, refunds, chargebacks, disputes, and fiscal remittance are unavailable."],
    sourceAuthority: "CENTRAL_PMS_CANONICAL_PAYMENT_RECORDS"
  };
}

function reconciliationFixture(empty: boolean): InternalReconciliationSummary[] {
  const categories = [...reconciliationCategories];
  return categories.map((categoryId, index) => ({ categoryId, availability: "AVAILABLE", count: empty ? 0 : index, amounts: index === 0 && !empty ? [{ currencyCode: "PHP", amount: 15.25 }] : [], definition: `Authoritative definition for ${categoryId}.`, monetaryTreatment: "Amounts remain separated by currency.", limitations: [] }));
}
