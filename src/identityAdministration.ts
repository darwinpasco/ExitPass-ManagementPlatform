import { createUiError } from "./apiClient";
import { approvedIdentityRoles, hasApprovedRolePresentation, type AssignableScopeType, type IdentityApplication } from "./approvedIdentityRoles";
import type { CentralPmsApiClient } from "./types";

export const identityAdministrationRoute = "/management-platform/identity-administration";
export const identityAdministrationApiRoute = "/v1/management-platform/identity";
export const delegableScopesApiRoute = `${identityAdministrationApiRoute}/delegable-scopes`;
export const globalScopePolicyNotApprovedClassification = "GLOBAL_SCOPE_POLICY_NOT_APPROVED";

export const identityAdministrationPermissions = {
  userView: "user.view",
  userManage: "user.manage",
  roleView: "role.view",
  permissionView: "permission.view",
  roleAssignmentManage: "identity.role-assignment.manage",
  scopeAssignmentManage: "identity.scope-assignment.manage",
  accessReviewManage: "identity.access-review.manage",
  sessionView: "human-authentication.session.admin.view",
  sessionRevoke: "human-authentication.session.admin.revoke",
  mfaStatusView: "human-authentication.mfa.status.view",
  mfaReset: "human-authentication.mfa.reset",
  mfaRemove: "human-authentication.mfa.remove"
} as const;

export interface IdentityUserSummary {
  userReference: string;
  username: string;
  displayName: string;
  maskedEmail: string | null;
  maskedMobileNumber: string | null;
  userType: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lastLoginAt: string | null;
  rowVersion: number;
}

export interface IdentityRoleAssignment {
  assignmentReference: string;
  userReference: string;
  roleReference: string;
  roleCode: string;
  roleName: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lastReviewedAt: string | null;
  rowVersion: number;
}

export interface IdentityScopeGrant {
  grantReference: string;
  assignmentReference: string;
  scopeType: "SITE" | "SITE_GROUP" | "GLOBAL" | string;
  siteReference: string | null;
  siteGroupReference: string | null;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lastReviewedAt: string | null;
  rowVersion: number;
}

export interface DelegableSiteGroup {
  siteGroupId: string;
  siteGroupCode: string;
  siteGroupName: string;
  lifecycleStatus: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DelegableSite {
  siteId: string;
  siteCode: string;
  siteName: string;
  siteGroupId: string;
  siteGroupCode: string;
  siteGroupName: string;
  lifecycleStatus: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DelegableScopeCatalog {
  siteGroups: DelegableSiteGroup[];
  sites: DelegableSite[];
}

export interface IdentityUserDetail {
  user: IdentityUserSummary;
  roleAssignments: IdentityRoleAssignment[];
  scopeGrants: IdentityScopeGrant[];
}

export interface IdentityRoleDefinition {
  roleReference: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  isPrivileged: boolean;
  requiresElevatedApproval: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  rowVersion: number;
  provenance: "CANONICAL_ROLE" | string;
  directAddUserEligible: boolean;
  humanAssignable: boolean;
  allowedUserTypes: string[];
  applicationAccess: IdentityApplication[];
  scopePolicy: {
    allowedScopeTypes: AssignableScopeType[];
    assignmentRequired: boolean;
    defaultScope?: AssignableScopeType | null;
  };
}

export interface IdentityProvisioningMaterial {
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
  totpSecret: string;
  totpProvisioningUri: string | null;
  totpQrImageDataUri: string | null;
  displayOnce: true;
  passwordChangeRequired: true;
}

export interface IdentityCreateUserResult {
  user: IdentityUserSummary;
  provisioning: IdentityProvisioningMaterial;
}

export interface IdentityPermissionDefinition {
  permissionReference: string;
  code: string;
  name: string;
  domain: string;
  action: string;
  status: string;
  isSensitive: boolean;
  requiresAudit: boolean;
  rowVersion: number;
}

export interface IdentityMfaStatus {
  requiredForPrivilegedManagementPlatform: boolean;
  enrolled: boolean;
  status: string;
  enrollmentStartedAt: string | null;
  activatedAt: string | null;
  lastSuccessfullyUsedAt: string | null;
  resetAt: string | null;
  revokedAt: string | null;
  rowVersion: number | null;
}

export interface IdentitySessionSummary {
  sessionReference: string;
  audience: string;
  status: string;
  assurance: string;
  mfaRequirementSatisfied: boolean;
  deviceServiceIdentityReference: string | null;
  authenticatedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  rowVersion: number;
}

export interface IdentityAuditEntry {
  auditReference: string;
  eventType: string;
  result: string;
  reasonCode: string | null;
  actorUserReference: string | null;
  summary: string | null;
  occurredAt: string;
  correlationReference: string | null;
}

export interface IdentityAdministrationClient {
  listUsers(filters?: { query?: string; status?: string; offset?: number; limit?: number }, signal?: AbortSignal): Promise<IdentityUserSummary[]>;
  getUser(userReference: string, signal?: AbortSignal): Promise<IdentityUserDetail>;
  createUser(body: Record<string, unknown>): Promise<IdentityCreateUserResult>;
  updateUser(userReference: string, body: Record<string, unknown>): Promise<IdentityUserSummary>;
  changeLifecycle(userReference: string, action: string, body: Record<string, unknown>): Promise<IdentityUserSummary>;
  listRoles(filters?: { userType?: string; directAddUserOnly?: boolean }, signal?: AbortSignal): Promise<IdentityRoleDefinition[]>;
  listPermissions(signal?: AbortSignal): Promise<IdentityPermissionDefinition[]>;
  getDelegableScopes(signal?: AbortSignal): Promise<DelegableScopeCatalog>;
  assignRole(userReference: string, body: Record<string, unknown>): Promise<IdentityRoleAssignment>;
  revokeRole(userReference: string, assignmentReference: string, body: Record<string, unknown>): Promise<IdentityRoleAssignment>;
  grantScope(userReference: string, assignmentReference: string, body: Record<string, unknown>): Promise<IdentityScopeGrant>;
  revokeScope(userReference: string, assignmentReference: string, grantReference: string, body: Record<string, unknown>): Promise<IdentityScopeGrant>;
  reviewAccess(userReference: string, body: Record<string, unknown>): Promise<boolean>;
  listSessions(userReference: string, signal?: AbortSignal): Promise<IdentitySessionSummary[]>;
  revokeSession(userReference: string, sessionReference: string | null, reasonCode: string): Promise<void>;
  getMfaStatus(userReference: string, signal?: AbortSignal): Promise<IdentityMfaStatus>;
  changeMfa(userReference: string, action: "reset" | "remove", body: Record<string, unknown>): Promise<IdentityMfaStatus>;
  listAuditEvents(userReference: string, signal?: AbortSignal): Promise<IdentityAuditEntry[]>;
}

export type IdentityAdministrationScenarioName = "populated" | "empty" | "permission-denied" | "conflict" | "unavailable" | "partial-failure" | "global-readonly" | "paginated" | "mutation-uncertain";

export function resolveIdentityAdministrationScenario(enabled: boolean, search: string): { name: IdentityAdministrationScenarioName; client: IdentityAdministrationClient } | undefined {
  if (!import.meta.env.DEV || !enabled) return undefined;
  const value = new URLSearchParams(search).get("mpIdentityScenario");
  const supported: IdentityAdministrationScenarioName[] = ["populated", "empty", "permission-denied", "conflict", "unavailable", "partial-failure", "global-readonly", "paginated", "mutation-uncertain"];
  const name: IdentityAdministrationScenarioName = supported.includes(value as IdentityAdministrationScenarioName) ? value as IdentityAdministrationScenarioName : "populated";
  const error = name === "permission-denied"
    ? createUiError("permission-denied", "IDENTITY_ADMIN_FORBIDDEN", "You do not have permission for this Management Platform action.", "support-identity-denied")
    : name === "unavailable"
      ? createUiError("integration-unavailable", "IDENTITY_ADMIN_UNAVAILABLE", "User Administration is temporarily unavailable.", "support-identity-unavailable", 503, true)
      : undefined;
  const user = syntheticUser();
  const detail: IdentityUserDetail = { user, roleAssignments: [syntheticAssignment()], scopeGrants: name === "global-readonly" ? [syntheticGrant(), { ...syntheticGrant(), grantReference: "81000000-0000-4000-8000-000000000013", scopeType: "GLOBAL", siteReference: null, siteGroupReference: null }] : [syntheticGrant()] };
  const fail = async <T>(): Promise<T> => { throw error; };
  const sectionDenied = async <T>(): Promise<T> => { throw createUiError("permission-denied", "IDENTITY_ADMIN_SECTION_FORBIDDEN", "This section is not available with your current access.", "support-identity-section-denied"); };
  const sectionUnavailable = async <T>(): Promise<T> => { throw createUiError("integration-unavailable", "IDENTITY_ADMIN_SECTION_UNAVAILABLE", "This section is temporarily unavailable.", "support-identity-section-unavailable", 503, true); };
  const client: IdentityAdministrationClient = {
    listUsers: error ? fail : async (filters = {}) => name === "empty" ? [] : name === "paginated" ? syntheticUserPage(filters.offset ?? 0, filters.offset === 0 ? 50 : 3) : [user],
    getUser: async () => detail,
    createUser: name === "mutation-uncertain"
      ? async () => { throw createUiError("unknown", "IDENTITY_ADMIN_MUTATION_UNCERTAIN", "The request failed safely.", "support-identity-mutation-uncertain", 500, false, true); }
      : async () => ({ user: { ...user, username: "provisioned.user", displayName: "Provisioned User", status: "ACTIVE", rowVersion: 1 }, provisioning: syntheticProvisioning() }),
    updateUser: name === "conflict" ? async () => { throw createUiError("conflict", "IDENTITY_ADMIN_VERSION_CONFLICT", "The authoritative user changed. Reload before retrying.", "support-identity-conflict", 409); } : async () => ({ ...user, rowVersion: user.rowVersion + 1 }),
    changeLifecycle: async (_reference, action) => ({ ...user, status: action.toUpperCase(), rowVersion: user.rowVersion + 1 }),
    listRoles: name === "partial-failure" ? sectionUnavailable : async (filters = {}) => syntheticDirectRoles().filter((role) =>
      (!filters.userType || role.allowedUserTypes.includes(filters.userType)) &&
      (!filters.directAddUserOnly || role.directAddUserEligible)), listPermissions: name === "partial-failure" ? sectionUnavailable : async () => [syntheticPermission()],
    getDelegableScopes: name === "unavailable" ? fail : async () => pitxDelegableScopes(),
    assignRole: async () => syntheticAssignment(), revokeRole: async () => ({ ...syntheticAssignment(), status: "REVOKED" }),
    grantScope: async (_user, assignment, body) => ({ ...syntheticGrant(), assignmentReference: assignment, scopeType: String(body.scopeType), siteReference: body.siteReference ? String(body.siteReference) : null, siteGroupReference: body.siteGroupReference ? String(body.siteGroupReference) : null }),
    revokeScope: async () => ({ ...syntheticGrant(), status: "REVOKED" }),
    reviewAccess: async () => true,
    listSessions: name === "partial-failure" ? sectionUnavailable : async () => [syntheticSession()], revokeSession: async () => undefined,
    getMfaStatus: name === "partial-failure" ? sectionDenied : async () => syntheticMfa(), changeMfa: async (_reference, action) => ({ ...syntheticMfa(), enrolled: false, status: action === "reset" ? "RESET_REQUIRED" : "REMOVED", rowVersion: 8 }),
    listAuditEvents: name === "partial-failure" ? sectionUnavailable : async () => [syntheticAudit()]
  };
  return { name, client };
}

export function createIdentityAdministrationClient(api: CentralPmsApiClient): IdentityAdministrationClient {
  const userPath = (userReference: string) => `${identityAdministrationApiRoute}/users/${encodeURIComponent(userReference)}`;
  const get = <T>(path: string, signal?: AbortSignal) => api.request<T>(path, { signal });
  const mutate = <T>(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) => api.request<T>(path, { method, body });

  return {
    listUsers(filters = {}, signal) {
      const query = new URLSearchParams();
      if (filters.query) query.set("query", filters.query);
      if (filters.status) query.set("status", filters.status);
      query.set("offset", String(filters.offset ?? 0));
      query.set("limit", String(filters.limit ?? 50));
      return get<unknown>(`${identityAdministrationApiRoute}/users?${query}`, signal).then(asArray<IdentityUserSummary>);
    },
    getUser: (reference, signal) => get<unknown>(userPath(reference), signal).then(asObject<IdentityUserDetail>),
    createUser: (body) => mutate<unknown>(`${identityAdministrationApiRoute}/users`, "POST", body).then(asCreateUserResult),
    updateUser: (reference, body) => mutate<unknown>(userPath(reference), "PATCH", body).then(asObject<IdentityUserSummary>),
    changeLifecycle: (reference, action, body) => mutate<unknown>(`${userPath(reference)}/${assertLifecycleAction(action)}`, "POST", body).then(asObject<IdentityUserSummary>),
    listRoles(filters = {}, signal) {
      const query = new URLSearchParams();
      if (filters.userType) query.set("userType", filters.userType);
      if (filters.directAddUserOnly) query.set("directAddUserOnly", "true");
      const suffix = query.size ? `?${query}` : "";
      return get<unknown>(`${identityAdministrationApiRoute}/roles${suffix}`, signal).then(asRoleCatalog);
    },
    listPermissions: (signal) => get<unknown>(`${identityAdministrationApiRoute}/permissions`, signal).then(asArray<IdentityPermissionDefinition>),
    getDelegableScopes: (signal) => get<unknown>(delegableScopesApiRoute, signal).then(asDelegableScopeCatalog),
    assignRole: (reference, body) => mutate<unknown>(`${userPath(reference)}/role-assignments`, "POST", body).then(asObject<IdentityRoleAssignment>),
    revokeRole: (reference, assignment, body) => mutate<unknown>(`${userPath(reference)}/role-assignments/${encodeURIComponent(assignment)}/revoke`, "POST", body).then(asObject<IdentityRoleAssignment>),
    grantScope: (reference, assignment, body) => mutate<unknown>(`${userPath(reference)}/role-assignments/${encodeURIComponent(assignment)}/scope-grants`, "POST", body).then(asObject<IdentityScopeGrant>),
    revokeScope: (reference, assignment, grant, body) => mutate<unknown>(`${userPath(reference)}/role-assignments/${encodeURIComponent(assignment)}/scope-grants/${encodeURIComponent(grant)}/revoke`, "POST", body).then(asObject<IdentityScopeGrant>),
    reviewAccess: (reference, body) => mutate<unknown>(`${userPath(reference)}/access-reviews`, "POST", body).then(asBoolean),
    listSessions: (reference, signal) => get<unknown>(`${userPath(reference)}/sessions`, signal).then(asArray<IdentitySessionSummary>),
    async revokeSession(reference, session, reasonCode) {
      const suffix = session ? `${encodeURIComponent(session)}/revoke` : "revoke-all";
      await mutate(`${userPath(reference)}/sessions/${suffix}`, "POST", { reasonCode });
    },
    getMfaStatus: (reference, signal) => get<unknown>(`${userPath(reference)}/mfa-status`, signal).then(asObject<IdentityMfaStatus>),
    changeMfa: (reference, action, body) => mutate<unknown>(`${userPath(reference)}/mfa-authenticators/${action}`, "POST", body).then(asObject<IdentityMfaStatus>),
    listAuditEvents: (reference, signal) => get<unknown>(`${userPath(reference)}/audit-events?limit=100`, signal).then(asArray<IdentityAuditEntry>)
  };
}

function malformed(): never { throw createUiError("malformed-response", "IDENTITY_ADMIN_MALFORMED_RESPONSE", "The User Administration response could not be read safely."); }
function asArray<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : malformed(); }
function asObject<T>(value: unknown): T { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as T : malformed(); }
function asBoolean(value: unknown): boolean { return typeof value === "boolean" ? value : malformed(); }

function asRoleCatalog(value: unknown): IdentityRoleDefinition[] {
  if (!Array.isArray(value)) malformed();
  return value.map((item) => {
    if (!isRecord(item) || !hasStrings(item, ["roleReference", "code", "name", "type", "status", "provenance"]) ||
        typeof item.isPrivileged !== "boolean" || typeof item.requiresElevatedApproval !== "boolean" ||
        typeof item.directAddUserEligible !== "boolean" || typeof item.humanAssignable !== "boolean" ||
        !Array.isArray(item.allowedUserTypes) || !item.allowedUserTypes.every((entry) => typeof entry === "string") ||
        !Array.isArray(item.applicationAccess) || !item.applicationAccess.every((entry) => ["MANAGEMENT_PLATFORM", "OPERATOR_CONSOLE", "NATIVE_PARKING_APP", "APT"].includes(String(entry))) ||
        !isRecord(item.scopePolicy) || !Array.isArray(item.scopePolicy.allowedScopeTypes) ||
        !item.scopePolicy.allowedScopeTypes.every((entry) => ["SITE", "SITE_GROUP", "GLOBAL"].includes(String(entry))) ||
        typeof item.scopePolicy.assignmentRequired !== "boolean" ||
        !(item.scopePolicy.defaultScope === undefined || item.scopePolicy.defaultScope === null || ["SITE", "SITE_GROUP", "GLOBAL"].includes(String(item.scopePolicy.defaultScope)))) malformed();
    if (item.provenance !== "CANONICAL_ROLE" || item.humanAssignable !== true || !hasApprovedRolePresentation(item.code as string)) malformed();
    const allowedScopeTypes = item.scopePolicy.allowedScopeTypes as unknown[];
    if (new Set(allowedScopeTypes).size !== allowedScopeTypes.length ||
        (item.scopePolicy.assignmentRequired === true && allowedScopeTypes.length === 0) ||
        (item.scopePolicy.defaultScope !== undefined && item.scopePolicy.defaultScope !== null && !allowedScopeTypes.includes(item.scopePolicy.defaultScope)) ||
        (item.code === "EXECUTIVE_MANAGEMENT" && (allowedScopeTypes.length !== 1 || allowedScopeTypes[0] !== "GLOBAL"))) malformed();
    return item as unknown as IdentityRoleDefinition;
  });
}

function asCreateUserResult(value: unknown): IdentityCreateUserResult {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.invitation) || !isRecord(value.oneTimeBootstrap)) malformed();
  const bootstrap = value.oneTimeBootstrap;
  if (!hasStrings(bootstrap, ["temporaryPassword", "temporaryPasswordExpiresAt", "totpSharedSecret", "totpProvisioningUri"]) ||
      value.user.status !== "ACTIVE" ||
      value.invitation.invitationState !== "PASSWORD_CHANGE_REQUIRED" ||
      value.invitation.activationDeliveryMode !== null ||
      value.invitation.deliveryClassification !== "ONE_TIME_BOOTSTRAP" ||
      value.oneTimeActivation !== null ||
      bootstrap.passwordChangeRequired !== true ||
      !Number.isFinite(Date.parse(bootstrap.temporaryPasswordExpiresAt as string))) malformed();
  return {
    user: value.user as unknown as IdentityUserSummary,
    provisioning: {
      temporaryPassword: bootstrap.temporaryPassword as string,
      temporaryPasswordExpiresAt: bootstrap.temporaryPasswordExpiresAt as string,
      totpSecret: bootstrap.totpSharedSecret as string,
      totpProvisioningUri: bootstrap.totpProvisioningUri as string,
      totpQrImageDataUri: null,
      displayOnce: true,
      passwordChangeRequired: bootstrap.passwordChangeRequired
    }
  };
}

function asDelegableScopeCatalog(value: unknown): DelegableScopeCatalog {
  if (!isRecord(value) || !Array.isArray(value.siteGroups) || !Array.isArray(value.sites)) malformed();
  const siteGroups = value.siteGroups.map((item) => {
    if (!isRecord(item) || !hasStrings(item, ["siteGroupId", "siteGroupCode", "siteGroupName", "lifecycleStatus", "effectiveFrom"]) || !(item.effectiveTo === null || typeof item.effectiveTo === "string")) malformed();
    return item as unknown as DelegableSiteGroup;
  });
  const sites = value.sites.map((item) => {
    if (!isRecord(item) || !hasStrings(item, ["siteId", "siteCode", "siteName", "siteGroupId", "siteGroupCode", "siteGroupName", "lifecycleStatus", "effectiveFrom"]) || !(item.effectiveTo === null || typeof item.effectiveTo === "string")) malformed();
    return item as unknown as DelegableSite;
  });
  return { siteGroups, sites };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasStrings(value: Record<string, unknown>, fields: string[]): boolean { return fields.every((field) => typeof value[field] === "string"); }

function assertLifecycleAction(action: string): string {
  const normalized = action.toLowerCase();
  if (!["activate", "suspend", "inactivate", "retire", "lock", "unlock"].includes(normalized)) {
    throw createUiError("validation", "IDENTITY_ADMIN_INVALID_LIFECYCLE_ACTION", "The selected Account Status action is unavailable.");
  }
  return normalized;
}

function syntheticUser(): IdentityUserSummary { return { userReference: "81000000-0000-4000-8000-000000000001", username: "synthetic.admin", displayName: "Synthetic Administration User", maskedEmail: "s***@example.test", maskedMobileNumber: "***0101", userType: "INTERNAL_ADMIN", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastLoginAt: "2030-03-01T08:00:00Z", rowVersion: 7 }; }
function syntheticUserPage(offset: number, count: number): IdentityUserSummary[] { return Array.from({ length: count }, (_, index) => ({ ...syntheticUser(), userReference: `synthetic-user-${offset + index + 1}`, username: `synthetic.user.${offset + index + 1}`, displayName: `Synthetic User ${offset + index + 1}` })); }
function syntheticAssignment(): IdentityRoleAssignment { return { assignmentReference: "81000000-0000-4000-8000-000000000002", userReference: syntheticUser().userReference, roleReference: "81000000-0000-4000-8000-000000000016", roleCode: "SITE_OPERATOR", roleName: "Site Operator", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: "2030-02-01T00:00:00Z", rowVersion: 3 }; }
function syntheticGrant(): IdentityScopeGrant { return { grantReference: "81000000-0000-4000-8000-000000000003", assignmentReference: syntheticAssignment().assignmentReference, scopeType: "SITE", siteReference: "71000000-0000-0000-0000-000000000101", siteGroupReference: null, status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: "2030-02-01T00:00:00Z", rowVersion: 2 }; }
function syntheticRole(): IdentityRoleDefinition { return { ...syntheticOrdinaryRole(), roleReference: "81000000-0000-4000-8000-000000000004", code: "SYSTEM_ADMINISTRATOR", name: "System Administrator", description: "Governed Management Platform identity administration", type: "SYSTEM", isPrivileged: true, requiresElevatedApproval: false, allowedUserTypes: ["INTERNAL_ADMIN"], applicationAccess: ["MANAGEMENT_PLATFORM"], scopePolicy: { allowedScopeTypes: ["GLOBAL"], assignmentRequired: true, defaultScope: "GLOBAL" } }; }
function syntheticOrdinaryRole(): IdentityRoleDefinition { return { roleReference: "81000000-0000-4000-8000-000000000014", code: "SITE_OPERATOR", name: "Site Operator", description: "Site operations access", type: "OPERATIONS", status: "ACTIVE", isPrivileged: false, requiresElevatedApproval: false, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1, provenance: "CANONICAL_ROLE", directAddUserEligible: true, humanAssignable: true, allowedUserTypes: [], applicationAccess: ["OPERATOR_CONSOLE"], scopePolicy: { allowedScopeTypes: ["SITE"], assignmentRequired: true, defaultScope: "SITE" } }; }
function syntheticDirectRoles(): IdentityRoleDefinition[] {
  const base = syntheticOrdinaryRole();
  return approvedIdentityRoles.map((presentation, index) => {
    const applicationAccess: IdentityApplication[] = presentation.code === "OPERATIONS_SUPERVISOR" ? ["OPERATOR_CONSOLE", "MANAGEMENT_PLATFORM"]
      : presentation.code === "SITE_OPERATOR" ? ["OPERATOR_CONSOLE"]
        : presentation.code === "PARKING_ATTENDANT" ? ["NATIVE_PARKING_APP"]
          : presentation.code === "APT_CASHIER_OPERATOR" ? ["APT"] : ["MANAGEMENT_PLATFORM"];
    const allowedScopeTypes: AssignableScopeType[] = ["SYSTEM_ADMINISTRATOR", "EXECUTIVE_MANAGEMENT"].includes(presentation.code) ? ["GLOBAL"]
      : ["FINANCE_RECONCILIATION_ANALYST", "COMPLIANCE_POLICY_ADMINISTRATOR"].includes(presentation.code) ? ["SITE", "SITE_GROUP", "GLOBAL"]
        : ["SITE"];
    return {
      ...base,
      roleReference: `81000000-0000-4000-8000-${String(index + 14).padStart(12, "0")}`,
      code: presentation.code,
      name: presentation.label,
      description: presentation.summary,
      isPrivileged: ["SYSTEM_ADMINISTRATOR", "OPERATIONS_SUPERVISOR", "COMPLIANCE_POLICY_ADMINISTRATOR"].includes(presentation.code),
      requiresElevatedApproval: false,
      applicationAccess,
      scopePolicy: {
        allowedScopeTypes,
        assignmentRequired: allowedScopeTypes.length > 0,
        defaultScope: presentation.code === "FINANCE_RECONCILIATION_ANALYST" ? null
          : ["SYSTEM_ADMINISTRATOR", "COMPLIANCE_POLICY_ADMINISTRATOR", "EXECUTIVE_MANAGEMENT"].includes(presentation.code) ? "GLOBAL"
            : "SITE"
      }
    };
  });
}
function syntheticProvisioning(): IdentityProvisioningMaterial { return { temporaryPassword: "Temporary-Only-72h!", temporaryPasswordExpiresAt: "2030-03-04T08:00:00Z", totpSecret: "JBSWY3DPEHPK3PXP", totpProvisioningUri: "otpauth://totp/ExitPass:invited.user?secret=JBSWY3DPEHPK3PXP&issuer=ExitPass", totpQrImageDataUri: null, displayOnce: true, passwordChangeRequired: true }; }
function syntheticPermission(): IdentityPermissionDefinition { return { permissionReference: "81000000-0000-4000-8000-000000000005", code: "user.view", name: "View users", domain: "Identity", action: "VIEW", status: "ACTIVE", isSensitive: false, requiresAudit: true, rowVersion: 1 }; }
function syntheticMfa(): IdentityMfaStatus { return { requiredForPrivilegedManagementPlatform: true, enrolled: true, status: "ACTIVE", enrollmentStartedAt: null, activatedAt: "2030-01-01T00:00:00Z", lastSuccessfullyUsedAt: "2030-03-01T08:00:00Z", resetAt: null, revokedAt: null, rowVersion: 7 }; }
function syntheticSession(): IdentitySessionSummary { return { sessionReference: "81000000-0000-4000-8000-000000000006", audience: "MANAGEMENT_PLATFORM", status: "ACTIVE", assurance: "PASSWORD_TOTP", mfaRequirementSatisfied: true, deviceServiceIdentityReference: null, authenticatedAt: "2030-03-01T08:00:00Z", lastSeenAt: "2030-03-01T08:10:00Z", idleExpiresAt: "2030-03-01T08:30:00Z", absoluteExpiresAt: "2030-03-01T16:00:00Z", revokedAt: null, rowVersion: 1 }; }
function syntheticAudit(): IdentityAuditEntry { return { auditReference: "81000000-0000-4000-8000-000000000007", eventType: "ROLE_ASSIGNED", result: "SUCCESS", reasonCode: "GOVERNED_ASSIGNMENT", actorUserReference: null, summary: "Role added through governed administration.", occurredAt: "2030-03-01T08:00:00Z", correlationReference: "support-identity-0001" }; }
function pitxDelegableScopes(): DelegableScopeCatalog { return { siteGroups: [{ siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null }], sites: [{ siteId: "2d1dcdf8-f563-537c-8542-0bde7cc9da97", siteCode: "PITX-LEVEL-3", siteName: "PITX Level 3", siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null }, { siteId: "b336964f-3b84-5404-8690-97ead0929b1f", siteCode: "PITX-OPEN-LOT", siteName: "PITX Open Lot", siteGroupId: "a6dbadf6-68b5-5bed-a7e0-a75faee70841", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2026-08-13T00:00:00+08:00", effectiveTo: null }] }; }
