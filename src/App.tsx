import { useEffect, useMemo, useState } from "react";
import { createCentralPmsApiClient } from "./apiClient";
import { getManagementPlatformConfig } from "./config";
import { DashboardPage } from "./DashboardPage";
import { createDashboardReportingClient, resolveDashboardScenario, type DashboardReportingClient } from "./dashboardReporting";
import { EvidenceGovernancePage } from "./EvidenceGovernancePage";
import { createEvidenceGovernanceClient, evidenceGovernanceRoute, resolveEvidenceGovernanceScenario, type EvidenceGovernanceClient } from "./evidenceGovernance";
import { resolveManagementPlatformManualScenario, type ManagementPlatformManualScenarioName } from "./manualScenarios";
import { IdentityAdministrationPage } from "./IdentityAdministrationPage";
import { createIdentityAdministrationClient, identityAdministrationRoute, resolveIdentityAdministrationScenario, type IdentityAdministrationClient } from "./identityAdministration";
import { PaymentReconciliationPage } from "./PaymentReconciliationPage";
import { createPaymentReconciliationReportingClient, paymentReconciliationRoute, resolvePaymentReconciliationScenario, type PaymentReconciliationReportingClient } from "./paymentReconciliationReporting";
import { FiscalExceptionReportPage } from "./FiscalExceptionReportPage";
import { createFiscalExceptionReportingClient, fiscalExceptionRoute, resolveFiscalExceptionScenario, type FiscalExceptionReportingClient } from "./fiscalExceptionReporting";
import { fiscalExceptionReportingPermission, managementDashboardPermission, managementPlatformIdentityRbacInventoryReadPermission, managementReportCatalogPermission, paymentReconciliationPermission, futureSalesInvoiceProfilePermissions, hasAnyPermission, hasPermission, identityAdministrationPresentationPermissions, statutoryBenefitReviewPermissions, statutoryDiscountPolicyCoverageReadPermission, statutoryEvidenceGovernanceReadPermission } from "./permissions";
import { StatutoryBenefitReviewPage } from "./StatutoryBenefitReviewPage";
import { createStatutoryBenefitReviewClient, statutoryBenefitReviewRoute, type StatutoryBenefitReviewClient } from "./statutoryBenefitReview";
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
  identityAdministration: identityAdministrationRoute,
  paymentReconciliation: paymentReconciliationRoute,
  fiscalExceptions: fiscalExceptionRoute,
  statutoryBenefitReview: statutoryBenefitReviewRoute
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
  dashboardReportingClient?: DashboardReportingClient;
  paymentReconciliationReportingClient?: PaymentReconciliationReportingClient;
  fiscalExceptionReportingClient?: FiscalExceptionReportingClient;
  statutoryBenefitReviewClient?: StatutoryBenefitReviewClient;
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
  dashboardScenariosEnabled?: boolean;
  paymentReconciliationScenariosEnabled?: boolean;
  fiscalExceptionScenariosEnabled?: boolean;
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
  dashboardReportingClient,
  paymentReconciliationReportingClient,
  fiscalExceptionReportingClient,
  statutoryBenefitReviewClient,
  onAuthenticationRequired,
  onAuthenticatedActivity,
  authorizeUnsafeRequest,
  onLogout,
  logoutPending = false,
  developmentScenariosEnabled = false,
  profileScenariosEnabled = false,
  rbacScenariosEnabled = false,
  policyCoverageScenariosEnabled = false,
  evidenceGovernanceScenariosEnabled = false,
  identityAdministrationScenariosEnabled = false,
  dashboardScenariosEnabled = false,
  paymentReconciliationScenariosEnabled = false,
  fiscalExceptionScenariosEnabled = false
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
  const dashboardScenario = useMemo(
    () => dashboardReportingClient ? undefined : resolveDashboardScenario(dashboardScenariosEnabled, window.location.search),
    [dashboardReportingClient, dashboardScenariosEnabled]
  );
  const dashboardClient = useMemo(
    () => dashboardReportingClient ?? dashboardScenario?.client ?? createDashboardReportingClient(centralPmsClient),
    [centralPmsClient, dashboardReportingClient, dashboardScenario?.client]
  );
  const paymentScenario = useMemo(
    () => paymentReconciliationReportingClient ? undefined : resolvePaymentReconciliationScenario(paymentReconciliationScenariosEnabled, window.location.search),
    [paymentReconciliationReportingClient, paymentReconciliationScenariosEnabled]
  );
  const paymentClient = useMemo(
    () => paymentReconciliationReportingClient ?? paymentScenario?.client ?? createPaymentReconciliationReportingClient(centralPmsClient),
    [centralPmsClient, paymentReconciliationReportingClient, paymentScenario?.client]
  );
  const fiscalScenario = useMemo(
    () => fiscalExceptionReportingClient ? undefined : resolveFiscalExceptionScenario(fiscalExceptionScenariosEnabled, window.location.search),
    [fiscalExceptionReportingClient, fiscalExceptionScenariosEnabled]
  );
  const fiscalClient = useMemo(
    () => fiscalExceptionReportingClient ?? fiscalScenario?.client ?? createFiscalExceptionReportingClient(centralPmsClient),
    [centralPmsClient, fiscalExceptionReportingClient, fiscalScenario?.client]
  );
  const benefitReviewClient = useMemo(
    () => statutoryBenefitReviewClient ?? createStatutoryBenefitReviewClient(centralPmsClient),
    [centralPmsClient, statutoryBenefitReviewClient]
  );
  const state = authState ?? manualScenario?.authState ?? { status: "unauthenticated" as const };
  const scenarioInitialPath = authState ? undefined : manualScenario?.initialPath;
  const [path, setPath] = useState(initialPath ?? scenarioInitialPath ?? normalizePath(window.location.pathname));
  const [salesInvoiceFormState, setSalesInvoiceFormState] = useState({ hasUnsavedChanges: false, mutationPending: false });
  const siteSelection = useManagementPlatformSiteSelection(state.principal?.authorizedSites ?? []);
  const scenarioIndicator = manualScenario?.showIndicator || dashboardScenario || paymentScenario || fiscalScenario
    ? <DevelopmentScenarioIndicator scenarioName={fiscalScenario ? `fiscal-exceptions/${fiscalScenario.name}` : paymentScenario ? `payment-reconciliation/${paymentScenario.name}` : dashboardScenario ? `dashboard/${dashboardScenario.name}` : manualScenario!.name} />
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
  const canViewDashboard = hasPermission(principal.permissions, managementDashboardPermission);
  const canReadReportCatalog = hasPermission(principal.permissions, managementReportCatalogPermission);
  const canViewPaymentReconciliation = hasPermission(principal.permissions, paymentReconciliationPermission);
  const canViewFiscalExceptions = hasPermission(principal.permissions, fiscalExceptionReportingPermission);
  const canViewStatutoryBenefitReview = hasPermission(principal.permissions, statutoryBenefitReviewPermissions.list);
  const canReadSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.read);
  const canManageSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.manage);
  const canApproveSalesInvoiceProfiles = hasPermission(principal.permissions, futureSalesInvoiceProfilePermissions.approve);
  const canReadRbacInventory = hasPermission(principal.permissions, managementPlatformIdentityRbacInventoryReadPermission);
  const canReadPolicyCoverage = hasPermission(principal.permissions, statutoryDiscountPolicyCoverageReadPermission);
  const canReadEvidenceGovernance = hasPermission(principal.permissions, statutoryEvidenceGovernanceReadPermission);
  const canUseIdentityAdministration = hasAnyPermission(principal.permissions, identityAdministrationPresentationPermissions);
  const isKnownRoute = path === routes.root || path === routes.overview || path === routes.paymentReconciliation || path === routes.fiscalExceptions || path === routes.statutoryBenefitReview || path === routes.salesInvoiceProfiles || path === routes.rbacInventory || path === routes.policyCoverage || path === routes.evidenceGovernance || path === routes.identityAdministration;
  const shellProps = {
    principalName: principal.displayName,
    username: principal.username,
    sessionExpiresAt: principal.sessionExpiresAt,
    siteGroupScopeCount: principal.authorizedSiteGroupReferences?.length ?? 0,
    hasGlobalScope: principal.hasGlobalScope ?? false,
    siteSelection,
    path,
    navigate,
    canViewDashboard,
    canViewPaymentReconciliation,
    canViewFiscalExceptions,
    canViewStatutoryBenefitReview,
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

  if (path === routes.root && !canViewDashboard) {
    const authorizedLandingRoute = resolveAuthorizedLandingRoute({
      canUseIdentityAdministration,
      canViewPaymentReconciliation,
      canViewFiscalExceptions,
      canViewStatutoryBenefitReview,
      canReadRbacInventory,
      canReadSalesInvoiceProfiles,
      canReadPolicyCoverage,
      canReadEvidenceGovernance
    });
    return <Shell {...shellProps}>{authorizedLandingRoute
      ? <AuthorizedLandingRedirect path={authorizedLandingRoute} onNavigate={navigate} />
      : <NoAuthorizedModules />}</Shell>;
  }

  if (path === routes.overview && !canViewDashboard) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.paymentReconciliation && !canViewPaymentReconciliation) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.fiscalExceptions && !canViewFiscalExceptions) {
    return <Shell {...shellProps}><PermissionDenied /></Shell>;
  }

  if (path === routes.statutoryBenefitReview && !canViewStatutoryBenefitReview) {
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
    return <Shell {...shellProps}><IdentityAdministrationPage client={identityClient} permissions={principal.permissions} /></Shell>;
  }

  if (path === routes.paymentReconciliation) {
    return <Shell {...shellProps}><PaymentReconciliationPage key={principal.subjectRef ?? principal.username ?? "authenticated-session"} client={paymentClient} authorizedSites={principal.authorizedSites} authorizedSiteGroupReferences={principal.authorizedSiteGroupReferences ?? []} currentSite={siteSelection.currentSite} /></Shell>;
  }

  if (path === routes.fiscalExceptions) {
    return <Shell {...shellProps}><FiscalExceptionReportPage key={principal.subjectRef ?? principal.username ?? "authenticated-session"} client={fiscalClient} authorizedSites={principal.authorizedSites} authorizedSiteGroupReferences={principal.authorizedSiteGroupReferences ?? []} currentSite={siteSelection.currentSite} /></Shell>;
  }

  if (path === routes.statutoryBenefitReview) {
    return <Shell {...shellProps}><StatutoryBenefitReviewPage
      key={principal.subjectRef ?? principal.username ?? "authenticated-session"}
      client={benefitReviewClient}
      authorizedSites={principal.authorizedSites}
      canViewDetail={hasPermission(principal.permissions, statutoryBenefitReviewPermissions.detail)}
      canViewEvidence={hasPermission(principal.permissions, statutoryBenefitReviewPermissions.evidence)}
      canApprove={hasPermission(principal.permissions, statutoryBenefitReviewPermissions.approve)}
      canReject={hasPermission(principal.permissions, statutoryBenefitReviewPermissions.reject)}
    /></Shell>;
  }

  return (
    <Shell {...shellProps}>
      <DashboardPage
        client={dashboardClient}
        canReadCatalog={canReadReportCatalog}
        authorizedSites={principal.authorizedSites}
        authorizedSiteGroupReferences={principal.authorizedSiteGroupReferences ?? []}
        currentSite={siteSelection.currentSite}
        canViewPaymentReport={canViewPaymentReconciliation}
        onOpenPaymentReport={() => navigate(routes.paymentReconciliation)}
        canViewFiscalReport={canViewFiscalExceptions}
        onOpenFiscalReport={() => navigate(routes.fiscalExceptions)}
      />
    </Shell>
  );
}

function Shell({ principalName, username, sessionExpiresAt, siteGroupScopeCount, hasGlobalScope, siteSelection, path, navigate, canViewDashboard, canViewPaymentReconciliation, canViewFiscalExceptions, canViewStatutoryBenefitReview, canReadSalesInvoiceProfiles, canReadRbacInventory, canReadPolicyCoverage, canReadEvidenceGovernance, canUseIdentityAdministration, salesInvoiceFormState, environmentName, onLogout, logoutPending, scenarioIndicator, children }: {
  principalName?: string;
  username?: string;
  sessionExpiresAt?: string;
  siteGroupScopeCount: number;
  hasGlobalScope: boolean;
  siteSelection: ReturnType<typeof useManagementPlatformSiteSelection>;
  path: string;
  navigate: (path: string) => void;
  canViewDashboard: boolean;
  canViewPaymentReconciliation: boolean;
  canViewFiscalExceptions: boolean;
  canViewStatutoryBenefitReview: boolean;
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
            {canViewDashboard && (
              <button className={`navLink ${path === routes.root || path === routes.overview ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.overview)}>
                Dashboard
              </button>
            )}
            {canViewPaymentReconciliation && (
              <button className={`navLink reportNavLink ${path === routes.paymentReconciliation ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.paymentReconciliation)}>
                Payment and Reconciliation <span className="navMeta">Internal reporting</span>
              </button>
            )}
            {canViewFiscalExceptions && (
              <button className={`navLink reportNavLink ${path === routes.fiscalExceptions ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.fiscalExceptions)}>
                Sales Invoice Exceptions <span className="navMeta">Fiscal exception reporting</span>
              </button>
            )}
            {canViewStatutoryBenefitReview && (
              <button className={`navLink ${path === routes.statutoryBenefitReview ? "navLinkActive" : ""}`} type="button" onClick={() => navigate(routes.statutoryBenefitReview)}>
                Statutory Benefit Requests <span className="navMeta">Head Office review</span>
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

function DevelopmentScenarioIndicator({ scenarioName }: { scenarioName: ManagementPlatformManualScenarioName | string }) {
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

  if (path === routes.paymentReconciliation) {
    return "Payment and Reconciliation - ExitPass Management Platform";
  }

  if (path === routes.fiscalExceptions) {
    return "Sales Invoice Exceptions - ExitPass Management Platform";
  }

  if (path === routes.statutoryBenefitReview) {
    return "Statutory Benefit Requests - ExitPass Management Platform";
  }

  if (path === routes.root || path === routes.overview) {
    return "Dashboard - ExitPass Management Platform";
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
  canViewPaymentReconciliation: boolean;
  canViewFiscalExceptions: boolean;
  canViewStatutoryBenefitReview: boolean;
}): string | undefined {
  if (access.canViewPaymentReconciliation) return routes.paymentReconciliation;
  if (access.canViewFiscalExceptions) return routes.fiscalExceptions;
  if (access.canViewStatutoryBenefitReview) return routes.statutoryBenefitReview;
  if (access.canUseIdentityAdministration) return routes.identityAdministration;
  if (access.canReadRbacInventory) return routes.rbacInventory;
  if (access.canReadSalesInvoiceProfiles) return routes.salesInvoiceProfiles;
  if (access.canReadPolicyCoverage) return routes.policyCoverage;
  if (access.canReadEvidenceGovernance) return routes.evidenceGovernance;
  return undefined;
}
