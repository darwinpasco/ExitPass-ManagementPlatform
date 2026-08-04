import { useEffect, useMemo, useRef, useState } from "react";
import {
  capabilityStatuses,
  capabilityStatusLabel,
  entitlementLabel,
  governanceStatuses,
  governanceStatusLabel,
  isEvidenceGovernanceRetryable,
  isKnownCapabilityStatus,
  isKnownGovernanceStatus,
  matchesEvidenceGovernanceSearch,
  safeControlledCode,
  toSafeEvidenceGovernanceError,
  warningSummary,
  type EvidenceGovernanceCaptureFilter,
  type EvidenceGovernanceClient,
  type EvidenceGovernanceEntitlementFilter,
  type EvidenceGovernanceFreshnessFilter,
  type EvidenceGovernanceResponse,
  type EvidenceGovernanceScenarioName,
  type EvidenceGovernanceScopeType,
  type EvidenceGovernanceSite
} from "./evidenceGovernance";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface EvidenceGovernancePageProps {
  authorizedSites: readonly ManagementPlatformSite[];
  currentSite?: ManagementPlatformSite;
  client: EvidenceGovernanceClient;
  developmentScenarioName?: EvidenceGovernanceScenarioName;
}

interface LoadState {
  loading: boolean;
  value?: EvidenceGovernanceResponse;
  error?: ManagementPlatformUiError;
}

const entitlementOptions: Array<{ value: EvidenceGovernanceEntitlementFilter; label: string }> = [
  { value: "ALL", label: "Senior Citizen and PWD" },
  { value: "SENIOR_CITIZEN", label: "Senior Citizen" },
  { value: "PWD", label: "PWD" }
];

export function EvidenceGovernancePage({ authorizedSites, currentSite, client, developmentScenarioName }: EvidenceGovernancePageProps) {
  const siteGroups = useMemo(() => authorizedSiteGroups(authorizedSites), [authorizedSites]);
  const [scopeType, setScopeType] = useState<EvidenceGovernanceScopeType>("ALL");
  const [selectedSiteGroupId, setSelectedSiteGroupId] = useState(currentSite?.siteGroupId ?? siteGroups[0]?.siteGroupId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(currentSite?.siteId ?? authorizedSites[0]?.siteId ?? "");
  const [entitlementType, setEntitlementType] = useState<EvidenceGovernanceEntitlementFilter>("ALL");
  const [governanceStatus, setGovernanceStatus] = useState("ALL");
  const [readinessStatus, setReadinessStatus] = useState("ALL");
  const [captureFilter, setCaptureFilter] = useState<EvidenceGovernanceCaptureFilter>("ALL");
  const [freshnessFilter, setFreshnessFilter] = useState<EvidenceGovernanceFreshnessFilter>("ALL");
  const [searchText, setSearchText] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<{ site: EvidenceGovernanceSite; contractVersion: string }>();
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<LoadState>({ loading: true });

  const scopeReference = scopeType === "SITE" ? selectedSiteId : scopeType === "SITE_GROUP" ? selectedSiteGroupId : undefined;

  useEffect(() => {
    if (currentSite?.siteId) {
      setSelectedSiteId(currentSite.siteId);
      if (currentSite.siteGroupId) {
        setSelectedSiteGroupId(currentSite.siteGroupId);
      }
    }
  }, [currentSite?.siteGroupId, currentSite?.siteId]);

  useEffect(() => {
    if (scopeType !== "ALL" && !scopeReference) {
      setState({
        loading: false,
        error: {
          kind: "validation",
          code: "MANAGEMENT_PLATFORM_EVIDENCE_GOVERNANCE_SCOPE_REQUIRED",
          message: `Select an authorized ${scopeType === "SITE" ? "Site" : "Site Group"} before loading evidence governance.`,
          retryable: false,
          mutationUncertain: false
        }
      });
      return;
    }

    const controller = new AbortController();
    setState((previous) => ({ loading: true, value: previous.value }));
    client.getGovernance({
      scopeType,
      scopeReference,
      entitlementType: entitlementType === "ALL" ? undefined : entitlementType,
      governanceStatus: governanceStatus === "ALL" ? undefined : governanceStatus,
      readinessStatus: readinessStatus === "ALL" ? undefined : readinessStatus,
      captureEnabled: captureFilter === "ALL" ? undefined : captureFilter === "ENABLED",
      includeStale: freshnessFilter !== "FRESH"
    }, controller.signal)
      .then((value) => setState({ loading: false, value }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState((previous) => ({ loading: false, value: previous.value, error: toSafeEvidenceGovernanceError(error) }));
        }
      });

    return () => controller.abort();
  }, [captureFilter, client, entitlementType, freshnessFilter, governanceStatus, readinessStatus, reloadToken, scopeReference, scopeType]);

  const visibleSites = useMemo(() => {
    const sites = state.value?.sites ?? [];
    return sites.filter((site) =>
      (freshnessFilter === "ALL" || (freshnessFilter === "STALE" ? site.stale : !site.stale)) &&
      matchesEvidenceGovernanceSearch(site, searchText)
    );
  }, [freshnessFilter, searchText, state.value?.sites]);

  function openDetails(site: EvidenceGovernanceSite, contractVersion: string, trigger: HTMLButtonElement) {
    detailTriggerRef.current = trigger;
    setSelectedDetail({ site, contractVersion });
  }

  function closeDetails() {
    setSelectedDetail(undefined);
    window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

  return (
    <section className="panel evidenceGovernancePage" aria-labelledby="evidence-governance-title">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">Statutory Evidence Governance</p>
          <h2 id="evidence-governance-title">Statutory Evidence Governance</h2>
        </div>
        <span className="statusPill">Read-only</span>
      </div>

      {developmentScenarioName && (
        <div className="developmentScenario compact" role="status" aria-label="Development evidence governance scenario">
          Development evidence-governance scenario: <strong>{developmentScenarioName}</strong>. This fixture is synthetic and non-authoritative.
        </div>
      )}

      <section className="rbacNotice" aria-labelledby="evidence-governance-boundary-title">
        <h3 id="evidence-governance-boundary-title">Central PMS authoritative governance read model</h3>
        <p>Backend source: Central PMS GET evidence-governance routes under the same-origin Management Platform boundary.</p>
        <p>This workspace displays configuration and readiness only. It does not receive customer records, evidence content, storage internals, or mutation authority.</p>
        <p>Browser-selected scope is request context only. Central PMS owns permission, Site scope, Site Group scope, anti-enumeration, and readiness classifications.</p>
      </section>

      <section className="subPanel evidenceGovernanceControls" aria-labelledby="evidence-governance-filters-title">
        <div className="sectionHeader">
          <h3 id="evidence-governance-filters-title">Authorized scope and filters</h3>
          <button className="secondaryButton" type="button" aria-label="Refresh statutory evidence governance" onClick={() => setReloadToken((value) => value + 1)} disabled={state.loading}>
            Refresh
          </button>
        </div>
        <div className="evidenceGovernanceFilterGrid">
          <FilterSelect id="evidence-governance-scope" label="Scope" value={scopeType} onChange={(value) => setScopeType(value as EvidenceGovernanceScopeType)} options={[
            ["ALL", "All authorized scope"], ["SITE_GROUP", "Site Group"], ["SITE", "Site"]
          ]} />

          {scopeType === "SITE_GROUP" && (
            <FilterSelect id="evidence-governance-site-group" label="Site Group" value={selectedSiteGroupId} onChange={setSelectedSiteGroupId} options={siteGroups.length > 0 ? siteGroups.map((group) => [group.siteGroupId, group.displayName]) : [["", "No authorized Site Group"]]} />
          )}
          {scopeType === "SITE" && (
            <FilterSelect id="evidence-governance-site" label="Site" value={selectedSiteId} onChange={setSelectedSiteId} options={authorizedSites.length > 0 ? authorizedSites.map((site) => [site.siteId, site.displayName]) : [["", "No authorized Site"]]} />
          )}

          <FilterSelect id="evidence-governance-entitlement" label="Entitlement" value={entitlementType} onChange={(value) => setEntitlementType(value as EvidenceGovernanceEntitlementFilter)} options={entitlementOptions.map((option) => [option.value, option.label])} />
          <FilterSelect id="evidence-governance-status" label="Governance status" value={governanceStatus} onChange={setGovernanceStatus} options={[["ALL", "All governance states"], ...governanceStatuses.map((status) => [status, governanceStatusLabel(status)] as [string, string])]} />
          <FilterSelect id="evidence-governance-readiness" label="Readiness" value={readinessStatus} onChange={setReadinessStatus} options={[["ALL", "All readiness states"], ...capabilityStatuses.map((status) => [status, capabilityStatusLabel(status)] as [string, string])]} />
          <FilterSelect id="evidence-governance-capture" label="Capture" value={captureFilter} onChange={(value) => setCaptureFilter(value as EvidenceGovernanceCaptureFilter)} options={[["ALL", "All capture states"], ["ENABLED", "Capture enabled"], ["DISABLED", "Capture disabled"]]} />
          <FilterSelect id="evidence-governance-freshness" label="Freshness" value={freshnessFilter} onChange={(value) => setFreshnessFilter(value as EvidenceGovernanceFreshnessFilter)} options={[["ALL", "Fresh and stale"], ["FRESH", "Fresh only"], ["STALE", "Stale only"]]} />
          <label className="formField evidenceGovernanceSearch" htmlFor="evidence-governance-search">
            <span>Search returned safe fields</span>
            <input id="evidence-governance-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Site, status, profile, or code" />
          </label>
        </div>
        <p className="fieldHint">Server-supported filters are sent to Central PMS. Search and stale-only filtering apply only to rows already returned for the authorized scope.</p>
      </section>

      {state.loading && !state.value && <StateBlock title="Loading statutory evidence governance" message="Loading authoritative configuration and readiness without displaying a provisional ready state." />}
      {state.loading && state.value && <StateBlock title="Refreshing statutory evidence governance" message="The previous authoritative result remains visible and is marked as retained while refresh is in progress." tone="warning" />}
      {state.error && <GovernanceError error={state.error} retained={Boolean(state.value)} onRetry={() => setReloadToken((value) => value + 1)} />}
      {state.value && <GovernanceResult response={state.value} visibleSites={visibleSites} retained={state.loading || Boolean(state.error)} onOpenDetails={openDetails} />}

      {selectedDetail && <GovernanceDetail site={selectedDetail.site} contractVersion={selectedDetail.contractVersion} onClose={closeDetails} />}
    </section>
  );
}

function GovernanceResult({ response, visibleSites, retained, onOpenDetails }: { response: EvidenceGovernanceResponse; visibleSites: EvidenceGovernanceSite[]; retained: boolean; onOpenDetails: (site: EvidenceGovernanceSite, contractVersion: string, trigger: HTMLButtonElement) => void }) {
  const emptyAuthorizedScope = response.sites.length === 0 && response.warnings.includes("EMPTY_AUTHORIZED_SCOPE");
  const filteredEmpty = response.sites.length > 0 && visibleSites.length === 0;
  const unknown = response.sites.some((site) =>
    site.governanceStatus === "UNKNOWN" ||
    site.readinessStatus === "UNKNOWN" ||
    !isKnownGovernanceStatus(site.governanceStatus) ||
    !isKnownCapabilityStatus(site.readinessStatus)
  );

  return (
    <>
      <div className="rbacSummaryGrid" aria-label="Evidence governance response summary">
        <SummaryCard title="Contract" value={response.contractVersion} />
        <SummaryCard title="Authoritative evaluation" value={formatDateTime(response.evaluationTimestamp)} />
        <SummaryCard title="Freshness" value={`${response.freshnessStatus}${response.stale ? " - stale" : ""}${retained ? " - retained during refresh" : ""}`} />
        <SummaryCard title="Authorized rows" value={String(response.sites.length)} />
      </div>

      {response.stale && <StateBlock title="Stale authoritative response" message="Central PMS marked this governance response as stale. It is displayed as stale and is not treated as ready." tone="warning" />}
      {unknown && <StateBlock title="Unknown readiness classification" message="Central PMS returned an unsupported or unknown classification. The value remains distinct and is treated as fail-closed." tone="warning" />}
      {emptyAuthorizedScope && <StateBlock title="Empty authorized scope" message="Central PMS returned no statutory evidence-governance Sites in the authorized scope." />}
      {filteredEmpty && <StateBlock title="No matching governance configuration" message="Authorized rows were returned, but none match the current read-only filters." />}
      <CodeNotices title="Response warnings" codes={response.warnings.filter((code) => code !== "EMPTY_AUTHORIZED_SCOPE")} tone="warning" />
      <CodeNotices title="Response blockers" codes={response.blockers} tone="danger" />

      {visibleSites.length > 0 && (
        <section className="subPanel" aria-labelledby="evidence-governance-results-title">
          <div className="sectionHeader">
            <h3 id="evidence-governance-results-title">Evidence-governance Sites</h3>
            <span className="countBadge">{visibleSites.length} Sites</span>
          </div>
          <div className="evidenceGovernanceList">
            {visibleSites.map((site) => (
              <article className="evidenceGovernanceCard" key={site.siteReference}>
                <div className="evidenceGovernanceCardHeader">
                  <div>
                    <p className="eyebrow">{site.siteGroupDisplayName ?? "Site Group supplied by Central PMS"}</p>
                    <h4>{site.siteDisplayName ?? "Site supplied by Central PMS"}</h4>
                  </div>
                  <div className="statusStack" aria-label="Governance and readiness status">
                    <StatusPill value={site.governanceStatus} label={governanceStatusLabel(site.governanceStatus)} />
                    <StatusPill value={site.readinessStatus} label={capabilityStatusLabel(site.readinessStatus)} />
                    {site.stale && <span className="statusPill compactPill warningPill">Stale</span>}
                  </div>
                </div>
                <dl className="compactFacts">
                  <div><dt>Entitlements</dt><dd>{site.entitlementTypesSupported.map(entitlementLabel).join(", ") || "Not supplied"}</dd></div>
                  <div><dt>Capture</dt><dd>{site.evidenceCaptureEnabled ? "Enabled" : "Disabled"}</dd></div>
                  <div><dt>Protected storage</dt><dd>{capabilityStatusLabel(site.protectedStorageReadiness)}</dd></div>
                  <div><dt>Last evaluated</dt><dd>{formatDateTime(site.lastEvaluatedAt)}</dd></div>
                </dl>
                <div className="evidenceGovernanceCardFooter">
                  <span>{site.blockers.length} blockers, {site.warnings.length} warnings</span>
                  <button className="secondaryButton" type="button" onClick={(event) => onOpenDetails(site, response.contractVersion, event.currentTarget)}>Open details for {site.siteDisplayName ?? "Site"}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function GovernanceDetail({ site, contractVersion, onClose }: { site: EvidenceGovernanceSite; contractVersion: string; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function copySupportReference() {
    try {
      await navigator.clipboard.writeText(site.supportReference);
      setCopyStatus("Support reference copied.");
    } catch {
      setCopyStatus("Support reference could not be copied. Select it manually.");
    }
  }

  const lifecycleRows: Array<[string, string]> = [
    ["Upload lifecycle", site.uploadLifecycleReadiness],
    ["Validation lifecycle", site.validationLifecycleReadiness],
    ["Malware scan lifecycle", site.malwareScanLifecycleReadiness],
    ["Reviewability lifecycle", site.reviewabilityLifecycleReadiness],
    ["Binding lifecycle", site.bindingLifecycleReadiness],
    ["Hold lifecycle", site.holdLifecycleReadiness],
    ["Deletion-request lifecycle", site.deletionRequestLifecycleReadiness]
  ];
  const workerRows: Array<[string, string]> = [
    ["Malware scanning execution", site.malwareScanningExecutionReadiness],
    ["Secure preview", site.securePreviewReadiness],
    ["Retention policy", site.retentionPolicyReadiness],
    ["Retention worker", site.retentionWorkerReadiness],
    ["Deletion worker", site.deletionWorkerReadiness],
    ["Object reconciliation", site.objectReconciliationReadiness]
  ];

  return (
    <div className="governanceDialogBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="governanceDialog" role="dialog" aria-modal="true" aria-labelledby="evidence-governance-detail-title">
        <div className="pageTitle governanceDialogTitle">
          <div>
            <p className="eyebrow">Read-only governance detail</p>
            <h2 id="evidence-governance-detail-title">{site.siteDisplayName ?? "Statutory evidence governance Site"}</h2>
          </div>
          <button ref={closeButtonRef} className="iconTextButton" type="button" aria-label="Close evidence governance details" onClick={onClose}>Close</button>
        </div>

        <div className="governanceDetailBody">
          <DetailSection title="Scope and status">
            <dl className="detailFacts">
              <Fact label="Contract version" value={contractVersion} />
              <Fact label="Site" value={site.siteDisplayName ?? "Not supplied"} />
              <Fact label="Site Group" value={site.siteGroupDisplayName ?? "Not supplied"} />
              <Fact label="Governance" value={governanceStatusLabel(site.governanceStatus)} />
              <Fact label="Readiness" value={capabilityStatusLabel(site.readinessStatus)} />
              <Fact label="Freshness" value={`${site.freshnessStatus}${site.stale ? " - stale" : ""}`} />
              <Fact label="Entitlements" value={site.entitlementTypesSupported.map(entitlementLabel).join(", ") || "Not supplied"} />
            </dl>
          </DetailSection>

          <DetailSection title="Capture and upload posture">
            <dl className="detailFacts">
              <Fact label="Capture configured" value={yesNo(site.evidenceCaptureConfigured)} />
              <Fact label="Capture enabled" value={yesNo(site.evidenceCaptureEnabled)} />
              <Fact label="Allowed media" value={site.allowedMediaTypes.join(", ") || "Not supplied"} />
              <Fact label="Maximum upload size" value={formatBytes(site.maximumUploadSizeBytes)} />
              <Fact label="Upload authorization lifetime" value={formatDuration(site.uploadAuthorizationTtlSeconds)} />
              <Fact label="Upload authorization" value={capabilityStatusLabel(site.uploadAuthorizationReadiness)} />
              <Fact label="Upload finalization" value={capabilityStatusLabel(site.uploadFinalizationReadiness)} />
            </dl>
          </DetailSection>

          <DetailSection title="Required document profiles">
            {site.requiredDocumentProfiles.length === 0 ? <p>No required document profiles were supplied.</p> : (
              <div className="tableScroller"><table className="dataTable"><thead><tr><th>Profile</th><th>Version</th><th>Retention class</th><th>Policy version</th><th>Policy status</th></tr></thead><tbody>{site.requiredDocumentProfiles.map((profile) => <tr key={`${profile.profileCode}-${profile.profileVersion}`}><td>{profile.profileCode}</td><td>{profile.profileVersion}</td><td>{profile.retentionClassCode}</td><td>{profile.retentionPolicyVersion}</td><td>{profile.retentionPolicyStatus} ({profile.retentionPolicyApproved ? "approved" : "not approved"})</td></tr>)}</tbody></table></div>
            )}
          </DetailSection>

          <DetailSection title="Protected-storage posture">
            <dl className="detailFacts">
              <Fact label="Provider classification" value={site.protectedStorageProviderClassification} />
              <Fact label="Storage readiness" value={capabilityStatusLabel(site.protectedStorageReadiness)} />
              <Fact label="Private access" value={site.storagePrivateAccessPosture} />
              <Fact label="Server-side encryption" value={site.serverSideEncryptionPosture} />
              <Fact label="Checksum verification" value={capabilityStatusLabel(site.checksumVerificationReadiness)} />
              <Fact label="Provider metadata verification" value={capabilityStatusLabel(site.providerMetadataVerificationReadiness)} />
            </dl>
          </DetailSection>

          <CapabilityMatrix title="Lifecycle capability matrix" rows={lifecycleRows} />
          <CapabilityMatrix title="Operational readiness" rows={workerRows} />
          <CodeNotices title="Configuration warnings" codes={site.warnings} tone="warning" />
          <CodeNotices title="Configuration blockers" codes={site.blockers} tone="danger" />

          <DetailSection title="Freshness and support">
            <dl className="detailFacts">
              <Fact label="Last evaluated" value={formatDateTime(site.lastEvaluatedAt)} />
              <Fact label="Configuration updated" value={formatDateTime(site.configurationUpdatedAt)} />
              <Fact label="Retry recommended" value={yesNo(site.retryable)} />
              <Fact label="Support reference" value={site.supportReference} />
            </dl>
            <button className="secondaryButton" type="button" onClick={copySupportReference}>Copy support reference</button>
            <p className="copyStatus" role="status" aria-live="polite">{copyStatus}</p>
          </DetailSection>
        </div>
      </section>
    </div>
  );
}

function CapabilityMatrix({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <DetailSection title={title}>
      <div className="capabilityMatrix" role="list">
        {rows.map(([label, value]) => <div role="listitem" key={label}><span>{label}</span><StatusPill value={value} label={capabilityStatusLabel(value)} /></div>)}
      </div>
    </DetailSection>
  );
}

function CodeNotices({ title, codes, tone }: { title: string; codes: string[]; tone: "warning" | "danger" }) {
  if (codes.length === 0) {
    return null;
  }
  return (
    <section className={`governanceCodeNotice ${tone}`} aria-label={title}>
      <h3>{title}</h3>
      <ul>{codes.map((code, index) => <li key={`${code}-${index}`}><code>{safeControlledCode(code)}</code><span>{warningSummary(code)}</span></li>)}</ul>
    </section>
  );
}

function GovernanceError({ error, retained, onRetry }: { error: ManagementPlatformUiError; retained: boolean; onRetry: () => void }) {
  const scopeDenied = error.code === "SITE_SCOPE_DENIED" || error.code === "SITE_GROUP_SCOPE_DENIED" || error.code === "SCOPE_DENIED";
  const title = scopeDenied
    ? error.code === "SITE_GROUP_SCOPE_DENIED" ? "Site Group scope denied" : "Site scope denied"
    : error.kind === "permission-denied"
      ? "Evidence governance permission denied"
      : error.kind === "authentication-required"
        ? "Evidence governance session unavailable"
        : error.kind === "malformed-response"
          ? "Evidence governance response malformed"
          : error.kind === "validation"
            ? "Evidence governance filter invalid"
            : "Evidence governance unavailable";
  return (
    <section className={`stateMessage ${scopeDenied || error.kind === "permission-denied" || error.kind === "malformed-response" ? "danger" : "warning"}`} role="alert" aria-label={title}>
      <h2>{title}</h2>
      <p>{error.message}{error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}</p>
      <p>Safe classification: {safeControlledCode(error.code)}. Retryable: {error.retryable ? "Yes" : "No"}.{retained ? " The retained result below is not current." : ""}</p>
      {isEvidenceGovernanceRetryable(error) && <button type="button" onClick={onRetry}>Retry evidence governance</button>}
    </section>
  );
}

function FilterSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]> }) {
  return (
    <label className="formField" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue || optionLabel} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function StatusPill({ value, label }: { value: string; label: string }) {
  return <span className={`statusPill compactPill ${statusTone(value)}`}>{label}</span>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="governanceDetailSection"><h3>{title}</h3>{children}</section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return <article className="rbacSummaryCard"><h3>{title}</h3><p>{value}</p></article>;
}

function StateBlock({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" | "danger" }) {
  return <section className={`stateMessage ${tone}`} role={tone === "danger" ? "alert" : "status"} aria-label={title}><h2>{title}</h2><p>{message}</p></section>;
}

function authorizedSiteGroups(sites: readonly ManagementPlatformSite[]): Array<{ siteGroupId: string; displayName: string }> {
  const groups = new Map<string, string>();
  for (const site of sites) {
    if (site.siteGroupId) {
      groups.set(site.siteGroupId, site.siteGroupDisplayName?.trim() || "Authorized Site Group");
    }
  }
  return Array.from(groups, ([siteGroupId, displayName]) => ({ siteGroupId, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function statusTone(value: string): string {
  if (value === "CONFIGURED_READY" || value === "READY") return "successPill";
  if (value === "CONFIGURED_PARTIALLY_READY" || value === "PARTIALLY_READY" || value === "STALE") return "warningPill";
  if (value === "CONFIGURATION_INCOMPLETE" || value === "CAPTURE_DISABLED" || value === "CONFIGURATION_UNAVAILABLE" || value === "NOT_CONFIGURED" || value === "DISABLED" || value === "NOT_IMPLEMENTED" || value === "UNAVAILABLE") return "dangerPill";
  return "warningPill";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(value?: number | null): string {
  if (value === undefined || value === null) return "Not supplied";
  return `${new Intl.NumberFormat().format(value)} bytes`;
}

function formatDuration(value?: number | null): string {
  if (value === undefined || value === null) return "Not supplied";
  return `${value} seconds`;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
