import { useEffect, useMemo, useState } from "react";
import {
  coverageStatusLabel,
  entitlementLabel,
  isCoverageRetryable,
  isKnownCoverageClassification,
  policyCoverageSiteGroups,
  toSafePolicyCoverageError,
  type PolicyCoverageClient,
  type PolicyCoverageEntitlementFilter,
  type PolicyCoverageResponse,
  type PolicyCoverageScenarioName,
  type PolicyCoverageScopeType
} from "./policyCoverage";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface PolicyCoveragePageProps {
  authorizedSites: readonly ManagementPlatformSite[];
  currentSite?: ManagementPlatformSite;
  client: PolicyCoverageClient;
  developmentScenarioName?: PolicyCoverageScenarioName;
}

type LoadState =
  | { loading: true; value?: undefined; error?: undefined }
  | { loading: false; value: PolicyCoverageResponse; error?: undefined }
  | { loading: false; value?: undefined; error: ManagementPlatformUiError };

const entitlementOptions: Array<{ value: PolicyCoverageEntitlementFilter; label: string }> = [
  { value: "ALL", label: "Senior Citizen and PWD" },
  { value: "SENIOR_CITIZEN", label: "Senior Citizen" },
  { value: "PWD", label: "PWD" }
];

export function PolicyCoveragePage({ authorizedSites, currentSite, client, developmentScenarioName }: PolicyCoveragePageProps) {
  const siteGroups = useMemo(() => policyCoverageSiteGroups(authorizedSites), [authorizedSites]);
  const [scopeType, setScopeType] = useState<PolicyCoverageScopeType>(siteGroups.length > 0 ? "SITE_GROUP" : "SITE");
  const [selectedSiteGroupId, setSelectedSiteGroupId] = useState(siteGroups[0]?.siteGroupId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(currentSite?.siteId ?? authorizedSites[0]?.siteId ?? "");
  const [entitlementType, setEntitlementType] = useState<PolicyCoverageEntitlementFilter>("ALL");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ loading: true });

  const selectedScopeId = scopeType === "SITE_GROUP" ? selectedSiteGroupId : selectedSiteId;
  const selectedGroup = siteGroups.find((group) => group.siteGroupId === selectedSiteGroupId);
  const selectedSite = authorizedSites.find((site) => site.siteId === selectedSiteId) ?? currentSite;

  useEffect(() => {
    if (currentSite?.siteId) {
      setSelectedSiteId(currentSite.siteId);
      if (currentSite.siteGroupId) {
        setSelectedSiteGroupId(currentSite.siteGroupId);
      }
    }
  }, [currentSite?.siteGroupId, currentSite?.siteId]);

  useEffect(() => {
    if (!selectedScopeId) {
      setState({
        loading: false,
        error: {
          kind: "validation",
          code: scopeType === "SITE_GROUP" ? "MANAGEMENT_PLATFORM_POLICY_COVERAGE_SITE_GROUP_REQUIRED" : "MANAGEMENT_PLATFORM_POLICY_COVERAGE_SITE_REQUIRED",
          message: scopeType === "SITE_GROUP" ? "Select an authorized Site Group before loading statutory policy coverage." : "Select an authorized Site before loading statutory policy coverage.",
          retryable: false,
          mutationUncertain: false
        }
      });
      return;
    }

    const controller = new AbortController();
    setState({ loading: true });
    client.getCoverage({
      scopeType,
      scopeId: selectedScopeId,
      entitlementType: entitlementType === "ALL" ? undefined : entitlementType,
      includeInactive
    }, controller.signal)
      .then((coverage) => setState({ loading: false, value: coverage }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, error: toSafePolicyCoverageError(error) });
        }
      });

    return () => controller.abort();
  }, [client, entitlementType, includeInactive, reloadToken, scopeType, selectedScopeId]);

  return (
    <section className="panel policyCoveragePage" aria-labelledby="policy-coverage-title">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">Statutory Policy Coverage</p>
          <h2 id="policy-coverage-title">Statutory Policy Coverage</h2>
        </div>
        <span className="statusPill">Read-only</span>
      </div>

      {developmentScenarioName && (
        <div className="developmentScenario compact" role="status" aria-label="Development policy coverage scenario">
          Development statutory policy coverage scenario: <strong>{developmentScenarioName}</strong>. This fixture is non-authoritative.
        </div>
      )}

      <section className="rbacNotice" aria-labelledby="policy-coverage-boundary-title">
        <h3 id="policy-coverage-boundary-title">Central PMS authoritative read model</h3>
        <p>Backend source: Central PMS GET /v1/ops/management-platform/statutory-discounts/policy-coverage.</p>
        <p>This workspace observes statutory parking policy coverage only. It does not create policy records, update coverage, approve requests, apply payable basis, initiate payment, fiscalize, contact HikCentral, or open gates.</p>
        <p>Browser-selected Site and Site Group values are request context only. Central PMS remains authoritative for permission and scope enforcement.</p>
      </section>

      <section className="subPanel policyCoverageControls" aria-labelledby="policy-coverage-filters-title">
        <div className="sectionHeader">
          <h3 id="policy-coverage-filters-title">Scope and filters</h3>
          <button className="secondaryButton" type="button" onClick={() => setReloadToken((value) => value + 1)} disabled={state.loading}>
            Retry
          </button>
        </div>
        <div className="policyCoverageFilterGrid">
          <label className="formField" htmlFor="policy-coverage-scope-type">
            <span>Scope type</span>
            <select id="policy-coverage-scope-type" value={scopeType} onChange={(event) => setScopeType(event.target.value as PolicyCoverageScopeType)}>
              <option value="SITE_GROUP">Site Group</option>
              <option value="SITE">Site</option>
            </select>
          </label>

          {scopeType === "SITE_GROUP" ? (
            <label className="formField" htmlFor="policy-coverage-site-group">
              <span>Site Group</span>
              <select id="policy-coverage-site-group" value={selectedSiteGroupId} onChange={(event) => setSelectedSiteGroupId(event.target.value)}>
                {siteGroups.length === 0 && <option value="">No authorized Site Group</option>}
                {siteGroups.map((group) => <option key={group.siteGroupId} value={group.siteGroupId}>{group.displayName}</option>)}
              </select>
            </label>
          ) : (
            <label className="formField" htmlFor="policy-coverage-site">
              <span>Site</span>
              <select id="policy-coverage-site" value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)}>
                {authorizedSites.length === 0 && <option value="">No authorized Site</option>}
                {authorizedSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.displayName}</option>)}
              </select>
            </label>
          )}

          <label className="formField" htmlFor="policy-coverage-entitlement">
            <span>Entitlement type</span>
            <select id="policy-coverage-entitlement" value={entitlementType} onChange={(event) => setEntitlementType(event.target.value as PolicyCoverageEntitlementFilter)}>
              {entitlementOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="checkboxField" htmlFor="policy-coverage-include-inactive">
            <input id="policy-coverage-include-inactive" type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            <span>Include inactive and expired coverage where Central PMS supplies it</span>
          </label>
        </div>
        <p className="fieldHint">All authorized scope is not a separate I-004 query mode; choose a server-authorized Site or Site Group.</p>
      </section>

      <ScopeSummary scopeType={scopeType} selectedSiteGroupName={selectedGroup?.displayName} selectedSite={selectedSite} />

      {state.loading && <StateBlock title="Loading statutory policy coverage" message="Loading read-only coverage from Central PMS." />}
      {state.error && <CoverageError error={state.error} onRetry={() => setReloadToken((value) => value + 1)} />}
      {state.value && <CoverageResult coverage={state.value} />}
    </section>
  );
}

function ScopeSummary({ scopeType, selectedSiteGroupName, selectedSite }: { scopeType: PolicyCoverageScopeType; selectedSiteGroupName?: string; selectedSite?: ManagementPlatformSite }) {
  return (
    <div className="rbacSummaryGrid" aria-label="Policy coverage scope summary">
      <SummaryCard title="Viewed Site Group" value={scopeType === "SITE_GROUP" ? selectedSiteGroupName ?? "No authorized Site Group selected" : selectedSite?.siteGroupDisplayName ?? "Site Group not supplied"} />
      <SummaryCard title="Viewed Site" value={scopeType === "SITE" ? selectedSite?.displayName ?? "No authorized Site selected" : "Site Group coverage may include multiple authorized Sites"} />
      <SummaryCard title="Authority boundary" value="Central PMS resolves scope, policy coverage, retryability, and safe classifications." />
    </div>
  );
}

function CoverageResult({ coverage }: { coverage: PolicyCoverageResponse }) {
  const empty = coverage.coverageRows.length === 0;
  const unsupportedRows = coverage.coverageRows.filter((row) => !isKnownCoverageClassification(row.coverageClassification));

  return (
    <>
      <div className="rbacSummaryGrid" aria-label="Policy coverage result summary">
        <SummaryCard title="Resolved scope" value={`${coverage.resolvedScopeType} ${coverage.scopeDisplayName ?? "scope"}`} />
        <SummaryCard title="Evaluation timestamp" value={formatDateTime(coverage.evaluationTimestamp)} />
        <SummaryCard title="Support reference" value={coverage.correlationId} />
      </div>

      {empty && <StateBlock title="Empty statutory policy coverage" message="Central PMS returned no statutory policy coverage rows for the selected authorized scope and filters." />}
      {unsupportedRows.length > 0 && <StateBlock title="Unsupported authoritative classification" message="At least one returned classification is not known to this UI. The value is displayed as returned and treated as fail-closed." tone="warning" />}

      {!empty && (
        <section className="subPanel" aria-labelledby="policy-coverage-results-title">
          <div className="sectionHeader">
            <h3 id="policy-coverage-results-title">Coverage rows</h3>
            <span className="countBadge">{coverage.coverageRows.length} rows</span>
          </div>
          <div className="tableScroller">
            <table className="dataTable policyCoverageTable">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Entitlement</th>
                  <th>Coverage</th>
                  <th>Status</th>
                  <th>Effective period</th>
                  <th>Authority</th>
                  <th>Jurisdiction</th>
                  <th>Version</th>
                  <th>Source</th>
                  <th>Last update</th>
                </tr>
              </thead>
              <tbody>
                {coverage.coverageRows.map((row, index) => (
                  <tr key={`${row.siteReference}-${row.entitlementType}-${index}`}>
                    <td>{row.siteDisplayName ?? "Site supplied by Central PMS"}</td>
                    <td>{entitlementLabel(row.entitlementType)}</td>
                    <td>
                      <span className={`statusPill compactPill ${statusTone(row.coverageClassification)}`}>
                        {coverageStatusLabel(row.coverageClassification)}
                      </span>
                      <small>{row.reasonClassification}</small>
                    </td>
                    <td>{row.policyStatusClassification}</td>
                    <td>{formatDate(row.effectiveFrom)} to {formatDate(row.effectiveTo)}</td>
                    <td>{row.ordinanceOrLegalAuthorityReference ?? "Not supplied"}</td>
                    <td>{row.jurisdictionOrLocalityReference ?? "Not supplied"}</td>
                    <td>{row.policyVersionOrRevisionReference ?? "Not supplied"}</td>
                    <td>{row.sourceClassification}</td>
                    <td>{formatDateTime(row.lastAuthoritativeUpdateTimestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function CoverageError({ error, onRetry }: { error: ManagementPlatformUiError; onRetry: () => void }) {
  const title = error.kind === "permission-denied" || error.kind === "site-scope-denied"
    ? "Statutory policy coverage access denied"
    : error.kind === "authentication-required"
      ? "Statutory policy coverage session unavailable"
      : error.kind === "malformed-response"
        ? "Statutory policy coverage malformed"
        : error.kind === "not-found"
          ? "Statutory policy coverage scope unavailable"
          : "Statutory policy coverage unavailable";

  return (
    <section className={`stateMessage ${error.kind === "permission-denied" || error.kind === "site-scope-denied" || error.kind === "malformed-response" ? "danger" : "warning"}`} role="alert" aria-label={title}>
      <h2>{title}</h2>
      <p>{error.message}{error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}</p>
      <p>Safe classification: {error.code}. Retryable: {error.retryable ? "Yes" : "No"}.</p>
      {isCoverageRetryable(error) && <button type="button" onClick={onRetry}>Retry statutory policy coverage</button>}
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rbacSummaryCard">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}

function StateBlock({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <section className={`stateMessage ${tone}`} role={tone === "danger" ? "alert" : "status"} aria-label={title}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

function statusTone(classification: string): string {
  switch (classification) {
    case "ACTIVE_COVERED":
      return "successPill";
    case "FUTURE_EFFECTIVE":
    case "INCOMPLETE_CONFIGURATION":
    case "AUTHORITATIVE_SOURCE_UNAVAILABLE":
      return "warningPill";
    case "EXPIRED":
    case "INACTIVE":
    case "NO_APPLICABLE_ORDINANCE":
    case "NO_APPLICABLE_POLICY":
    case "ENTITLEMENT_NOT_COVERED":
    case "MALFORMED_AUTHORITATIVE_RECORD":
      return "dangerPill";
    default:
      return "warningPill";
  }
}

function formatDate(value?: string | null): string {
  return value?.trim() || "Not supplied";
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not supplied";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
