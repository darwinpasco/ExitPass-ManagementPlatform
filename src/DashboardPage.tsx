import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DashboardAvailability,
  DashboardCatalog,
  DashboardFreshness,
  DashboardOperationalOverview,
  DashboardReportingClient,
  DashboardScope,
  DashboardScopeType
} from "./dashboardReporting";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface DashboardPageProps {
  client: DashboardReportingClient;
  canReadCatalog: boolean;
  authorizedSites: readonly ManagementPlatformSite[];
  authorizedSiteGroupReferences: readonly string[];
  currentSite?: ManagementPlatformSite;
}

interface ScopeOption extends Pick<DashboardScope, "scopeType" | "scopeReference"> {
  label: string;
}

type LoadState<T> =
  | { status: "idle" | "loading" }
  | { status: "loaded"; value: T }
  | { status: "error"; error: ManagementPlatformUiError };

export function DashboardPage({
  client,
  canReadCatalog,
  authorizedSites,
  authorizedSiteGroupReferences,
  currentSite
}: DashboardPageProps) {
  const scopes = useMemo(
    () => dashboardScopeOptions(authorizedSites, authorizedSiteGroupReferences),
    [authorizedSiteGroupReferences, authorizedSites]
  );
  const defaultScope = useMemo(() => preferredDashboardScope(scopes, currentSite), [currentSite, scopes]);
  const [selectedScopeKey, setSelectedScopeKey] = useState(() => defaultScope ? scopeKey(defaultScope) : "");
  const [overview, setOverview] = useState<DashboardOperationalOverview>();
  const [overviewError, setOverviewError] = useState<ManagementPlatformUiError>();
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogState, setCatalogState] = useState<LoadState<DashboardCatalog>>({ status: "idle" });
  const overviewRequest = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const catalogRequest = useRef<AbortController | undefined>(undefined);

  const selectedScope = scopes.find((scope) => scopeKey(scope) === selectedScopeKey);

  useEffect(() => {
    if (selectedScopeKey && scopes.some((scope) => scopeKey(scope) === selectedScopeKey)) return;
    setSelectedScopeKey(defaultScope ? scopeKey(defaultScope) : "");
  }, [defaultScope, scopes, selectedScopeKey]);

  const loadOverview = useCallback(async (scope: ScopeOption, retainPrevious: boolean) => {
    overviewRequest.current.controller?.abort();
    const controller = new AbortController();
    const sequence = overviewRequest.current.sequence + 1;
    overviewRequest.current = { sequence, controller };
    setOverviewError(undefined);
    if (retainPrevious && overview) setRefreshing(true);
    else {
      setOverview(undefined);
      setInitialLoading(true);
    }

    try {
      const response = await client.getOperationalOverview(scope, controller.signal);
      if (overviewRequest.current.sequence !== sequence || controller.signal.aborted) return;
      setOverview(response);
    } catch (error) {
      if (overviewRequest.current.sequence !== sequence || controller.signal.aborted) return;
      setOverviewError(asUiError(error));
    } finally {
      if (overviewRequest.current.sequence === sequence) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [client, overview]);

  useEffect(() => {
    if (!selectedScope) {
      overviewRequest.current.controller?.abort();
      setOverview(undefined);
      setOverviewError(undefined);
      setInitialLoading(false);
      return;
    }
    void loadOverview(selectedScope, false);
    return () => overviewRequest.current.controller?.abort();
  }, [selectedScopeKey]); // The key is the authority-neutral request context for this load.

  const loadCatalog = useCallback(async () => {
    if (!canReadCatalog) {
      setCatalogState({ status: "idle" });
      return;
    }
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    setCatalogState({ status: "loading" });
    try {
      const value = await client.getCatalog(controller.signal);
      if (!controller.signal.aborted) setCatalogState({ status: "loaded", value });
    } catch (error) {
      if (!controller.signal.aborted) setCatalogState({ status: "error", error: asUiError(error) });
    }
  }, [canReadCatalog, client]);

  useEffect(() => {
    void loadCatalog();
    return () => catalogRequest.current?.abort();
  }, [loadCatalog]);

  return (
    <div className="dashboardPage">
      <section className="panel dashboardHeader" aria-labelledby="dashboard-title">
        <div className="pageTitle dashboardTitleRow">
          <div>
            <p className="eyebrow">Operational visibility</p>
            <h2 id="dashboard-title">Dashboard</h2>
            <p>Current server-classified Site and connector operating posture.</p>
          </div>
          {overview && <StatusPair availability={overview.availability} freshness={overview.freshness} />}
        </div>

        <div className="dashboardControls">
          <label className="dashboardScopeField" htmlFor="dashboard-reporting-scope">
            <span>Reporting scope</span>
            <select
              id="dashboard-reporting-scope"
              value={selectedScopeKey}
              disabled={scopes.length === 0 || refreshing || initialLoading}
              onChange={(event) => setSelectedScopeKey(event.target.value)}
            >
              {scopes.length === 0 && <option value="">No authorized reporting scope</option>}
              {scopes.map((scope) => <option key={scopeKey(scope)} value={scopeKey(scope)}>{scope.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="secondaryButton dashboardRefresh"
            disabled={!selectedScope || refreshing || initialLoading}
            aria-label="Refresh operational dashboard"
            onClick={() => selectedScope && void loadOverview(selectedScope, true)}
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>

        {selectedScope && <p className="scopeContext">Requesting explicit {scopeTypeLabel(selectedScope.scopeType)} scope: <strong>{selectedScope.label}</strong>. Central PMS remains authoritative.</p>}
        {overview && (
          <dl className="dashboardTimestamps">
            <div><dt>Generated</dt><dd>{formatTimestamp(overview.generatedAt)}</dd></div>
            <div><dt>Data as of</dt><dd>{overview.dataAsOf ? formatTimestamp(overview.dataAsOf) : "Not supplied"}</dd></div>
            <div><dt>Effective scope</dt><dd>{overview.effectiveScope.displayName} ({scopeTypeLabel(overview.effectiveScope.scopeType)})</dd></div>
          </dl>
        )}
      </section>

      {!selectedScope && <DashboardState title="No authorized reporting scope" message="An explicit authorized Site or Site Group is required before operational data can be requested." tone="warning" />}
      {initialLoading && <DashboardState title="Loading dashboard" message="Reading the current operational overview from Central PMS." />}
      {overviewError && <DashboardError error={overviewError} retained={Boolean(overview)} onRetry={overviewError.retryable && selectedScope ? () => void loadOverview(selectedScope, Boolean(overview)) : undefined} />}
      {refreshing && overview && <div className="dashboardRefreshState" role="status">Refreshing. Previously loaded information remains visible until Central PMS responds.</div>}
      {overviewError && overview && <div className="dashboardRetainedState" role="status">Previously loaded information. Generated {formatTimestamp(overview.generatedAt)}; its original freshness classification is preserved.</div>}

      {overview && (
        <>
          <DashboardMessages warnings={overview.warnings} limitations={overview.limitations} />
          <div className="dashboardSections" aria-label="Operational dashboard sections">
            {overview.sections.map((section) => (
              <section className="dashboardSection" key={section.sectionId} aria-labelledby={`dashboard-${section.sectionId}`}>
                <div className="dashboardSectionHeader">
                  <div>
                    <h3 id={`dashboard-${section.sectionId}`}>{section.displayTitle}</h3>
                    <p className="sourceLabel">Source: {sourceLabel(section.sourceAuthority)}</p>
                    <p className="sourceLabel">Data as of: {section.dataAsOf ? formatTimestamp(section.dataAsOf) : "Not available"}</p>
                  </div>
                  <StatusPair availability={section.availability} freshness={section.freshness} compact />
                </div>
                {section.availability !== "UNAVAILABLE" && section.availability !== "NOT_APPLICABLE" && section.metrics.length > 0 && (
                  <div className="metricGrid">
                    {section.metrics.map((metric) => (
                      <article className="metricCard" key={metric.metricId} data-metric-id={metric.metricId}>
                        <span>{metric.displayLabel}</span>
                        <strong>{metric.value.toLocaleString()}</strong>
                        <small>{unitLabel(metric.unit)}</small>
                      </article>
                    ))}
                  </div>
                )}
                {(section.availability === "UNAVAILABLE" || section.availability === "NOT_APPLICABLE") && (
                  <p className="sectionUnavailable">No authoritative metric values are available for this section.</p>
                )}
                <DashboardMessages warnings={section.warnings} limitations={section.limitations} compact />
              </section>
            ))}
          </div>
          <p className="supportReference">Support reference: <code>{overview.correlationId}</code></p>
        </>
      )}

      <CatalogPanel canRead={canReadCatalog} state={catalogState} onRetry={() => void loadCatalog()} />
    </div>
  );
}

export function dashboardScopeOptions(
  sites: readonly ManagementPlatformSite[],
  siteGroupReferences: readonly string[]
): ScopeOption[] {
  const siteOptions: ScopeOption[] = sites.map((site) => ({
    scopeType: "SITE",
    scopeReference: site.siteId,
    label: `Site: ${site.displayName}`
  }));
  const seen = new Set<string>();
  const groupOptions = siteGroupReferences.flatMap((reference) => {
    if (!reference || seen.has(reference)) return [];
    seen.add(reference);
    const metadata = sites.find((site) => site.siteGroupId === reference);
    const label = metadata?.siteGroupDisplayName?.trim() || `Site Group (${safeReferenceLabel(reference)})`;
    return [{ scopeType: "SITE_GROUP" as const, scopeReference: reference, label: `Site Group: ${label}` }];
  });
  return [...siteOptions, ...groupOptions];
}

function preferredDashboardScope(scopes: readonly ScopeOption[], currentSite?: ManagementPlatformSite): ScopeOption | undefined {
  return scopes.find((scope) => scope.scopeType === "SITE" && scope.scopeReference === currentSite?.siteId)
    ?? scopes.find((scope) => scope.scopeType === "SITE")
    ?? scopes.find((scope) => scope.scopeType === "SITE_GROUP");
}

function CatalogPanel({ canRead, state, onRetry }: { canRead: boolean; state: LoadState<DashboardCatalog>; onRetry: () => void }) {
  if (!canRead) return <DashboardState title="Report catalog not available" message="Your current session does not include report catalog presentation access." />;
  return (
    <section className="panel reportCatalog" aria-labelledby="report-catalog-title">
      <div className="sectionHeader"><div><p className="eyebrow">Reporting capabilities</p><h2 id="report-catalog-title">Report catalog</h2></div></div>
      {state.status === "loading" && <div className="inlineState" role="status">Loading report catalog</div>}
      {state.status === "error" && <DashboardError error={state.error} retained={false} onRetry={state.error.retryable ? onRetry : undefined} compact />}
      {state.status === "loaded" && state.value.reports.length === 0 && <p>No reports were returned by the authoritative catalog.</p>}
      {state.status === "loaded" && state.value.reports.length > 0 && (
        <><p className="sourceLabel">Catalog generated {formatTimestamp(state.value.generatedAt)}</p><div className="reportCatalogList">
          {state.value.reports.map((report) => (
            <article key={report.reportId}>
              <div className="reportCatalogHeader"><div><h3>{report.displayTitle}</h3><p>{report.functionalDomain}</p></div><AvailabilityBadge value={report.availability} /></div>
              <p>{report.description}</p>
              <dl>
                <div><dt>Scope</dt><dd>{report.supportedScopeTypes.map(scopeTypeLabel).join(", ")}</dd></div>
                <div><dt>Source</dt><dd>{sourceLabel(report.sourceAuthority)}</dd></div>
                <div><dt>Freshness</dt><dd>{report.freshnessSemantics}</dd></div>
              </dl>
              <DashboardMessages warnings={report.warnings} limitations={report.limitations} compact />
              {report.reportId !== "operational-overview" && <p className="futureReport">Unavailable in this phase. No report result or action is provided.</p>}
            </article>
          ))}
        </div></>
      )}
    </section>
  );
}

function StatusPair({ availability, freshness, compact = false }: { availability: DashboardAvailability; freshness: DashboardFreshness; compact?: boolean }) {
  return <div className={`dashboardStatusPair ${compact ? "compact" : ""}`}><AvailabilityBadge value={availability} /><FreshnessBadge value={freshness} /></div>;
}

function AvailabilityBadge({ value }: { value: DashboardAvailability }) {
  return <span className={`dashboardBadge availability-${value.toLowerCase()}`}>Availability: {availabilityLabel(value)}</span>;
}

function FreshnessBadge({ value }: { value: DashboardFreshness }) {
  return <span className={`dashboardBadge freshness-${value.toLowerCase()}`}>Freshness: {freshnessLabel(value)}</span>;
}

function DashboardMessages({ warnings, limitations, compact = false }: { warnings: readonly string[]; limitations: readonly string[]; compact?: boolean }) {
  if (warnings.length === 0 && limitations.length === 0) return null;
  return (
    <div className={`dashboardMessages ${compact ? "compact" : ""}`}>
      {warnings.length > 0 && <section className="dashboardWarning"><h3>Warnings</h3><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}
      {limitations.length > 0 && <section className="dashboardLimitation"><h3>Limitations</h3><ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>}
    </div>
  );
}

function DashboardError({ error, retained, onRetry, compact = false }: { error: ManagementPlatformUiError; retained: boolean; onRetry?: () => void; compact?: boolean }) {
  const presentation = dashboardErrorPresentation(error);
  return (
    <section className={`dashboardError ${compact ? "compact" : ""}`} role="alert" aria-label={presentation.title}>
      <h2>{presentation.title}</h2>
      <p>{presentation.message}{retained ? " Previously loaded information is retained below and is not a fresh result." : ""}</p>
      {error.correlationId && <p>Support reference: <code>{error.correlationId}</code></p>}
      {onRetry && <button type="button" className="secondaryButton" onClick={onRetry}>Try again</button>}
    </section>
  );
}

function DashboardState({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" }) {
  return <section className={`stateMessage ${tone}`} role="status" aria-label={title}><h2>{title}</h2><p>{message}</p></section>;
}

export function dashboardErrorPresentation(error: ManagementPlatformUiError): { title: string; message: string } {
  switch (error.code) {
    case "MANAGEMENT_DASHBOARD_REPORTING_DISABLED": return { title: "Dashboard unavailable", message: "Management Dashboard and Reporting is not enabled for this environment." };
    case "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED": return { title: "Reporting scope unavailable", message: "The requested reporting scope was not found or is not available with your current access." };
    case "DASHBOARD_SOURCE_UNAVAILABLE": return { title: "Operational source unavailable", message: "A required dashboard source is temporarily unavailable." };
    case "DASHBOARD_SESSION_INVALID":
    case "CENTRAL_PMS_RBAC_UNAUTHENTICATED": return { title: "Authentication required", message: "Your Management Platform session is no longer available. Sign in again to continue." };
    case "CENTRAL_PMS_RBAC_FORBIDDEN": return { title: "Dashboard permission denied", message: "Your account is authenticated but does not have permission for this dashboard request." };
    case "INVALID_DASHBOARD_SCOPE_TYPE":
    case "INVALID_DASHBOARD_SCOPE_REFERENCE": return { title: "Reporting scope invalid", message: "Select an authorized Site or Site Group and try again." };
    case "MANAGEMENT_DASHBOARD_UNEXPECTED_FAILURE": return { title: "Dashboard request failed", message: "The dashboard request failed safely." };
    default:
      if (error.kind === "malformed-response") return { title: "Dashboard response unavailable", message: "The dashboard response could not be validated safely." };
      if (error.kind === "permission-denied") return { title: "Dashboard permission denied", message: "Your account is authenticated but does not have permission for this dashboard request." };
      if (error.kind === "authentication-required") return { title: "Authentication required", message: "Your Management Platform session is no longer available. Sign in again to continue." };
      return { title: "Dashboard temporarily unavailable", message: "The dashboard request failed safely. Try again when the service is available." };
  }
}

function asUiError(error: unknown): ManagementPlatformUiError {
  if (typeof error === "object" && error !== null && "kind" in error && "code" in error) return error as ManagementPlatformUiError;
  return { kind: "unknown", code: "MANAGEMENT_DASHBOARD_UNEXPECTED_FAILURE", message: "The dashboard request failed safely.", retryable: false, mutationUncertain: false };
}

function availabilityLabel(value: DashboardAvailability): string {
  return ({ AVAILABLE: "Available", PARTIAL: "Partial data", UNAVAILABLE: "Unavailable", NOT_APPLICABLE: "Not applicable" } as const)[value];
}

function freshnessLabel(value: DashboardFreshness): string {
  return ({ CURRENT: "Current", STALE: "Stale", PARTIAL: "Mixed freshness", UNAVAILABLE: "Freshness unavailable", NOT_APPLICABLE: "Not applicable" } as const)[value];
}

function scopeKey(scope: Pick<DashboardScope, "scopeType" | "scopeReference">): string {
  return `${scope.scopeType}:${scope.scopeReference}`;
}

function scopeTypeLabel(value: DashboardScopeType): string {
  return value === "SITE" ? "Site" : "Site Group";
}

function safeReferenceLabel(reference: string): string {
  const suffix = reference.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  return suffix ? `reference ending ${suffix}` : "authorized reference";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

function sourceLabel(value: string): string {
  return value.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");
}

function unitLabel(value: string): string {
  return value === "COUNT" ? "Count" : value;
}
