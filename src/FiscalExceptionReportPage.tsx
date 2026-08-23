import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardScopeOptions } from "./DashboardPage";
import {
  defaultFiscalReportingPeriod,
  fiscalInstantToUtcInputValue,
  type FiscalExceptionReport,
  type FiscalExceptionReportingClient,
  type FiscalExceptionSummary,
  type FiscalLifecycleState,
  type FiscalReportingPeriod,
  utcInputValueToFiscalInstant,
  validateFiscalReportingPeriod
} from "./fiscalExceptionReporting";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface FiscalExceptionReportPageProps {
  client: FiscalExceptionReportingClient;
  authorizedSites: readonly ManagementPlatformSite[];
  authorizedSiteGroupReferences: readonly string[];
  currentSite?: ManagementPlatformSite;
  initialPeriod?: FiscalReportingPeriod;
}

export function FiscalExceptionReportPage({ client, authorizedSites, authorizedSiteGroupReferences, currentSite, initialPeriod }: FiscalExceptionReportPageProps) {
  const scopes = useMemo(() => dashboardScopeOptions(authorizedSites, authorizedSiteGroupReferences), [authorizedSiteGroupReferences, authorizedSites]);
  const initialScope = scopes.find((scope) => scope.scopeType === "SITE" && scope.scopeReference === currentSite?.siteId) ?? scopes[0];
  const initial = useMemo(() => initialPeriod ?? defaultFiscalReportingPeriod(), [initialPeriod]);
  const [scopeKey, setScopeKey] = useState(initialScope ? key(initialScope) : "");
  const [periodStartInput, setPeriodStartInput] = useState(() => fiscalInstantToUtcInputValue(initial.periodStart));
  const [periodEndInput, setPeriodEndInput] = useState(() => fiscalInstantToUtcInputValue(initial.periodEnd));
  const [activePeriod, setActivePeriod] = useState(initial);
  const [periodError, setPeriodError] = useState<string>();
  const [report, setReport] = useState<FiscalExceptionReport>();
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
    const candidate = {
      periodStart: utcInputValueToFiscalInstant(periodStartInput) ?? "",
      periodEnd: utcInputValueToFiscalInstant(periodEndInput) ?? ""
    };
    const validation = validateFiscalReportingPeriod(candidate);
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
    <div className="paymentReportPage fiscalReportPage">
      <section className="panel paymentReportHeader" aria-labelledby="fiscal-report-title">
        <div className="paymentReportTitleRow">
          <div>
            <p className="eyebrow">Fiscal exception reporting</p>
            <h2 id="fiscal-report-title">Sales Invoice Exceptions</h2>
            <p>Sales Invoice issuance lifecycle and exception summaries from outcomes already persisted in Central PMS.</p>
          </div>
          {report && <FiscalReportStatus availability={report.availability} freshness={report.freshness} />}
        </div>

        <form className="paymentReportFilters" onSubmit={submitPeriod} aria-describedby="fiscal-period-help">
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
        <p id="fiscal-period-help" className="scopeContext">UTC interval is half-open: period start is included and period end is excluded. Maximum range: 31 days.</p>
        {periodError && <p className="fieldError" role="alert">{periodError}</p>}
        {report && <ReportMetadata report={report} />}
      </section>

      {!selectedScope && <ReportState title="No authorized reporting scope" message="Select an authorized Site or Site Group before requesting this report." tone="warning" />}
      {loading && <ReportState title="Loading report" message="Reading persisted Sales Invoice issuance information from Central PMS." />}
      {error && <ReportError error={error} retained={Boolean(report)} onRetry={error.retryable && selectedScope ? () => void load(Boolean(report)) : undefined} />}
      {refreshing && report && <div className="dashboardRefreshState" role="status">Refreshing. Previously loaded values remain visible and retain their original timestamps.</div>}
      {error && report && <div className="dashboardRetainedState" role="status" aria-label="Previously loaded report">Previously loaded report. It is not represented as freshly loaded.</div>}

      {report && (
        <>
          <SourceNotice report={report} />
          <ReportMessages warnings={report.warnings} limitations={report.limitations} />
          {report.availability === "NO_ACTIVITY" ? (
            <ReportState title="No Sales Invoice issuance activity" message="No Sales Invoice issuance references were first recorded for the selected scope and period." />
          ) : (
            <div className="paymentReportSections">
              <LifecycleSection report={report} />
              <CurrencySection report={report} />
              <ExceptionSection report={report} />
              <PendingNotice />
            </div>
          )}
          <UnavailableFacts facts={report.unavailableFacts} />
          <p className="supportReference">Support reference: <code>{report.correlationId}</code></p>
        </>
      )}
    </div>
  );
}

function ReportMetadata({ report }: { report: FiscalExceptionReport }) {
  return <dl className="dashboardTimestamps paymentReportMetadata fiscalReportMetadata">
    <div><dt>Requested period</dt><dd>{formatUtc(report.periodStart)} to {formatUtc(report.periodEnd)} (end excluded)</dd></div>
    <div><dt>Generated at</dt><dd>{formatUtc(report.generatedAt)}</dd></div>
    <div><dt>Data as of</dt><dd>{report.dataAsOf ? formatUtc(report.dataAsOf) : "No cohort timestamp available"}</dd></div>
    <div><dt>Effective scope</dt><dd>{report.effectiveScope.displayName} ({scopeLabel(report.effectiveScope.scopeType)})</dd></div>
    <div><dt>Time basis</dt><dd>Issuance reference first recorded at</dd></div>
    <div><dt>Source</dt><dd>Central PMS persisted issuance references</dd></div>
  </dl>;
}

function SourceNotice({ report }: { report: FiscalExceptionReport }) {
  return <section className="panel fiscalSourceNotice" aria-labelledby="fiscal-source-title">
    <div className="sectionHeader"><div><p className="eyebrow">Persisted source coverage</p><h3 id="fiscal-source-title">Partial Central PMS view</h3></div></div>
    <p>This report covers active Sales Invoice issuance references first recorded during the selected period. Statuses reflect the latest persisted Central PMS information available when the report was generated.</p>
    <p>Central PMS does not query Site POS Servers live. Unavailable information is not treated as zero, and data as of means the latest relevant persisted Central PMS timestamp.</p>
    <div className="fiscalSourceGrid">{report.sourceCoverage.map((source) => <article key={source.sourceId}>
      <div><h4>{safeCodeLabel(source.sourceId)}</h4><span className={`dashboardBadge availability-${source.availability.toLowerCase()}`}>Availability: {availabilityLabel(source.availability)}</span></div>
      <p>{source.description}</p>
      <p className="sourceLabel">Data as of: {source.dataAsOf ? formatUtc(source.dataAsOf) : "Not available"}</p>
      {source.limitations.map((item) => <p className="sourceLabel" key={item}>{item}</p>)}
    </article>)}</div>
  </section>;
}

function LifecycleSection({ report }: { report: FiscalExceptionReport }) {
  return <section className="panel paymentReportSection" aria-labelledby="fiscal-lifecycle-title">
    <div className="sectionHeader"><div><p className="eyebrow">Latest persisted state</p><h3 id="fiscal-lifecycle-title">Sales Invoice issuance lifecycle</h3></div></div>
    <ResponsiveTable caption="Sales Invoice issuance lifecycle summary" headings={["Lifecycle state", "Count", "Meaning"]} rows={report.lifecycleSummaries.map((row) => [lifecycleLabel(row.lifecycleState), row.count.toLocaleString(), lifecycleMeaning(row.lifecycleState)])} empty="No lifecycle aggregates were returned." />
    <p className="reportBoundary">Issued means Central PMS holds a persisted authoritative issuance outcome. It does not prove printing, delivery, or customer receipt.</p>
  </section>;
}

function CurrencySection({ report }: { report: FiscalExceptionReport }) {
  return <section className="panel paymentReportSection" aria-labelledby="fiscal-currency-title">
    <div className="sectionHeader"><div><p className="eyebrow">Currency-separated expectations</p><h3 id="fiscal-currency-title">Expected issuance amounts</h3></div></div>
    <div className="paymentCurrencyGrid">{report.currencySummaries.map((row) => <article className="paymentCurrencyCard" key={row.currencyCode}>
      <h4>{row.currencyCode}</h4><dl>
        <div><dt>Expected issuance count</dt><dd>{row.issuanceExpectationCount.toLocaleString()}</dd></div>
        <div><dt>Expected issuance amount</dt><dd>{formatMoney(row.expectedIssuanceAmount, row.currencyCode)}</dd></div>
        <div><dt>Persisted issued outcomes</dt><dd>{row.issuedCount.toLocaleString()}</dd></div>
        <div><dt>Persisted failed states</dt><dd>{row.failedCount.toLocaleString()}</dd></div>
      </dl>
    </article>)}</div>
    <p className="reportBoundary">Expected amounts come from linked payment confirmations. Currencies are never combined or converted, and these values are not issued revenue or BIR-declared sales.</p>
  </section>;
}

function ExceptionSection({ report }: { report: FiscalExceptionReport }) {
  const findingCount = report.exceptionSummaries.reduce((total, row) => total + row.count, 0);
  return <section className="panel paymentReportSection reconciliationSection" aria-labelledby="fiscal-exception-title">
    <div className="sectionHeader"><div><p className="eyebrow">Implemented Central PMS conditions</p><h3 id="fiscal-exception-title">Fiscal exception findings</h3></div></div>
    {findingCount === 0
      ? <p className="reconciliationQualified">No implemented Central PMS exception condition was detected for the selected cohort. Some POS Server facts remain unavailable.</p>
      : <div className="reconciliationGrid">{report.exceptionSummaries.map((row) => <ExceptionCard key={row.categoryId} row={row} />)}</div>}
    <p className="reportBoundary">Findings describe persisted Central PMS coordination state only. They do not certify BIR compliance or prove a fiscal document was printed.</p>
  </section>;
}

function ExceptionCard({ row }: { row: FiscalExceptionSummary }) {
  return <article className={`reconciliationCard ${row.count > 0 ? "hasFinding" : ""}`}>
    <div><h4>{exceptionLabel(row.categoryId)}</h4><span className={`dashboardBadge availability-${row.availability.toLowerCase()}`}>Availability: {availabilityLabel(row.availability)}</span></div>
    <strong>{row.count.toLocaleString()} finding{row.count === 1 ? "" : "s"}</strong>
    <p>{row.definition}</p>
    {row.affectedExpectedAmounts.map((amount) => <p key={amount.currencyCode}><b>Affected expected amount:</b> {formatMoney(amount.amount, amount.currencyCode)}</p>)}
    <p className="sourceLabel">{row.terminal ? "Terminal under the current contract." : row.canResolveLater ? "A later persisted outcome can resolve this condition." : "Resolution behavior is not available."}</p>
    {row.limitations.map((item) => <p className="sourceLabel" key={item}>{item}</p>)}
  </article>;
}

function PendingNotice() {
  return <section className="panel fiscalPendingNotice" aria-labelledby="pending-notice-title"><h3 id="pending-notice-title">Pending issuance references</h3><p>Pending issuance references aren’t classified as exceptions unless an approved deadline or terminal failure condition exists.</p></section>;
}

function UnavailableFacts({ facts }: { facts: string[] }) {
  return <section className="panel paymentReportSection" aria-labelledby="unavailable-facts-title"><div className="sectionHeader"><div><p className="eyebrow">Source boundary</p><h3 id="unavailable-facts-title">Not available in this report</h3></div></div><ul className="unavailableFactList">{facts.map((fact) => <li key={fact}>{unavailableFactLabel(fact)}</li>)}</ul></section>;
}

function ResponsiveTable({ caption, headings, rows, empty }: { caption: string; headings: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="sectionUnavailable">{empty}</p>;
  return <div className="paymentTableScroll"><table className="paymentReportTable"><caption>{caption}</caption><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((value, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row">{value}</th> : <td key={cellIndex}>{value}</td>)}</tr>)}</tbody></table></div>;
}

function FiscalReportStatus({ availability, freshness }: Pick<FiscalExceptionReport, "availability" | "freshness">) {
  return <div className="dashboardStatusPair" aria-label="Report status"><span className={`dashboardBadge availability-${availability.toLowerCase()}`}>Availability: {availability === "NO_ACTIVITY" ? "No activity" : "Partial"}</span><span className={`dashboardBadge freshness-${freshness.toLowerCase()}`}>Freshness: {freshness === "CURRENT" ? "Current persisted data" : "Not applicable"}</span></div>;
}

function ReportMessages({ warnings, limitations }: { warnings: string[]; limitations: string[] }) {
  if (warnings.length === 0 && limitations.length === 0) return null;
  return <div className="dashboardMessages">{warnings.length > 0 && <section className="dashboardWarning"><h3>Warnings</h3><ul>{warnings.map((item) => <li key={item}>{warningLabel(item)}</li>)}</ul></section>}{limitations.length > 0 && <section className="dashboardLimitation"><h3>Limitations</h3><ul>{limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>}</div>;
}

function ReportError({ error, retained, onRetry }: { error: ManagementPlatformUiError; retained: boolean; onRetry?: () => void }) {
  const presentation = errorPresentation(error);
  return <section className="dashboardError" role="alert" aria-label={presentation.title}><h2>{presentation.title}</h2><p>{presentation.message}</p>{retained && <p>Previously loaded values remain visible for reference only with their original timestamps.</p>}{error.correlationId && <p>Support reference: <code>{error.correlationId}</code></p>}{onRetry && <button type="button" className="secondaryButton" onClick={onRetry}>Retry report</button>}</section>;
}

function ReportState({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" }) { return <section className={`stateMessage ${tone}`} role="status" aria-label={title}><h2>{title}</h2><p>{message}</p></section>; }
function key(scope: { scopeType: string; scopeReference: string }): string { return `${scope.scopeType}:${scope.scopeReference}`; }
function scopeLabel(value: string): string { return value === "SITE_GROUP" ? "Site Group" : "Site"; }
function availabilityLabel(value: string): string { return ({ AVAILABLE: "Available", PARTIAL: "Partial", UNAVAILABLE: "Unavailable", NOT_APPLICABLE: "Not available" } as Record<string, string>)[value] ?? safeCodeLabel(value); }
function formatUtc(value: string): string { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(new Date(value)) + " UTC"; }
function formatMoney(value: number, currencyCode: string): string { return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 20 })} ${currencyCode}`; }
function safeCodeLabel(value: string): string { return value.toLowerCase().replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function lifecycleLabel(value: FiscalLifecycleState): string { return ({ NOT_REQUIRED: "Not required", PENDING: "Pending", REQUESTED: "Requested", ISSUED: "Issued", FAILED: "Failed", CONFLICT: "Reference conflict", OUTCOME_UNAVAILABLE: "Outcome unavailable", MANUAL_REVIEW: "Manual review", EXCEPTION_RELEASED: "Exception released", OTHER: "Other" } as const)[value]; }
function lifecycleMeaning(value: FiscalLifecycleState): string { return ({ NOT_REQUIRED: "The persisted coordination state says issuance is not required.", PENDING: "Work is pending; this alone is not an exception.", REQUESTED: "A request is persisted; issuance is not implied.", ISSUED: "Central PMS holds a persisted authoritative issuance outcome; printing is not implied.", FAILED: "The latest persisted state is a supported issuance failure.", CONFLICT: "The latest persisted references conflict.", OUTCOME_UNAVAILABLE: "Central PMS lacks a usable conclusive persisted outcome.", MANUAL_REVIEW: "The persisted workflow state requires manual review.", EXCEPTION_RELEASED: "The persisted exception was released; success is not inferred.", OTHER: "A future or unsupported source state remains visible." } as const)[value]; }
function exceptionLabel(value: FiscalExceptionSummary["categoryId"]): string { return ({ SALES_INVOICE_ISSUANCE_FAILED: "Sales Invoice issuance failed", SALES_INVOICE_REFERENCE_CONFLICT: "Sales Invoice reference conflict", SALES_INVOICE_OUTCOME_UNAVAILABLE: "Sales Invoice outcome unavailable" } as const)[value]; }
function warningLabel(value: string): string { return value === "NO_SALES_INVOICE_ISSUANCE_ACTIVITY_IN_PERIOD" ? "No Sales Invoice issuance references were first recorded in this period." : value; }
function unavailableFactLabel(value: string): string { return ({ SALES_INVOICE_PRINT_RESULT_UNAVAILABLE: "Sales Invoice printing", DIGITAL_COPY_AVAILABILITY_UNAVAILABLE: "Digital-copy availability", REPRINT_ADJUSTMENT_VOID_DELIVERY_UNAVAILABLE: "Reprint, adjustment, void, and delivery outcomes", OVERDUE_DETECTION_UNAVAILABLE: "Overdue detection without an approved deadline", BIR_COMPLIANCE_CERTIFICATION_UNAVAILABLE: "BIR compliance certification" } as Record<string, string>)[value] ?? safeCodeLabel(value); }
function asUiError(value: unknown): ManagementPlatformUiError { return value && typeof value === "object" && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "MANAGEMENT_FISCAL_REPORT_UNEXPECTED_FAILURE", message: "The report could not be read safely.", retryable: false, mutationUncertain: false }; }
function errorPresentation(error: ManagementPlatformUiError): { title: string; message: string } {
  if (error.kind === "authentication-required") return { title: "Authentication required", message: "Your session ended. Sign in again to continue." };
  if (error.kind === "permission-denied") return { title: "Permission denied", message: "Your authenticated account cannot access this report." };
  if (error.kind === "not-found" || error.code === "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED") return { title: "Reporting scope unavailable", message: "The selected scope is unavailable or not authorized." };
  if (error.code === "MANAGEMENT_FISCAL_EXCEPTION_REPORTING_DISABLED") return { title: "Report disabled", message: "Sales Invoice exception reporting is not enabled for this environment." };
  if (error.code === "FISCAL_EXCEPTION_SOURCE_UNAVAILABLE") return { title: "Report unavailable", message: "The authoritative persisted fiscal exception source is temporarily unavailable." };
  if (error.kind === "validation") return { title: "Invalid report request", message: error.message };
  if (error.kind === "malformed-response") return { title: "Report could not be read", message: "Central PMS returned a response that could not be validated safely." };
  return { title: "Report request failed", message: "The Sales Invoice exception report could not be loaded safely." };
}
