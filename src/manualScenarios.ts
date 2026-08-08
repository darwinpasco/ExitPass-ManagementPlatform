import { createDevelopmentPrincipal } from "./auth";
import { futureSalesInvoiceProfilePermissions, identityAdministrationPresentationPermissions, managementPlatformIdentityRbacInventoryReadPermission, managementPlatformOverviewPermission, statutoryDiscountPolicyCoverageReadPermission, statutoryEvidenceGovernanceReadPermission } from "./permissions";
import type { ManagementPlatformAuthState, ManagementPlatformSite, ManagementPlatformUiError } from "./types";

export type ManagementPlatformManualScenarioName =
  | "authenticated"
  | "unauthenticated"
  | "permission-denied"
  | "multi-site"
  | "no-sites"
  | "unavailable"
  | "not-found";

export interface ManagementPlatformManualScenario {
  name: ManagementPlatformManualScenarioName;
  authState: ManagementPlatformAuthState;
  initialPath?: string;
  error?: ManagementPlatformUiError;
  showIndicator: boolean;
}

const oneSite: ManagementPlatformSite = {
  siteId: "71000000-0000-0000-0000-000000000101",
  siteGroupId: "71000000-0000-0000-0000-000000000900",
  siteGroupDisplayName: "Development Site Group",
  sitePosServerId: "72000000-0000-0000-0000-000000000101",
  displayName: "Development Site Alpha"
};

const secondSite: ManagementPlatformSite = {
  siteId: "71000000-0000-0000-0000-000000000102",
  siteGroupId: "71000000-0000-0000-0000-000000000900",
  siteGroupDisplayName: "Development Site Group",
  sitePosServerId: "72000000-0000-0000-0000-000000000102",
  displayName: "Development Site Beta"
};

const defaultDevelopmentPermissions = [managementPlatformOverviewPermission, futureSalesInvoiceProfilePermissions.read];

export function resolveManagementPlatformManualScenario(
  isDevelopment: boolean,
  search: string
): ManagementPlatformManualScenario | undefined {
  if (!isDevelopment) {
    return undefined;
  }

  const searchParams = new URLSearchParams(search);
  const scenarioName = normalizeScenarioName(searchParams.get("mpScenario"));
  const profileScenarioName = searchParams.get("mpProfileScenario");
  const rbacScenarioName = searchParams.get("mpRbacScenario");
  const policyCoverageScenarioName = searchParams.get("mpPolicyCoverageScenario");
  const evidenceGovernanceScenarioName = searchParams.get("mpEvidenceGovernanceScenario");
  const identityScenarioName = searchParams.get("mpIdentityScenario");
  const scenarioPermissions = resolveDevelopmentPermissions(profileScenarioName, rbacScenarioName, policyCoverageScenarioName, evidenceGovernanceScenarioName, identityScenarioName);

  switch (scenarioName) {
    case "unauthenticated":
      return {
        name: scenarioName,
        authState: { status: "unauthenticated" },
        showIndicator: true
      };
    case "permission-denied":
      return {
        name: scenarioName,
        authState: {
          status: "authenticated",
          principal: createDevelopmentPrincipal({
            displayName: "Development Permission Denied User",
            permissions: [],
            authorizedSites: [oneSite]
          })
        },
        showIndicator: true
      };
    case "multi-site":
      return {
        name: scenarioName,
        authState: {
          status: "authenticated",
          principal: createDevelopmentPrincipal({
            displayName: "Development Multi Site User",
            permissions: scenarioPermissions,
            authorizedSites: [oneSite, secondSite]
          })
        },
        showIndicator: true
      };
    case "no-sites":
      return {
        name: scenarioName,
        authState: {
          status: "authenticated",
          principal: createDevelopmentPrincipal({
            displayName: "Development No Site User",
            permissions: scenarioPermissions,
            authorizedSites: []
          })
        },
        showIndicator: true
      };
    case "unavailable":
      return {
        name: scenarioName,
        authState: {
          status: "authenticated",
          principal: createDevelopmentPrincipal({
            displayName: "Development Unavailable User",
            permissions: scenarioPermissions,
            authorizedSites: [oneSite]
          })
        },
        error: {
          kind: "integration-unavailable",
          code: "MANAGEMENT_PLATFORM_DEVELOPMENT_UNAVAILABLE",
          message: "Management Platform is unavailable in this development scenario.",
          correlationId: "dev-scenario-correlation-0001",
          retryable: false,
          mutationUncertain: false
        },
        showIndicator: true
      };
    case "not-found":
      return {
        ...authenticatedScenario(true, scenarioPermissions),
        name: scenarioName,
        initialPath: "/management-platform/development-not-found"
      };
    case "authenticated":
    default:
      return authenticatedScenario(true, scenarioPermissions);
  }
}

function authenticatedScenario(showIndicator: boolean, permissions: string[]): ManagementPlatformManualScenario {
  return {
    name: "authenticated",
    authState: {
      status: "authenticated",
      principal: createDevelopmentPrincipal({
        permissions,
        authorizedSites: [oneSite]
      })
    },
    showIndicator
  };
}

function normalizeScenarioName(value: string | null): ManagementPlatformManualScenarioName {
  switch (value) {
    case "unauthenticated":
    case "permission-denied":
    case "multi-site":
    case "no-sites":
    case "unavailable":
    case "not-found":
      return value;
    default:
      return "authenticated";
  }
}

function resolveDevelopmentPermissions(profileScenarioName: string | null, rbacScenarioName: string | null, policyCoverageScenarioName: string | null, evidenceGovernanceScenarioName: string | null, identityScenarioName: string | null): string[] {
  const rbacPermissions = isRbacInventoryScenario(rbacScenarioName)
    ? [managementPlatformIdentityRbacInventoryReadPermission]
    : [];
  const coveragePermissions = isPolicyCoverageScenario(policyCoverageScenarioName)
    ? [statutoryDiscountPolicyCoverageReadPermission]
    : [];
  const evidenceGovernancePermissions = isEvidenceGovernanceScenario(evidenceGovernanceScenarioName)
    ? [statutoryEvidenceGovernanceReadPermission]
    : [];
  const identityPermissions = identityScenarioName ? [...identityAdministrationPresentationPermissions] : [];

  if (isApproveOnlyProfileScenario(profileScenarioName)) {
    return [...defaultDevelopmentPermissions, ...rbacPermissions, ...coveragePermissions, ...evidenceGovernancePermissions, ...identityPermissions, futureSalesInvoiceProfilePermissions.approve];
  }

  if (isManageProfileScenario(profileScenarioName)) {
    return [...defaultDevelopmentPermissions, ...rbacPermissions, ...coveragePermissions, ...evidenceGovernancePermissions, ...identityPermissions, futureSalesInvoiceProfilePermissions.manage];
  }

  return [...defaultDevelopmentPermissions, ...rbacPermissions, ...coveragePermissions, ...evidenceGovernancePermissions, ...identityPermissions];
}

function isEvidenceGovernanceScenario(value: string | null): boolean {
  switch (value) {
    case "ready":
    case "partially-ready":
    case "incomplete":
    case "capture-disabled":
    case "configuration-unavailable":
    case "stale":
    case "unknown":
    case "empty-scope":
    case "permission-denied":
    case "site-denied":
    case "site-group-denied":
    case "malformed":
    case "unavailable":
    case "transient-failure":
    case "api-boundary":
      return true;
    default:
      return false;
  }
}

function isRbacInventoryScenario(value: string | null): boolean {
  switch (value) {
    case "populated":
    case "mixed":
    case "api-boundary":
    case "empty":
    case "unavailable":
    case "malformed":
    case "partial-scope":
      return true;
    default:
      return false;
  }
}

function isPolicyCoverageScenario(value: string | null): boolean {
  switch (value) {
    case "site-group-covered":
    case "site-covered":
    case "mixed":
    case "senior-citizen":
    case "pwd":
    case "no-coverage":
    case "empty":
    case "scope-denied":
    case "scope-not-found":
    case "source-unavailable":
    case "timeout":
    case "malformed-response":
    case "malformed-authoritative":
    case "unexpected-failure":
    case "ambiguous-scope":
    case "api-boundary":
      return true;
    default:
      return false;
  }
}

function isApproveOnlyProfileScenario(value: string | null): boolean {
  switch (value) {
    case "approve-user":
    case "approve-draft-complete":
    case "approve-draft-incomplete":
    case "approve-success":
    case "approve-conflict":
    case "approve-timeout":
    case "retire-approved":
    case "retire-success":
    case "retire-conflict":
    case "retire-timeout":
    case "retired-history":
    case "approve-forbidden":
    case "retire-forbidden":
    case "new-version-approve-only":
      return true;
    default:
      return false;
  }
}

function isManageProfileScenario(value: string | null): boolean {
  switch (value) {
    case "manage":
    case "manage-without-approve":
    case "fiscal-identity-create-success":
    case "fiscal-identity-create-conflict":
    case "fiscal-identity-update-success":
    case "fiscal-identity-update-immutable":
    case "profile-create-success":
    case "profile-create-conflict":
    case "profile-create-timeout":
    case "draft-edit-success":
    case "draft-edit-conflict":
    case "approved-read-only":
    case "retired-read-only":
    case "forbidden-manage":
    case "disabled-manage":
    case "unavailable-manage":
    case "new-version-manage":
    case "new-version-success":
    case "new-version-duplicate-conflict":
    case "new-version-overlap-conflict":
    case "new-version-timeout":
    case "new-version-site-mismatch":
    case "new-version-source-not-active":
    case "new-version-source-not-found":
    case "new-version-cancel":
    case "new-version-unsaved-site-switch":
    case "new-version-pending-site-switch":
    case "new-version-double-submit":
    case "new-version-source-preserved":
    case "new-version-unknown-status":
      return true;
    default:
      return false;
  }
}
