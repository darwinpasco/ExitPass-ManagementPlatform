import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardScopeOptions } from "./DashboardPage";
import type { DashboardAvailability, DashboardFreshness } from "./dashboardReporting";
import {
  defaultPaymentReportingPeriod,
  type InternalReconciliationSummary,
  type PaymentReconciliationReport,
  type PaymentReconciliationReportingClient,
  type PaymentReportingPeriod,
  utcInputValueToInstant,
  utcInstantToInputValue,
  validatePaymentReportingPeriod
} from "./paymentReconciliationReporting";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface PaymentReconciliationPageProps {
  client: PaymentReconciliationReportingClient;
  authorizedSites: readonly ManagementPlatformSite[];
  authorizedSiteGroupReferences: readonly string[];
  currentSite?: ManagementPlatformSite;
  initialPeriod?: PaymentReportingPeriod;
}

export function PaymentReconciliationPage({ client, authorizedSites, authorizedSiteGroupReferences, currentSite, initialPeriod }: PaymentReconciliationPageProps) {
  const scopes = useMemo(() => dashboardScopeOptions(authorizedSites, authorizedSiteGroupReferences), [authorizedSites, authorizedSiteGroupReferences]);
  const initialScope = scopes.find((scope) => scope.scopeType === "SITE" && scope.scopeReference === currentSite?.siteId) ?? scopes[0];
  const initial = useMemo(() => initialPeriod ?? defaultPaymentReportingPeriod(), [initialPeriod]);
  const [scopeKey, setScopeKey] = useState(initialScope ? key(initialScope) : "");
  const [periodStartInput, setPeriodStartInput] = useState(() => utcInstantToInputValue(initial.periodStart));
  const [periodEndInput, setPeriodEndInput] = useState(() => utcInstantToInputValue(initial.periodEnd));
  const [activePeriod, setActivePeriod] = useState(initial);
  const [periodError, setPeriodError] = useState<string>();
  const [report, setReport] = useState<PaymentReconciliationReport>();
  const [error, setError] = useState<ManagementPlatformUiError>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const periodStartRef = useRef<HTMLInputElement>(null);
  const selectedScope = scopes.find((scope) => key(scope) === scopeKey);

  useEffect(() => {
    if (scopeKey && scopes.some((scope) => key(scope) === scopeKey)) return;
    setScopeKey(scopes[0] ? key(scopes[0]) : "");
  }, [scopeKey, scopes]);

  const load = useCallback(async (retainPrevious: boolean) => {
    if (!selectedScope) return;
    request.current.controller?.abort();
    const controller = new AbortController();
    const sequence = request.current.sequence + 1;
    request.current = { sequence, controller };
    setError(undefined);
    if (retainPrevious && report) setRefreshing(true);
    else { setLoading(true); setReport(undefined); }

    try {
      const value = await client.getSummary(selectedScope, activePeriod, controller.signal);
      if (request.current.sequence !== sequence || controller.signal.aborted) return;
      setReport(value);
    } catch (caught) {
      if (request.current.sequence !== sequence || controller.signal.aborted) return;
      setError(asUiError(caught));
    } finally {
      if (request.current.sequence === sequence) { setLoading(false); setRefreshing(false); }
    }
  }, [activePeriod, client, report, selectedScope]);

  useEffect(() => {
    if (!selectedScope) {
      request.current.controller?.abort();
      setReport(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    void load(false);
    return () => request.current.controller?.abort();
  }, [scopeKey, activePeriod.periodStart, activePeriod.periodEnd]);

  function submitPeriod(event: FormEvent) {
    event.preventDefault();
    const periodStart = utcInputValueToInstant(periodStartInput);
    const periodEnd = utcInputValueToInstant(periodEndInput);
    const candidate = { periodStart: periodStart ?? "", periodEnd: periodEnd ?? "" };
    const validation = validatePaymentReportingPeriod(candidate);
    if (!validation.valid) {
      setPeriodError(validation.message);
      periodStartRef.current?.focus();
      return;
    }
    setPeriodError(undefined);
    if (candidate.periodStart === activePeriod.periodStart && candidate.periodEnd === activePeriod.periodEnd) void load(Boolean(report));
    else setActivePeriod(candidate);
  }

  return (
    <div className="paymentReportPage">
      <section className="panel paymentReportHeader" aria-labelledby="payment-report-title">
        <div className="paymentReportTitleRow">
          <div>
            <p className="eyebrow">Management reporting</p>
            <h2 id="payment-report-title">Payment and Reconciliation</h2>
            <p>Internal payment activity and consistency reporting from Central PMS.</p>
          </div>
          {report && <ReportStatus availability={report.availability} freshness={report.freshness} />}
        </div>

        <form className="paymentReportFilters" onSubmit={submitPeriod} aria-describedby="payment-period-help">
          <label>
            <span>Reporting scope</span>
            <select value={scopeKey} disabled={scopes.length === 0} onChange={(event) => setScopeKey(event.target.value)}>
              {scopes.length === 0 && <option value="">No authorized reporting scope</option>}
              {scopes.map((scope) => <option key={key(scope)} value={key(scope)}>{scope.label}</option>)}
            </select>
          </label>
          <label>
            <span>Period start (UTC)</span>
            <input ref={periodStartRef} type="datetime-local" step="60" value={periodStartInput} onChange={(event) => setPeriodStartInput(event.target.value)} aria-invalid={Boolean(periodError)} />
          </label>
          <label>
            <span>Period end (UTC)</span>
            <input type="datetime-local" step="60" value={periodEndInput} onChange={(event) => setPeriodEndInput(event.target.value)} aria-invalid={Boolean(periodError)} />
          </label>
          <button className="primaryButton" type="submit" disabled={!selectedScope || loading || refreshing}>{refreshing ? "Refreshing" : report ? "Refresh report" : "Run report"}</button>
        </form>
        <p id="payment-period-help" className="scopeContext">UTC interval is half-open: period start is included and period end is excluded. Maximum range: 31 days.</p>
        {periodError && <p className="fieldError" role="alert">{periodError}</p>}
        {report && (
          <dl className="dashboardTimestamps paymentReportMetadata">
            <div><dt>Requested period</dt><dd>{formatUtc(report.periodStart)} to {formatUtc(report.periodEnd)} (end excluded)</dd></div>
            <div><dt>Generated at</dt><dd>{formatUtc(report.generatedAt)}</dd></div>
            <div><dt>Data as of</dt><dd>{report.dataAsOf ? formatUtc(report.dataAsOf) : "No activity timestamp available"}</dd></div>
            <div><dt>Effective scope</dt><dd>{report.effectiveScope.displayName} ({scopeLabel(report.effectiveScope.scopeType)})</dd></div>
            <div><dt>Source</dt><dd>{sourceLabel(report.sourceAuthority)}</dd></div>
          </dl>
        )}
      </section>

      {!selectedScope && <ReportState title="No authorized reporting scope" message="Select an authorized Site or Site Group before requesting this report." tone="warning" />}
      {loading && <ReportState title="Loading report" message="Reading authoritative payment aggregates from Central PMS." />}
      {error && <ReportError error={error} retained={Boolean(report)} onRetry={error.retryable && selectedScope ? () => void load(Boolean(report)) : undefined} />}
      {refreshing && report && <div className="dashboardRefreshState" role="status">Refreshing. Previously loaded values remain visible and retain their original timestamps.</div>}
      {error && report && <div className="dashboardRetainedState" role="status">Previously loaded report. It is not represented as freshly loaded.</div>}

      {report && (
        <>
          <ReportMessages warnings={report.warnings} limitations={report.limitations} />
          {report.availability === "UNAVAILABLE" ? (
            <ReportState title="Report unavailable" message="Central PMS could not provide authoritative payment reporting values for this request." tone="warning" />
          ) : isNoActivity(report) ? (
            <ReportState title="No payment activity" message="No payment activity was recorded for the selected scope and period." />
          ) : (
            <div className="paymentReportSections">
              <CurrencySection report={report} />
              <StatusSection title="Payment attempt statuses" caption="Canonical payment attempt status aggregates" rows={report.paymentAttemptSummaries} />
              <StatusSection title="Confirmed payment statuses" caption="Authoritative confirmation status aggregates" rows={report.confirmedPaymentSummaries} />
              <ChannelSection report={report} />
              <ProviderSection report={report} />
              <ReconciliationSection report={report} />
            </div>
          )}
          <p className="supportReference">Support reference: <code>{report.correlationId}</code></p>
        </>
      )}
    </div>
  );
}

function CurrencySection({ report }: { report: PaymentReconciliationReport }) {
  return <section className="panel paymentReportSection" aria-labelledby="currency-summary-title"><div className="sectionHeader"><div><p className="eyebrow">PHP totals</p><h3 id="currency-summary-title">Payment activity summary</h3></div></div><div className="paymentCurrencyGrid">{report.currencySummaries.map((row) => <article className="paymentCurrencyCard" key={row.currencyCode}><h4>{row.currencyCode}</h4><dl><div><dt>Payment attempts</dt><dd>{row.attemptCount.toLocaleString()}</dd></div><div><dt>Attempted amount</dt><dd>{formatMoney(row.attemptedAmount)}</dd></div><div><dt>Confirmed payments</dt><dd>{row.confirmedCount.toLocaleString()}</dd></div><div><dt>Confirmed payment amount</dt><dd>{formatMoney(row.confirmedAmount)}</dd></div></dl></article>)}</div><p className="reportBoundary">All amounts are reported in PHP. Confirmed payment values do not prove settlement, deposit, payout, or cash custody.</p></section>;
}

function StatusSection({ title, caption, rows }: { title: string; caption: string; rows: PaymentReconciliationReport["paymentAttemptSummaries"] }) {
  return <section className="panel paymentReportSection"><h3>{title}</h3><ResponsiveTable caption={caption} headings={["Status", "Count", "Amount"]} rows={rows.map((row) => [statusLabel(row.status), row.count.toLocaleString(), formatMoney(row.amount)])} empty="No status aggregates were returned." /></section>;
}

function ChannelSection({ report }: { report: PaymentReconciliationReport }) {
  return <section className="panel paymentReportSection"><h3>Payment channels</h3><ResponsiveTable caption="Canonical payment channel aggregates" headings={["Channel", "Type", "Attempts", "Attempted amount", "Confirmed", "Confirmed amount"]} rows={report.channelSummaries.map((row) => [channelLabel(row.channelCode), channelTypeLabel(row.channelType), row.attemptCount.toLocaleString(), formatMoney(row.attemptedAmount), row.confirmedCount.toLocaleString(), formatMoney(row.confirmedAmount)])} empty="No channel information is available." /><p className="reportBoundary">Cash channels are operational payment records and are not provider settlement or cash-custody confirmation.</p></section>;
}

function ProviderSection({ report }: { report: PaymentReconciliationReport }) {
  return <section className="panel paymentReportSection"><h3>Payment providers</h3><ResponsiveTable caption="Canonical provider aggregates" headings={["Provider", "Attempts", "Confirmed", "Verified outcomes"]} rows={report.providerSummaries.map((row) => [safeCodeLabel(row.providerCode), row.attemptCount.toLocaleString(), row.confirmedCount.toLocaleString(), row.verifiedOutcomeCount.toLocaleString()])} empty="Provider information is not available for the selected activity." /><p className="reportBoundary">Provider information describes canonical Central PMS records only and does not prove settlement.</p></section>;
}

function ReconciliationSection({ report }: { report: PaymentReconciliationReport }) {
  const findings = report.internalReconciliationSummaries.filter((row) => (row.count ?? 0) > 0);
  const fullCoverage = report.availability === "AVAILABLE" && report.internalReconciliationSummaries.every((row) => row.availability === "AVAILABLE");
  return <section className="panel paymentReportSection reconciliationSection" aria-labelledby="reconciliation-title"><div className="sectionHeader"><div><p className="eyebrow">Central PMS consistency checks</p><h3 id="reconciliation-title">Internal reconciliation findings</h3></div></div>{findings.length === 0 ? <p className={fullCoverage ? "reconciliationClear" : "reconciliationQualified"}>{fullCoverage ? "No internal mismatches were detected for the available Central PMS sources and selected period." : "No internal mismatches are shown, but source coverage is partial or unavailable. This is not an all-clear result."}</p> : <div className="reconciliationGrid">{report.internalReconciliationSummaries.map((row) => <ReconciliationCard key={row.categoryId} row={row} />)}</div>}<p className="reportBoundary">These checks prove internal consistency only. They do not establish provider settlement or financial finality.</p></section>;
}

function ReconciliationCard({ row }: { row: InternalReconciliationSummary }) {
  return <article className={`reconciliationCard ${(row.count ?? 0) > 0 ? "hasFinding" : ""}`}><div><h4>{reconciliationLabel(row.categoryId)}</h4><span className="dashboardBadge neutral">{row.availability === "AVAILABLE" ? "Available" : availabilityLabel(row.availability)}</span></div><strong>{row.count === undefined ? "Not available" : `${row.count.toLocaleString()} finding${row.count === 1 ? "" : "s"}`}</strong><p>{row.definition}</p>{row.amounts.map((amount) => <p key={amount.currencyCode}><b>Amount:</b> {formatMoney(amount.amount)}</p>)}<p className="sourceLabel">{row.monetaryTreatment}</p>{row.limitations.map((limitation) => <p className="sourceLabel" key={limitation}>{limitation}</p>)}</article>;
}

function ResponsiveTable({ caption, headings, rows, empty }: { caption: string; headings: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="sectionUnavailable">{empty}</p>;
  return <div className="paymentTableScroll"><table className="paymentReportTable"><caption>{caption}</caption><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((value, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row">{value}</th> : <td key={cellIndex}>{value}</td>)}</tr>)}</tbody></table></div>;
}

function ReportStatus({ availability, freshness }: { availability: DashboardAvailability; freshness: DashboardFreshness }) {
  return <div className="dashboardStatusPair" aria-label="Report status"><span className={`dashboardBadge ${availability.toLowerCase().replace("_", "")}`}>Availability: {availabilityLabel(availability)}</span><span className={`dashboardBadge ${freshness.toLowerCase().replace("_", "")}`}>Freshness: {freshnessLabel(freshness)}</span></div>;
}

function ReportMessages({ warnings, limitations }: { warnings: string[]; limitations: string[] }) {
  if (warnings.length === 0 && limitations.length === 0) return null;
  return <div className="dashboardMessages">{warnings.length > 0 && <section className="dashboardWarning"><h3>Warnings</h3><ul>{warnings.map((item) => <li key={item}>{warningLabel(item)}</li>)}</ul></section>}{limitations.length > 0 && <section className="dashboardLimitation"><h3>Limitations</h3><ul>{limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>}</div>;
}

function ReportError({ error, retained, onRetry }: { error: ManagementPlatformUiError; retained: boolean; onRetry?: () => void }) {
  const presentation = errorPresentation(error);
  return <section className="dashboardError" role="alert" aria-label={presentation.title}><h2>{presentation.title}</h2><p>{presentation.message}</p>{retained && <p>Previously loaded values remain visible for reference only.</p>}{error.correlationId && <p>Support reference: <code>{error.correlationId}</code></p>}{onRetry && <button type="button" className="secondaryButton" onClick={onRetry}>Retry report</button>}</section>;
}

function ReportState({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" }) { return <section className={`stateMessage ${tone}`} role="status" aria-label={title}><h2>{title}</h2><p>{message}</p></section>; }
function isNoActivity(report: PaymentReconciliationReport): boolean { return report.currencySummaries.length === 0 && report.paymentAttemptSummaries.length === 0 && report.confirmedPaymentSummaries.length === 0 && report.channelSummaries.length === 0; }
function key(scope: { scopeType: string; scopeReference: string }): string { return `${scope.scopeType}:${scope.scopeReference}`; }
function scopeLabel(value: string): string { return value === "SITE_GROUP" ? "Site Group" : "Site"; }
function availabilityLabel(value: DashboardAvailability): string { return ({ AVAILABLE: "Available", PARTIAL: "Partial", UNAVAILABLE: "Unavailable", NOT_APPLICABLE: "Not applicable" } as const)[value]; }
function freshnessLabel(value: DashboardFreshness): string { return ({ CURRENT: "Current", STALE: "Stale", PARTIAL: "Mixed freshness", UNAVAILABLE: "Unavailable", NOT_APPLICABLE: "Not applicable" } as const)[value]; }
function sourceLabel(value: string): string { return value === "CENTRAL_PMS_CANONICAL_PAYMENT_RECORDS" ? "Central PMS canonical payment records" : safeCodeLabel(value); }
function warningLabel(value: string): string { return value === "NO_PAYMENT_ACTIVITY_IN_PERIOD" ? "No payment activity was recorded in this period." : value; }
function formatUtc(value: string): string { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC"; }
export function formatMoney(value: number): string { return `₱${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 20 })}`; }
function safeCodeLabel(value: string): string { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusLabel(value: string): string { return value === "OTHER" || value === "UNKNOWN" ? value : safeCodeLabel(value); }
function channelLabel(value: string): string { return ({ WEBPAY: "WebPay", APT_CASH: "APT cash" } as Record<string, string>)[value] ?? safeCodeLabel(value); }
function channelTypeLabel(value: string): string { return value === "CASH" ? "Cash" : value === "DIGITAL" ? "Digital payment" : safeCodeLabel(value); }
function reconciliationLabel(value: InternalReconciliationSummary["categoryId"]): string { return ({ ATTEMPT_CONFIRMATION_AMOUNT_MISMATCH: "Amount mismatch", ATTEMPT_CONFIRMATION_CURRENCY_MISMATCH: "Currency mismatch", DUPLICATE_AUTHORITATIVE_PROVIDER_REFERENCE: "Duplicate provider reference", CONFIRMED_OUTCOME_WITHOUT_CONFIRMATION: "Confirmed outcome without confirmation", CONFIRMATION_ATTEMPT_STATUS_INCONSISTENT: "Confirmation and attempt status inconsistency" } as const)[value]; }
function asUiError(value: unknown): ManagementPlatformUiError { return value && typeof value === "object" && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "MANAGEMENT_PAYMENT_REPORT_UNEXPECTED_FAILURE", message: "The report could not be read safely.", retryable: false, mutationUncertain: false }; }
function errorPresentation(error: ManagementPlatformUiError): { title: string; message: string } {
  if (error.kind === "authentication-required") return { title: "Authentication required", message: "Your session ended. Sign in again to continue." };
  if (error.kind === "permission-denied") return { title: "Permission denied", message: "Your authenticated account cannot access this report." };
  if (error.kind === "not-found" || error.code === "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED") return { title: "Reporting scope unavailable", message: "The selected scope is unavailable or not authorized." };
  if (error.kind === "feature-disabled" || error.code === "MANAGEMENT_PAYMENT_RECONCILIATION_REPORTING_DISABLED") return { title: "Report disabled", message: "Payment and reconciliation reporting is not enabled for this environment." };
  if (error.code === "PAYMENT_RECONCILIATION_SOURCE_UNAVAILABLE") return { title: "Report unavailable", message: "The authoritative payment source is temporarily unavailable." };
  if (error.kind === "validation") return { title: "Invalid report request", message: error.message };
  if (error.kind === "malformed-response") return { title: "Report could not be read", message: "Central PMS returned a response that could not be validated safely." };
  return { title: "Report request failed", message: "The payment report could not be loaded safely." };
}
