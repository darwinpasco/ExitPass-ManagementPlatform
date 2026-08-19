import { useEffect, useMemo, useState } from "react";
import { createCentralPmsApiClient } from "./apiClient";
import { getManagementPlatformConfig } from "./config";
import { EvidenceGovernancePage } from "./EvidenceGovernancePage";
import { createEvidenceGovernanceClient, evidenceGovernanceRoute, resolveEvidenceGovernanceScenario, type EvidenceGovernanceClient } from "./evidenceGovernance";
import { resolveManagementPlatformManualScenario, type ManagementPlatformManualScenarioName } from "./manualScenarios";
import { IdentityAdministrationPage } from "./IdentityAdministrationPage";
import { createIdentityAdministrationClient, identityAdministrationRoute, resolveIdentityAdministrationScenario, type IdentityAdministrationClient } from "./identityAdministration";
import { managementPlatformIdentityRbacInventoryReadPermission, managementPlatformOverviewPermission, futureSalesInvoiceProfilePermissions, hasAnyPermission, hasPermission, identityAdministrationPresentationPermissions, statutoryDiscountPolicyCoverageReadPermission, statutoryEvidenceGovernanceReadPermission } from "./permissions";
import { PolicyCoveragePage } from "./PolicyCoveragePage";
import { createPolicyCoverageClient, policyCoverageRoute, resolvePolicyCoverageScenario, type PolicyCoverageClient } from "./policyCoverage";
import { RbacInventoryPage } from "./RbacInventoryPage";
import { createRbacInventoryClient, rbacInventoryRoute, resolveRbacInventoryScenario, type RbacInventoryClient } from "./rbacInventory";
import { SalesInvoiceProfilesPage } from "./SalesInvoiceProfilesPage";
import { createSalesInvoiceProfileReadClient, resolveSalesInvoiceProfileReadScenario, salesInvoiceProfileReadRoute, type SalesInvoiceProfileClient } from "./salesInvoiceProfiles";
import { useManagementPlatformSiteSelection } from "./siteContext";
import type { ManagementPlatformAuthState, ManagementPlatformConfig, ManagementPlatformUiError } from "./types";

const routes = {
  root: "/management-platform",
  overview: "/management-platform/overview",
  salesInvoiceProfiles: salesInvoiceProfileReadRoute,
  rbacInventory: rbacInventoryRoute,
  policyCoverage: policyCoverageRoute,
  evidenceGovernance: evidenceGovernanceRoute,
  identityAdministration: identityAdministrationRoute
};

interface AppProps {
  authState?: ManagementPlatformAuthState;
  initialPath?: string;
  config?: ManagementPlatformConfig;
  salesInvoiceProfilesClient?: SalesInvoiceProfileClient;
  rbacInventoryClient?: RbacInventoryClient;
  policyCoverageClient?: PolicyCoverageClient;
  evidenceGovernanceClient?: EvidenceGovernanceClient;
  identityAdministrationClient?: IdentityAdministrationClient;
  onAuthenticationRequired?: () => void;
  onAuthenticatedActivity?: () => void;
  authorizeUnsafeRequest?: (headers: Headers) => void;
  onLogout?: () => void;
  logoutPending?: boolean;
  developmentScenariosEnabled?: boolean;
  profileScenariosEnabled?: boolean;
  rbacScenariosEnabled?: boolean;
  policyCoverageScenariosEnabled?: boolean;
  evidenceGovernanceScenariosEnabled?: boolean;
  identityAdministrationScenariosEnabled?: boolean;
}

export function App({
  authState,
  initialPath,
  config,
  salesInvoiceProfilesClient,
  rbacInventoryClient,
  policyCoverageClient,
  evidenceGovernanceClient,
  identityAdministrationClient,
  onAuthenticationRequired,
  onAuthenticatedActivity,
  authorizeUnsafeRequest,
  onLogout,
  logoutPending = false,
  developmentScenariosEnabled = import.meta.env.DEV,
  profileScenariosEnabled = import.meta.env.DEV,
  rbacScenariosEnabled = import.meta.env.DEV,
  policyCoverageScenariosEnabled = import.meta.env.DEV,
  evidenceGovernanceScenariosEnabled = import.meta.env.DEV,
  identityAdministrationScenariosEnabled = import.meta.env.DEV
}: AppProps) {
  const resolvedConfig = useMemo(() => config ?? getManagementPlatformConfig(), [config]);
  const manualScenario = useMemo(
    () => authState || !import.meta.env.DEV || !developmentScenariosEnabled
      ? undefined
      : resolveManagementPlatformManualScenario(true, window.location.search),
    [authState, developmentScenariosEnabled]
  );
  const profileScenario = useMemo(
    () => salesInvoiceProfilesClient ? undefined : resolveSalesInvoiceProfileReadScenario(profileScenariosEnabled, window.location.search),
    [salesInvoiceProfilesClient, profileScenariosEnabled]
  );
  const rbacScenario = useMemo(
    () => rbacInventoryClient ? undefined : resolveRbacInventoryScenario(rbacScenariosEnabled, window.location.search),
    [rbacInventoryClient, rbacScenariosEnabled]
  );
  const policyCoverageScenario = useMemo(
    () => policyCoverageClient ? undefined : resolvePolicyCoverageScenario(policyCoverageScenariosEnabled, window.location.search),
    [policyCoverageClient, policyCoverageScenariosEnabled]
  );
  const evidenceGovernanceScenario = useMemo(
    () => evidenceGovernanceClient ? undefined : resolveEvidenceGovernanceScenario(evidenceGovernanceScenariosEnabled, window.location.search),
    [evidenceGovernanceClient, evidenceGovernanceScenariosEnabled]
  );
  const centralPmsClient = useMemo(
    () => createCentralPmsApiClient({ basePath: resolvedConfig.centralPmsApiBasePath, onAuthenticationRequired, onAuthenticatedActivity, authorizeUnsafeRequest }),
    [authorizeUnsafeRequest, onAuthenticatedActivity, onAuthenticationRequired, resolvedConfig.centralPmsApiBasePath]
  );
  const profileClient = useMemo(
    () => salesInvoiceProfilesClient ?? profileScenario?.client ?? createSalesInvoiceProfileReadClient(centralPmsClient),
    [salesInvoiceProfilesClient, profileScenario?.client, centralPmsClient]
  );
  const rbacClient = useMemo(
    () => rbacInventoryClient ?? rbacScenario?.client ?? createRbacInventoryClient(centralPmsClient),
    [rbacInventoryClient, rbacScenario?.client, centralPmsClient]
  );
  const coverageClient = useMemo(
    () => policyCoverageClient ?? policyCoverageScenario?.client ?? createPolicyCoverageClient(centralPmsClient),
    [policyCoverageClient, policyCoverageScenario?.client, centralPmsClient]
  );
  const governanceClient = useMemo(
    () => evidenceGovernanceClient ?? evidenceGovernanceScenario?.client ?? createEvidenceGovernanceClient(centralPmsClient),
    [evidenceGovernanceClient, evidenceGovernanceScenario?.client, centralPmsClient]
  );
  const identityScenario = useMemo(
    () => identityAdministrationClient ? undefined : resolveIdentityAdministrationScenario(identityAdministrationScenariosEnabled, window.location.search),
    [identityAdministrationClient, identityAdministrationScenariosEnabled]
  );
  const identityClient = useMemo(
    () => identityAdministrationClient ?? identityScenario?.client ?? createIdentityAdministrationClient(centralPmsClient),
    [centralPmsClient, identityAdministrationClient, identityScenario?.client]
  );
  const state = authState ?? manualScenario?.authState ?? { status: "unauthenticated" as const };
  const scenarioInitialPath = authState ? undefined : manualScenario?.initialPath;
  const [path, setPath] = useState(initialPath ?? scenarioInitialPath ?? normalizePath(window.location.pathname));
  const [salesInvoiceFormState, setSalesInvoiceFormState] = useState({ hasUnsavedChanges: false, mutationPending: false });
  const scenarioIndicator = manualScenario?.showIndicator
    ? <DevelopmentScenarioIndicator scenarioName={manualScenario.name} />
    : null;

  useEffect(() => {
    document.title = routeTitle(path);
  }, [path]);

  useEffect(() => {
    if (initialPath || scenarioInitialPath) {
      return;
    }

    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialPath, scenarioInitialPath]);

  function navigate(nextPath: string) {
    setPath(nextPath);
    if (!initialPath && !scenarioInitialPath) {
      window.history.pushState({}, "", nextPath);
    }
  }

  if (state.status === "loading") {
    return <>{scenarioIndicator}<LoadingState message="Loading Management Platform access" /></>;
  }

  if (state.status === "error") {
    return <>{scenarioIndicator}<PageError error={{ kind: "unknown", code: "MANAGEMENT_PLATFORM_AUTH_CONTEXT_UNAVAILABLE", message: state.message ?? "Management Platform access could not be resolved safely.", retryable: false, mutationUncertain: false }} /></>;
  }

  if (state.status === "unauthenticated" || !state.principal?.authenticated) {
    return <>{scenarioIndicator}<AuthenticationRequired /></>;
  }

  const principal = state.principal;
  const siteSelection = useManagementPlatformSiteSelection(principal.authorizedSites);
  const canViewOverview = hasPermission(principal.permissions, managementPlatformOverviewPermission);
  const canReadSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.read);
  const canManageSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.manage);
  const canApproveSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.approve);
  const canReadRbacInventory = hasPermission(principal.permissions, managementPlatformIdentityRbacInventoryReadPermission);
  const canReadPolicyCoverage = hasPermission(principal.permissions, statutoryDiscountPolicyCoverageReadPermission);
  const canReadEvidenceGovernance = hasPermission(principal.permissions, statutoryEvidenceGovernanceReadPermission);
  const canUseIdentityAdministration = hasAnyPermission(principal.permissions, identityAdministrationPresentationPermissions);
  const isKnownRoute = path === routes.root || path === routes.overview || path === routes.salesInvoiceProfiles || path === routes.rbacInventory || path === routes.policyCoverage || path === routes.evidenceGovernance || path === routes.identityAdministration;
  const shellProps = {
    principalName: principal.displayName,
    username: principal.username,
    sessionExpiresAt: principal.sessionExpiresAt,
    siteGroupScopeCount: principal.authorizedSiteGroupReferences?.length ?? 0,
    hasGlobalScope: principal.hasGlobalScope ?? false,
    siteSelection,
    path,
    navigate,
    canViewOverview,
    canReadSalesInvoiceProfiles,
    canReadRbacInventory,
    canReadPolicyCoverage,
    canReadEvidenceGovernance,
    canUseIdentityAdministration,
    salesInvoiceFormState,
    environmentName: resolvedConfig.environmentName,
    onLogout,
    logoutPending,
    scenarioIndicator
  };

  if (!isKnownRoute) {
    return <Shell {...shellProps}><NotFound /></Shell>;
  }

  if (path === routes.root && !canViewOverview) {
    const authorizedLandingRoute = resolveAuthorizedLandingRoute({
      canUseIdentityAdministration,
      canReadRbacInventory,
      canReadSalesInvoiceProfiles,
      canReadPolicyCoverage,
      canReadEvidenceGovernance
    });
    return <Shell {...shellProps}>{authorizedLandingRoute
      ? <AuthorizedLandingRedirect path={authorizedLandingRoute} onNavigate={navigate} />
      : <NoAuthorizedModules />}</Shell>;
  }

  if (path === routes.overview && !canViewOverview) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.salesInvoiceProfiles && !canReadSalesInvoiceProfiles) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.rbacInventory && !canReadRbacInventory) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.policyCoverage && !canReadPolicyCoverage) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.evidenceGovernance && !canReadEvidenceGovernance) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.identityAdministration && !canUseIdentityAdministration) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (manualScenario?.error) {
    return <Shell {...shellProps}><PageError error={manualScenario.error} /></Shell>;
  }

  if (path === routes.salesInvoiceProfiles) {
    return (
      <Shell {...shellProps}>
        <SalesInvoiceProfilesPage
          currentSite={siteSelection.currentSite}
          client={profileClient}
          developmentScenarioName={profileScenario?.name}
          canManage={canManageSalesInvoiceProfiles}
          canApprove={canApproveSalesInvoiceProfiles}
          onFormStateChange={setSalesInvoiceFormState}
        />
      </Shell>
    );
  }

  if (path === routes.rbacInventory) {
    return (
      <Shell {...shellProps}>
        <RbacInventoryPage
          currentSite={siteSelection.currentSite}
          client={rbacClient}
          developmentScenarioName={rbacScenario?.name}
        />
      </Shell>
    );
  }

  if (path === routes.policyCoverage) {
    return (
      <Shell {...shellProps}>
        <PolicyCoveragePage
          authorizedSites={principal.authorizedSites}
          currentSite={siteSelection.currentSite}
          client={coverageClient}
          developmentScenarioName={policyCoverageScenario?.name}
        />
      </Shell>
    );
  }

  if (path === routes.evidenceGovernance) {
    return (
      <Shell {...shellProps}>
        <EvidenceGovernancePage
          authorizedSites={principal.authorizedSites}
          currentSite={siteSelection.currentSite}
          client={governanceClient}
          developmentScenarioName={evidenceGovernanceScenario?.name}
        />
      </Shell>
    );
  }


  if (path === routes.identityAdministration) {
    return <Shell {...shellProps}><IdentityAdministrationPage client={identityClient} permissions={principal.permissions} authorizedSites={principal.authorizedSites} authorizedSiteGroupReferences={principal.authorizedSiteGroupReferences ?? []} /></Shell>;
  }

  return (
    <Shell {...shellProps}>
      <OverviewPage principalName={principal.displayName} currentSiteName={siteSelection.currentSite?.displayName} siteScopeCount={principal.authorizedSites.length} siteGroupScopeCount={principal.authorizedSiteGroupReferences?.length ?? 0} hasGlobalScope={principal.hasGlobalScope ?? false} />
    </Shell>
  );
}

function Shell({ principalName, username, sessionExpiresAt, siteGroupScopeCount, hasGlobalScope, siteSelection, path, navigate, canViewOverview, canReadSalesInvoiceProfiles, canReadRbacInventory, canReadPolicyCoverage, canReadEvidenceGovernance, canUseIdentityAdministration, salesInvoiceFormState, environmentName, onLogout, logoutPending, scenarioIndicator, children }: {
  principalName?: string;
  username?: string;
  sessionExpiresAt?: string;
  siteGroupScopeCount: number;
  hasGlobalScope: boolean;
  siteSelection: ReturnType<typeof useManagementPlatformSiteSelection>;
  path: string;
  navigate: (path: string) => void;
  canViewOverview: boolean;
  canReadSalesInvoiceProfiles: boolean;
  canReadRbacInventory: boolean;
  canReadPolicyCoverage: boolean;
  canReadEvidenceGovernance: boolean;
  canUseIdentityAdministration: boolean;
  salesInvoiceFormState: { hasUnsavedChanges: boolean; mutationPending: boolean };
  environmentName: string;
  onLogout?: () => void;
  logoutPending: boolean;
  scenarioIndicator?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="appShell" aria-labelledby="app-title">
      <header className="appHeader">
        <div>
          <p className="eyebrow">Management Platform</p>
          <h1 id="app-title">ExitPass Management Platform</h1>
          <p className="headerCopy">Manage governed configuration and access workflows.</p>
        </div>
        <div className="identityPanel" aria-label="Authenticated Management Platform user">
          <span>User</span>
          <strong>{principalName ?? "Authenticated user"}</strong>
          {username && <small>{username}</small>}
          <small>{scopeSummary(hasGlobalScope, siteSelection.sites.length, siteGroupScopeCount)}</small>
          {sessionExpiresAt && <small>Session expires {formatSessionExpiry(sessionExpiresAt)}</small>}
          <small>{environmentName}</small>
          {onLogout && <button className="secondaryButton identityLogout" type="button" disabled={logoutPending} onClick={onLogout}>{logoutPending ? "Signing out" : "Sign out"}</button>}
        </div>
      </header>

      {scenarioIndicator}

      <section className="platformShell">
        <aside className="moduleRail" aria-label="Management Platform navigation">
          <div className="panelHeader">
            <p className="eyebrow">Workspace</p>
            <h2>Navigation</h2>
          </div>
          <nav aria-label="Management Platform routes">
            {canViewOverview && (
              <button className={`navLink ${path === routes.root || path === routes.overview ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.overview)}>
                Overview
              </button>
            )}
            {canReadSalesInvoiceProfiles && (
              <button className={`navLink ${path === routes.salesInvoiceProfiles ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.salesInvoiceProfiles)}>
                Sales Invoice Configuration <span className="navMeta">Sales Invoice Setups</span>
              </button>
            )}
            {canReadRbacInventory && (
              <button className={`navLink ${path === routes.rbacInventory ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.rbacInventory)}>
                Access Control <span className="navMeta">RBAC Inventory</span>
              </button>
            )}
            {canUseIdentityAdministration && (
              <button className={`navLink ${path === routes.identityAdministration ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.identityAdministration)}>
                User Administration <span className="navMeta">Users and access</span>
              </button>
            )}
            {canReadPolicyCoverage && (
              <button className={`navLink ${path === routes.policyCoverage ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.policyCoverage)}>
                Statutory Policy Coverage <span className="navMeta">Read-only</span>
              </button>
            )}
            {canReadEvidenceGovernance && (
              <button className={`navLink ${path === routes.evidenceGovernance ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.evidenceGovernance)}>
                Evidence Governance <span className="navMeta">Read-only readiness</span>
              </button>
            )}
          </nav>
          <SiteSelector siteSelection={siteSelection} siteGroupScopeCount={siteGroupScopeCount} formState={salesInvoiceFormState} />
        </aside>

        <section className="workspace" aria-live="polite">
          {children}
        </section>
      </section>
    </main>
  );
}

function DevelopmentScenarioIndicator({ scenarioName }: { scenarioName: ManagementPlatformManualScenarioName }) {
  return (
    <div className="developmentScenario" role="status" aria-label="Development scenario">
      Development scenario: <strong>{scenarioName}</strong>
    </div>
  );
}

function SiteSelector({ siteSelection, siteGroupScopeCount, formState }: {
  siteSelection: ReturnType<typeof useManagementPlatformSiteSelection>;
  siteGroupScopeCount: number;
  formState: { hasUnsavedChanges: boolean; mutationPending: boolean };
}) {
  if (!siteSelection.hasSites) {
    const message = siteGroupScopeCount > 0
      ? `No directly assigned Sites. Access is available through ${siteGroupScopeCount} authorized Site Group${siteGroupScopeCount === 1 ? "" : "s"}.`
      : "No Sites are currently available for your Management Platform permissions.";
    return <StateMessage title={siteGroupScopeCount > 0 ? "No directly assigned Sites" : "No authorized Sites"} message={message} tone="warning" />;
  }

  return (
    <div className="sitePanel">
      <label htmlFor="site-selector">Current Site</label>
      <select
        id="site-selector"
        value={siteSelection.currentSite?.siteId ?? ""}
        disabled={formState.mutationPending}
        onChange={(event) => {
          if (formState.hasUnsavedChanges && !window.confirm("Discard unsaved Sales Invoice Setup changes before switching Site?")) {
            event.currentTarget.value = siteSelection.currentSite?.siteId ?? "";
            return;
          }

          siteSelection.switchSite(event.target.value);
        }}
      >
        {siteSelection.sites.map((site) => (
          <option key={site.siteId} value={site.siteId}>{site.displayName}</option>
        ))}
      </select>
      <p>{siteSelection.currentSite?.siteGroupDisplayName ? `Site Group: ${siteSelection.currentSite.siteGroupDisplayName}` : "Site authority is resolved by Central PMS"}</p>
    </div>
  );
}

function OverviewPage({ principalName, currentSiteName, siteScopeCount, siteGroupScopeCount, hasGlobalScope }: { principalName?: string; currentSiteName?: string; siteScopeCount: number; siteGroupScopeCount: number; hasGlobalScope: boolean }) {
  return (
    <section className="panel" aria-labelledby="overview-title">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">Overview</p>
          <h2 id="overview-title">Management Platform foundation</h2>
        </div>
        <span className="statusPill">Foundation ready</span>
      </div>
      <div className="overviewGrid">
        <article>
          <h3>Purpose</h3>
          <p>Administrative modules will appear here as they are enabled for your permissions and Site scope.</p>
        </article>
        <article>
          <h3>Access posture</h3>
          <p>Authenticated as {principalName ?? "a governed Management Platform user"}. Permissions are presented from the current server session and remain server-enforced.</p>
        </article>
        <article>
          <h3>Site context</h3>
          <p>{siteScopeCount > 0 ? `Current Site: ${currentSiteName}` : "No authorized Site is available."}</p>
          <p>{scopeSummary(hasGlobalScope, siteScopeCount, siteGroupScopeCount)}</p>
        </article>
      </div>
      <StateMessage title="Administrative modules" message="Sales Invoice Configuration is available to read-authorized users. This shell does not edit fiscal data, issue documents, print receipts, authorize exits, or operate gates." />
    </section>
  );
}

function scopeSummary(hasGlobalScope: boolean, siteCount: number, siteGroupCount: number): string {
  if (hasGlobalScope) {
    return "Organization-wide access from current session";
  }
  return `${siteCount} Site access grant${siteCount === 1 ? "" : "s"}; ${siteGroupCount} Site Group access grant${siteGroupCount === 1 ? "" : "s"}`;
}

function formatSessionExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "at the server-defined time" : date.toLocaleString();
}

export function AuthenticationRequired() {
  return <StateMessage title="Authentication required" message="Sign in with a Management Platform account to continue." tone="warning" />;
}

export function PermissionDenied() {
  return <StateMessage title="Permission denied" message="Your account is authenticated but does not have permission for this Management Platform route." tone="danger" />;
}

export function NoAuthorizedModules() {
  return <StateMessage title="No authorized modules" message="Your account is authenticated, but no Management Platform modules are available with its current permissions." tone="warning" />;
}

function AuthorizedLandingRedirect({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  useEffect(() => onNavigate(path), [onNavigate, path]);
  return <LoadingState message="Opening your first authorized Management Platform module" />;
}

export function NotFound() {
  return <StateMessage title="Management Platform route not found" message="The requested Management Platform route does not exist." />;
}

export function LoadingState({ message }: { message: string }) {
  return <StateMessage title="Loading" message={message} tone="neutral" />;
}

export function PageError({ error }: { error: ManagementPlatformUiError }) {
  return <StateMessage title="Management Platform error" message={`${error.message}${error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}`} tone="danger" />;
}

export function MutationUncertainMessage({ correlationId }: { correlationId?: string }) {
  return <StateMessage title="Result uncertain" message={`Refresh and verify the authoritative state before trying again.${correlationId ? ` Support reference: ${correlationId}.` : ""}`} tone="warning" />;
}

export function FeatureUnavailable() {
  return <StateMessage title="Feature unavailable" message="This administrative feature is not enabled for this environment." tone="warning" />;
}

function StateMessage({ title, message, tone = "neutral" }: { title: string; message: string; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <section className={`stateMessage ${tone}`} role={tone === "danger" ? "alert" : "status"} aria-label={title}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

function routeTitle(path: string): string {
  if (path === routes.identityAdministration) {
    return "User Administration - ExitPass Management Platform";
  }
  if (path === routes.rbacInventory) {
    return "Access Control - ExitPass Management Platform";
  }

  if (path === routes.policyCoverage) {
    return "Statutory Policy Coverage - ExitPass Management Platform";
  }

  if (path === routes.evidenceGovernance) {
    return "Statutory Evidence Governance - ExitPass Management Platform";
  }

  if (path === routes.salesInvoiceProfiles) {
    return "Sales Invoice Configuration - ExitPass Management Platform";
  }

  if (path === routes.root || path === routes.overview) {
    return "Overview - ExitPass Management Platform";
  }

  return "Not Found - ExitPass Management Platform";
}

function normalizePath(path: string): string {
  return path.replace(/\/$/, "") || routes.root;
}

function resolveAuthorizedLandingRoute(access: {
  canUseIdentityAdministration: boolean;
  canReadRbacInventory: boolean;
  canReadSalesInvoiceProfiles: boolean;
  canReadPolicyCoverage: boolean;
  canReadEvidenceGovernance: boolean;
}): string | undefined {
  if (access.canUseIdentityAdministration) return routes.identityAdministration;
  if (access.canReadRbacInventory) return routes.rbacInventory;
  if (access.canReadSalesInvoiceProfiles) return routes.salesInvoiceProfiles;
  if (access.canReadPolicyCoverage) return routes.policyCoverage;
  if (access.canReadEvidenceGovernance) return routes.evidenceGovernance;
  return undefined;
}
