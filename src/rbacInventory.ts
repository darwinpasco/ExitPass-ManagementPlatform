import { createUiError } from "./apiClient";
import type { CentralPmsApiClient, ManagementPlatformSite, ManagementPlatformUiError } from "./types";

export const rbacInventoryRoute = "/management-platform/access-control";
export const rbacInventoryApiRoute = "/v1/ops/management-platform/identity-rbac/inventory";

export type RbacImplementationStatus =
  | "implemented"
  | "implemented-with-limitations"
  | "contract-only"
  | "target-only"
  | "blocked-by-persistence"
  | "blocked-by-missing-api"
  | "deprecated"
  | string;

export interface RbacInventoryResponse {
  users: RbacIdentityUser[];
  roleBundles: RbacRoleBundle[];
  permissions: RbacPermission[];
  policyMappings: RbacPolicyMapping[];
  userRoleAssignments: RbacUserRoleAssignment[];
  userSiteScopes: RbacUserSiteScope[];
  deviceBindings: RbacDeviceBinding[];
  shifts: RbacShift[];
  gaps: RbacInventoryGap[];
  generatedAt: string;
}

export interface RbacIdentityUser {
  userId: string;
  username: string;
  displayName: string;
  email?: string | null;
  status: string;
  sourceSystem: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RbacRoleBundle {
  roleKey: string;
  displayName: string;
  purpose: string;
  typicalAccessRights: string[];
  defaultRestrictions: string[];
  targetSurface: string;
}

export interface RbacPermission {
  permissionKey: string;
  displayLabel: string;
  category: string;
  sourceCatalog: string;
  mappedPolicies: string[];
  status: RbacImplementationStatus;
  notes?: string | null;
}

export interface RbacPolicyMapping {
  policyName: string;
  permissions: string[];
  routeOrFeatureArea: string;
  implementedStatus: RbacImplementationStatus;
  notes?: string | null;
}

export interface RbacUserRoleAssignment {
  userId: string;
  roleId?: string | null;
  roleKey: string;
  roleName: string;
  roleStatus: string;
  assignmentStatus: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface RbacUserSiteScope {
  userId: string;
  siteGroupId?: string | null;
  siteId?: string | null;
  siteGroupName: string;
  siteName: string;
  source: string;
  status: string;
}

export interface RbacDeviceBinding {
  deviceBindingId: string;
  deviceLabel: string;
  assignedUserId?: string | null;
  siteGroupId?: string | null;
  siteId?: string | null;
  status: string;
  trustStatus: string;
  lastSeenAt?: string | null;
}

export interface RbacShift {
  shiftId: string;
  operatorUserId?: string | null;
  siteGroupId?: string | null;
  siteId?: string | null;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface RbacInventoryGap {
  gapKey: string;
  severity: string;
  summary: string;
}

export interface RbacInventoryClient {
  getInventory(signal?: AbortSignal): Promise<RbacInventoryResponse>;
}

export type RbacInventoryScenarioName =
  | "populated"
  | "mixed"
  | "empty"
  | "unavailable"
  | "malformed"
  | "partial-scope";

export interface RbacInventoryScenario {
  name: RbacInventoryScenarioName;
  client: RbacInventoryClient;
}

export function createRbacInventoryClient(apiClient: CentralPmsApiClient): RbacInventoryClient {
  return {
    async getInventory(signal) {
      const response = await apiClient.request<unknown>(rbacInventoryApiRoute, { signal });
      return assertInventoryResponse(response);
    }
  };
}

export function resolveRbacInventoryScenario(isDevelopment: boolean, search: string): RbacInventoryScenario | undefined {
  if (!isDevelopment) {
    return undefined;
  }

  const scenarioName = normalizeScenarioName(new URLSearchParams(search).get("mpRbacScenario"));
  if (!scenarioName) {
    return undefined;
  }

  return {
    name: scenarioName,
    client: createScenarioClient(scenarioName)
  };
}

export function groupPermissionsByDomain(permissions: readonly RbacPermission[]): Array<{ domain: string; permissions: RbacPermission[] }> {
  const groups = new Map<string, RbacPermission[]>();
  for (const permission of permissions) {
    const domain = permission.category?.trim() || "Uncategorized";
    groups.set(domain, [...(groups.get(domain) ?? []), permission]);
  }

  return Array.from(groups.entries())
    .map(([domain, groupedPermissions]) => ({
      domain,
      permissions: groupedPermissions.sort((first, second) => first.permissionKey.localeCompare(second.permissionKey))
    }))
    .sort((first, second) => first.domain.localeCompare(second.domain));
}

export function permissionActorClass(permission: RbacPermission): "Human" | "Service" | "Human or service" | "Unresolved" {
  const key = permission.permissionKey.toLowerCase();
  if (key.includes(".submit.webpay") || key.includes(".submit.assisted-payment-terminal") || key.includes("payable-basis.apply")) {
    return "Service";
  }

  if (key.includes("decision.approve") || key.includes("decision.reject") || key.includes("review") || key.includes("evidence") || key.includes("policy")) {
    return "Human";
  }

  if (key.startsWith("management-platform.") || key.startsWith("user.") || key.startsWith("role.") || key.startsWith("permission.") || key.startsWith("assignment.")) {
    return "Human";
  }

  if (key.includes("application.read")) {
    return "Human or service";
  }

  return "Unresolved";
}

export function permissionScopePosture(permission: RbacPermission): string {
  const key = permission.permissionKey.toLowerCase();
  if (key.includes("site-group") || key.includes("site-performance")) {
    return "Site Group";
  }

  if (key.includes("site.") || key.includes("site-") || key.includes("statutory-discounts") || key.includes("ticket") || key.includes("terminal")) {
    return "Site";
  }

  if (key.startsWith("management-platform.") || key.startsWith("rbac.") || key.startsWith("role.") || key.startsWith("permission.")) {
    return "Global administrative";
  }

  return "Unresolved - fails closed";
}

export function permissionAccessClassification(permission: RbacPermission): string {
  const key = permission.permissionKey.toLowerCase();
  if (key.includes(".read") || key.includes(".view") || key.includes(".lookup") || key.includes("inventory.read") || key.includes("report")) {
    return "Read";
  }

  if (key.includes(".manage") || key.includes(".approve") || key.includes(".reject") || key.includes(".create") || key.includes(".capture") || key.includes(".apply") || key.includes(".command")) {
    return "Write or decision";
  }

  return "Unclassified";
}

export function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "implemented":
      return "Implemented and enforced";
    case "implemented-with-limitations":
      return "Implemented with limitations";
    case "contract-only":
      return "Contract-only";
    case "target-only":
      return "Target-only";
    case "blocked-by-persistence":
      return "Blocked by persistence";
    case "blocked-by-missing-api":
      return "Blocked by missing API";
    case "deprecated":
      return "Deprecated or compatibility-only";
    default:
      return status || "Unknown";
  }
}

export function inventoryHasPartialData(inventory: RbacInventoryResponse): boolean {
  return inventory.gaps.length > 0 || inventory.userSiteScopes.some((scope) => !scope.siteGroupId || !scope.siteId);
}

export function inventoryHasTargetOnly(inventory: RbacInventoryResponse): boolean {
  return inventory.permissions.some((permission) => permission.status.toLowerCase() === "target-only") ||
    inventory.policyMappings.some((mapping) => mapping.implementedStatus.toLowerCase() === "target-only");
}

export function scopeSummary(inventory: RbacInventoryResponse, currentSite?: ManagementPlatformSite): string {
  if (inventory.userSiteScopes.length === 0) {
    return currentSite
      ? `No durable scope rows were returned. Browser-selected Site ${currentSite.displayName} is context only, not an authorization grant.`
      : "No current Site context and no durable scope rows were returned. Unknown scope fails closed.";
  }

  const siteCount = new Set(inventory.userSiteScopes.map((scope) => scope.siteId).filter(Boolean)).size;
  const siteGroupCount = new Set(inventory.userSiteScopes.map((scope) => scope.siteGroupId).filter(Boolean)).size;
  return `${siteGroupCount} Site Group scope row(s) and ${siteCount} Site scope row(s) are visible in the read-only inventory. Server enforcement remains authoritative.`;
}

function assertInventoryResponse(value: unknown): RbacInventoryResponse {
  if (!isRecord(value) ||
    !Array.isArray(value.users) ||
    !Array.isArray(value.roleBundles) ||
    !Array.isArray(value.permissions) ||
    !Array.isArray(value.policyMappings) ||
    !Array.isArray(value.userRoleAssignments) ||
    !Array.isArray(value.userSiteScopes) ||
    !Array.isArray(value.deviceBindings) ||
    !Array.isArray(value.shifts) ||
    !Array.isArray(value.gaps) ||
    typeof value.generatedAt !== "string") {
    throw createUiError("malformed-response", "MANAGEMENT_PLATFORM_RBAC_INVENTORY_MALFORMED", "The RBAC inventory response could not be read safely.");
  }

  return value as unknown as RbacInventoryResponse;
}

function createScenarioClient(scenario: RbacInventoryScenarioName): RbacInventoryClient {
  return {
    async getInventory() {
      await scenarioDelay();
      if (scenario === "unavailable") {
        throw createUiError("integration-unavailable", "MANAGEMENT_PLATFORM_RBAC_INVENTORY_UNAVAILABLE", "Access Control inventory is temporarily unavailable.", "dev-rbac-unavailable", 503, true, false);
      }

      if (scenario === "malformed") {
        throw createUiError("malformed-response", "MANAGEMENT_PLATFORM_RBAC_INVENTORY_MALFORMED", "The RBAC inventory response could not be read safely.", "dev-rbac-malformed", 200, false, false);
      }

      if (scenario === "empty") {
        return emptyInventory();
      }

      if (scenario === "partial-scope") {
        return {
          ...populatedInventory(),
          userSiteScopes: [
            {
              userId: "77000000-0000-0000-0000-000000000010",
              siteGroupId: null,
              siteId: null,
              siteGroupName: "Unresolved Site Group",
              siteName: "Unresolved Site",
              source: "PRESENT_BUT_INCOMPLETE",
              status: "UNRESOLVED"
            }
          ],
          gaps: [
            ...populatedInventory().gaps,
            {
              gapKey: "durable-scope-grants-present-but-incomplete",
              severity: "High",
              summary: "Durable Site and Site Group grant persistence is present but incomplete; unresolved scope fails closed."
            }
          ]
        };
      }

      return scenario === "mixed" ? mixedInventory() : populatedInventory();
    }
  };
}

function normalizeScenarioName(value: string | null): RbacInventoryScenarioName | undefined {
  switch (value) {
    case "populated":
    case "mixed":
    case "empty":
    case "unavailable":
    case "malformed":
    case "partial-scope":
      return value;
    default:
      return undefined;
  }
}

function populatedInventory(): RbacInventoryResponse {
  return {
    users: [
      {
        userId: "77000000-0000-0000-0000-000000000010",
        username: "synthetic.rbac.reader",
        displayName: "Synthetic RBAC Reader",
        email: null,
        status: "ACTIVE",
        sourceSystem: "LOCAL_DEVELOPMENT",
        createdAt: null,
        updatedAt: null
      }
    ],
    roleBundles: [
      {
        roleKey: "operations-supervisor",
        displayName: "Operations Supervisor",
        purpose: "Reviews statutory privilege eligibility without payment-time application authority.",
        typicalAccessRights: [
          "statutory-discounts.review.queue.read",
          "statutory-discounts.review.detail.read",
          "statutory-discounts.decision.approve",
          "statutory-discounts.decision.reject"
        ],
        defaultRestrictions: [
          "Requester cannot approve their own statutory request.",
          "No payable-basis application authority."
        ],
        targetSurface: "Operator Console review; Management Platform read-only inventory"
      },
      {
        roleKey: "webpay-service-application",
        displayName: "WebPay Service Application",
        purpose: "Requests payment-time application readback through service authorization.",
        typicalAccessRights: ["statutory-discounts.payable-basis.apply", "statutory-discounts.application.read"],
        defaultRestrictions: ["Service principals cannot approve or reject."],
        targetSurface: "WebPay service integration"
      }
    ],
    permissions: [
      permission("management-platform.identity-rbac.inventory.read", "Identity/RBAC inventory read", "Management Platform", "implemented", ["ManagementPlatformIdentityRbacInventoryRead"]),
      permission("statutory-discounts.draft.create", "Statutory request submission", "Statutory requests", "implemented", ["OperatorConsoleStatutoryDiscountDraftCreate"]),
      permission("statutory-discounts.review.queue.read", "Review queue read", "Statutory review", "target-only", []),
      permission("statutory-discounts.review.detail.read", "Review detail read", "Statutory review", "target-only", []),
      permission("statutory-discounts.decision.approve", "Approve statutory request", "Statutory review", "implemented", ["OperatorConsoleStatutoryDiscountDecisionReview"]),
      permission("statutory-discounts.decision.reject", "Reject statutory request", "Statutory review", "implemented", ["OperatorConsoleStatutoryDiscountDecisionReview"]),
      permission("statutory-discounts.evidence.view", "Evidence read", "Evidence", "implemented", ["OperatorConsoleStatutoryDiscountEvidenceView"]),
      permission("statutory-discounts.audit.read", "Audit read", "Audit", "implemented", ["OperatorConsoleStatutoryDiscountAuditRead"]),
      permission("statutory-discount-policy.manage", "Policy manage", "Policy", "target-only", []),
      permission("statutory-discounts.payable-basis.apply", "Payment-time application", "WebPay service", "implemented-with-limitations", ["OperatorConsoleStatutoryDiscountPayableBasisApply"]),
      permission("statutory-discounts.application.read", "Application readback", "APT service", "target-only", [])
    ],
    policyMappings: [
      {
        policyName: "ManagementPlatformIdentityRbacInventoryRead",
        permissions: ["management-platform.identity-rbac.inventory.read"],
        routeOrFeatureArea: "Management Platform administration",
        implementedStatus: "implemented",
        notes: null
      },
      {
        policyName: "CentralPmsStatutoryDiscountDecisionSubmit",
        permissions: [
          "statutory-discounts.decision.submit.operator-console",
          "statutory-discounts.decision.submit.webpay",
          "statutory-discounts.decision.submit.assisted-payment-terminal"
        ],
        routeOrFeatureArea: "Statutory discount",
        implementedStatus: "implemented",
        notes: "Actor class is server-derived."
      }
    ],
    userRoleAssignments: [
      {
        userId: "77000000-0000-0000-0000-000000000010",
        roleId: "77000000-0000-0000-0000-000000000020",
        roleKey: "operations-supervisor",
        roleName: "Operations Supervisor",
        roleStatus: "ACTIVE",
        assignmentStatus: "ACTIVE",
        effectiveFrom: "2026-07-01T00:00:00Z",
        effectiveTo: null
      }
    ],
    userSiteScopes: [
      {
        userId: "77000000-0000-0000-0000-000000000010",
        siteGroupId: "71000000-0000-0000-0000-000000000900",
        siteId: "71000000-0000-0000-0000-000000000901",
        siteGroupName: "Synthetic Site Group",
        siteName: "Synthetic Site",
        source: "LOCAL_DEVELOPMENT",
        status: "ACTIVE"
      }
    ],
    deviceBindings: [],
    shifts: [],
    gaps: [
      {
        gapKey: "canonical-persistence-present-but-incomplete",
        severity: "High",
        summary: "Canonical persistence verdict is PRESENT_BUT_INCOMPLETE for durable scoped grants and separation-of-duties configuration."
      },
      {
        gapKey: "admin-mutation-apis-missing-by-design",
        severity: "Low",
        summary: "This inventory slice is read-only; user, role, permission, and assignment mutation APIs remain future work."
      }
    ],
    generatedAt: "2026-07-29T00:00:00Z"
  };
}

function mixedInventory(): RbacInventoryResponse {
  const inventory = populatedInventory();
  return {
    ...inventory,
    permissions: inventory.permissions.map((permissionItem) =>
      permissionItem.permissionKey === "statutory-discounts.review.queue.read"
        ? { ...permissionItem, status: "blocked-by-persistence", notes: "Durable scoped grant persistence is present but incomplete." }
        : permissionItem),
    policyMappings: [
      ...inventory.policyMappings,
      {
        policyName: "FutureServiceIdentityAdministration",
        permissions: ["service-identity.manage"],
        routeOrFeatureArea: "Management Platform administration",
        implementedStatus: "blocked-by-missing-api",
        notes: "No browser-safe mutation API is available."
      }
    ]
  };
}

function emptyInventory(): RbacInventoryResponse {
  return {
    users: [],
    roleBundles: [],
    permissions: [],
    policyMappings: [],
    userRoleAssignments: [],
    userSiteScopes: [],
    deviceBindings: [],
    shifts: [],
    gaps: [],
    generatedAt: "2026-07-29T00:00:00Z"
  };
}

function permission(
  permissionKey: string,
  displayLabel: string,
  category: string,
  status: RbacImplementationStatus,
  mappedPolicies: string[]
): RbacPermission {
  return {
    permissionKey,
    displayLabel,
    category,
    sourceCatalog: mappedPolicies.length > 0 ? "CentralPmsRbacPolicyCatalog" : "ManagementPlatformTargetRoleModel",
    mappedPolicies,
    status,
    notes: mappedPolicies.length > 0 ? null : "Target access right; no current Central PMS policy mapping was returned."
  };
}

function scenarioDelay(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 5));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toSafeInventoryError(error: unknown): ManagementPlatformUiError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    return error as ManagementPlatformUiError;
  }

  return createUiError("unknown", "MANAGEMENT_PLATFORM_RBAC_INVENTORY_UNKNOWN", "Access Control inventory could not be loaded safely.");
}
