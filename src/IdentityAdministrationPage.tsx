import { useCallback, useEffect, useRef, useState } from "react";
import {
  identityAdministrationPermissions,
  type IdentityAdministrationClient,
  type IdentityAuditEntry,
  type DelegableScopeCatalog,
  type IdentityMfaStatus,
  type IdentityPermissionDefinition,
  type IdentityRoleDefinition,
  type IdentitySessionSummary,
  type IdentityUserDetail,
  type IdentityUserSummary,
  type IdentityCreateUserResult,
  type IdentityMfaProvisioningResult
} from "./identityAdministration";
import { applicationLabel, approvedRolePresentation, type AssignableScopeType } from "./approvedIdentityRoles";
import { hasAnyPermission, hasPermission } from "./permissions";
import { TotpQrCode } from "./TotpQrCode";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

type DetailView = "profile" | "access" | "security" | "audit";

type SectionLoadState<T> =
  | { status: "idle" | "loading" | "not-authorized" }
  | { status: "loaded"; value: T }
  | { status: "error"; error: ManagementPlatformUiError };

const userPageSize = 50;

const detailViewLabels: Record<DetailView, string> = {
  profile: "Profile",
  access: "Roles & Permissions",
  security: "Security",
  audit: "Activity Log"
};

interface Props {
  client: IdentityAdministrationClient;
  permissions: readonly string[];
}

export function IdentityAdministrationPage({ client, permissions }: Props) {
  const [users, setUsers] = useState<IdentityUserSummary[]>([]);
  const [selectedReference, setSelectedReference] = useState<string>();
  const [detail, setDetail] = useState<IdentityUserDetail>();
  const [roleCatalogState, setRoleCatalogState] = useState<SectionLoadState<IdentityRoleDefinition[]>>({ status: "idle" });
  const [permissionCatalogState, setPermissionCatalogState] = useState<SectionLoadState<IdentityPermissionDefinition[]>>({ status: "idle" });
  const [scopeCatalogState, setScopeCatalogState] = useState<SectionLoadState<DelegableScopeCatalog>>({ status: "idle" });
  const [sessionState, setSessionState] = useState<SectionLoadState<IdentitySessionSummary[]>>({ status: "idle" });
  const [mfaState, setMfaState] = useState<SectionLoadState<IdentityMfaStatus>>({ status: "idle" });
  const [auditState, setAuditState] = useState<SectionLoadState<IdentityAuditEntry[]>>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [view, setView] = useState<DetailView>("profile");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authoritativeStateStale, setAuthoritativeStateStale] = useState(false);
  const [error, setError] = useState<ManagementPlatformUiError>();
  const [directoryError, setDirectoryError] = useState<ManagementPlatformUiError>();
  const [notice, setNotice] = useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const [provisioningResult, setProvisioningResult] = useState<IdentityCreateUserResult>();
  const [mfaProvisioningResult, setMfaProvisioningResult] = useState<{ user: IdentityUserSummary; result: IdentityMfaProvisioningResult }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const usersRequestSequence = useRef(0);

  const canManageUsers = hasPermission(permissions, identityAdministrationPermissions.userManage);
  const canManageRoles = hasAnyPermission(permissions, [identityAdministrationPermissions.roleAssignmentManage, "assignment.manage"]);
  const canManageScopes = hasAnyPermission(permissions, [identityAdministrationPermissions.scopeAssignmentManage, "assignment.manage"]);
  const canCreateUsers = canManageUsers && canManageRoles && canManageScopes;
  const canReviewAccess = hasPermission(permissions, identityAdministrationPermissions.accessReviewManage);
  const canViewSessions = hasPermission(permissions, identityAdministrationPermissions.sessionView);
  const canRevokeSessions = hasPermission(permissions, identityAdministrationPermissions.sessionRevoke);
  const canViewMfa = hasPermission(permissions, identityAdministrationPermissions.mfaStatusView);
  const canResetMfa = hasPermission(permissions, identityAdministrationPermissions.mfaReset);
  const canRemoveMfa = hasPermission(permissions, identityAdministrationPermissions.mfaRemove);

  const loadRoleCatalog = useCallback(async () => {
    setRoleCatalogState({ status: "loading" });
    try {
      setRoleCatalogState({ status: "loaded", value: await client.listRoles() });
    } catch (caught) {
      setRoleCatalogState({ status: "error", error: asUiError(caught) });
    }
  }, [client]);

  const loadPermissionCatalog = useCallback(async () => {
    setPermissionCatalogState({ status: "loading" });
    try {
      setPermissionCatalogState({ status: "loaded", value: await client.listPermissions() });
    } catch (caught) {
      setPermissionCatalogState({ status: "error", error: asUiError(caught) });
    }
  }, [client]);

  const loadScopeCatalog = useCallback(async () => {
    setScopeCatalogState({ status: "loading" });
    try {
      setScopeCatalogState({ status: "loaded", value: await client.getDelegableScopes() });
    } catch (caught) {
      setScopeCatalogState({ status: "error", error: asUiError(caught) });
    }
  }, [client]);

  const loadSessions = useCallback(async (userReference: string) => {
    if (!canViewSessions) {
      setSessionState({ status: "not-authorized" });
      return;
    }
    setSessionState({ status: "loading" });
    try {
      setSessionState({ status: "loaded", value: await client.listSessions(userReference) });
    } catch (caught) {
      setSessionState({ status: "error", error: asUiError(caught) });
    }
  }, [canViewSessions, client]);

  const loadMfa = useCallback(async (userReference: string) => {
    if (!canViewMfa) {
      setMfaState({ status: "not-authorized" });
      return;
    }
    setMfaState({ status: "loading" });
    try {
      setMfaState({ status: "loaded", value: await client.getMfaStatus(userReference) });
    } catch (caught) {
      setMfaState({ status: "error", error: asUiError(caught) });
    }
  }, [canViewMfa, client]);

  const loadAudit = useCallback(async (userReference: string) => {
    setAuditState({ status: "loading" });
    try {
      setAuditState({ status: "loaded", value: await client.listAuditEvents(userReference) });
    } catch (caught) {
      setAuditState({ status: "error", error: asUiError(caught) });
    }
  }, [client]);

  const loadUsers = useCallback(async (requestedOffset = offset, requestedQuery = query.trim(), requestedStatus = statusFilter) => {
    const requestSequence = ++usersRequestSequence.current;
    setLoading(true);
    setDirectoryError(undefined);
    try {
      const result = await client.listUsers({ query: requestedQuery || undefined, status: requestedStatus || undefined, offset: requestedOffset, limit: userPageSize });
      if (requestSequence !== usersRequestSequence.current) return false;
      setUsers(result);
      setOffset(requestedOffset);
      setHasNextPage(result.length === userPageSize);
      if (selectedReference && !result.some((user) => user.userReference === selectedReference)) {
        setSelectedReference(undefined);
        setDetail(undefined);
      }
      return true;
    } catch (caught) {
      if (requestSequence !== usersRequestSequence.current) return false;
      setDirectoryError(asUiError(caught));
      setUsers([]);
      setOffset(requestedOffset);
      setHasNextPage(false);
      return false;
    } finally {
      if (requestSequence === usersRequestSequence.current) setLoading(false);
    }
  }, [client, offset, query, selectedReference, statusFilter]);

  const loadDetail = useCallback(async (userReference: string) => {
    setDetailLoading(true);
    setError(undefined);
    try {
      const userDetail = await client.getUser(userReference);
      setDetail(userDetail);
      setDetailLoading(false);
      await Promise.all([
        loadRoleCatalog(),
        loadPermissionCatalog(),
        loadSessions(userReference),
        loadMfa(userReference),
        loadAudit(userReference),
        ...(canManageScopes ? [loadScopeCatalog()] : [])
      ]);
      return true;
    } catch (caught) {
      setDetail(undefined);
      setError(asUiError(caught));
      return false;
    } finally {
      setDetailLoading(false);
    }
  }, [canManageScopes, client, loadAudit, loadMfa, loadPermissionCatalog, loadRoleCatalog, loadScopeCatalog, loadSessions]);

  useEffect(() => { void loadUsers(0, "", ""); }, []); // Initial server-authoritative inventory only.
  useEffect(() => {
    if (selectedReference) void loadDetail(selectedReference);
  }, [loadDetail, selectedReference]);
  useEffect(() => {
    if (selectedReference && window.matchMedia?.("(max-width: 1040px)").matches) {
      detailRef.current?.focus();
    }
  }, [selectedReference]);

  async function refreshAuthoritativeState() {
    setError(undefined);
    const usersLoaded = await loadUsers();
    const detailLoaded = selectedReference ? await loadDetail(selectedReference) : true;
    if (usersLoaded && detailLoaded) {
      setAuthoritativeStateStale(false);
      setError(undefined);
    }
  }

  async function runMutation(
    action: () => Promise<unknown>,
    success: string,
    refresh: (result: unknown) => Promise<boolean> = async () => {
      const usersLoaded = await loadUsers();
      const detailLoaded = selectedReference ? await loadDetail(selectedReference) : true;
      return usersLoaded && detailLoaded;
    }
  ): Promise<boolean> {
    if (busy || authoritativeStateStale) return false;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await action();
      setNotice(success);
      if (!await refresh(result)) setAuthoritativeStateStale(true);
      return true;
    } catch (caught) {
      const safeError = asUiError(caught);
      setError(safeError);
      if (safeError.mutationUncertain) setAuthoritativeStateStale(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const sites = scopeCatalogState.status === "loaded"
    ? scopeCatalogState.value.sites.map((site) => ({ siteId: site.siteId, siteGroupId: site.siteGroupId, siteGroupDisplayName: site.siteGroupName, displayName: site.siteName }))
    : [];
  const siteGroups = scopeCatalogState.status === "loaded"
    ? scopeCatalogState.value.siteGroups.map((group) => ({ reference: group.siteGroupId, name: group.siteGroupName }))
    : [];
  const mutationsDisabled = busy || authoritativeStateStale;

  return (
    <section className="identityAdministration" aria-labelledby="identity-administration-title">
      <header className="pageTitle identityAdministrationHeader">
        <div>
          <p className="eyebrow">Account access</p>
          <h2 id="identity-administration-title">User Administration</h2>
          <p>Manage users, roles and permissions, Site access, sign-in security, and access reviews.</p>
        </div>
        <div className="pageActions">
          <button className="secondaryButton" type="button" disabled={loading || busy} onClick={() => void refreshAuthoritativeState()}>Refresh</button>
          {canCreateUsers && <button type="button" disabled={mutationsDisabled} onClick={() => { setShowCreate(true); if (roleCatalogState.status !== "loaded") void loadRoleCatalog(); if (scopeCatalogState.status !== "loaded") void loadScopeCatalog(); }}>Add User</button>}
        </div>
      </header>

      <div className="governanceBoundary" role="note">
        <strong>Governed administration.</strong> Available actions reflect your current access. Central PMS verifies every change.
      </div>
      {notice && <div className="operationNotice" role="status">{notice}</div>}
      {provisioningResult && <ProvisioningPanel result={provisioningResult} onClose={() => setProvisioningResult(undefined)} />}
      {mfaProvisioningResult && <MfaProvisioningPanel user={mfaProvisioningResult.user} result={mfaProvisioningResult.result} onClose={() => {
        const userReference = mfaProvisioningResult.user.userReference;
        setMfaProvisioningResult(undefined);
        void loadMfa(userReference);
      }} />}
      {error && <IdentityError error={error} onRetry={error.retryable ? () => void refreshAuthoritativeState() : undefined} />}
      {authoritativeStateStale && <div className="identityStaleState" role="alert"><strong>Information may be out of date.</strong><p>Previously loaded information is retained for reference. Changes are disabled until a successful authoritative refresh completes.</p><button className="secondaryButton" type="button" disabled={loading || busy} onClick={() => void refreshAuthoritativeState()}>Refresh authoritative state</button></div>}

      {showCreate && <CreateUserPanel busy={mutationsDisabled} roleCatalogState={roleCatalogState} scopeCatalogState={scopeCatalogState} onRetryRoles={loadRoleCatalog} onRetryScopes={loadScopeCatalog} onCancel={() => setShowCreate(false)} onCreate={async (body) => {
        let createdResult: IdentityCreateUserResult | undefined;
        const created = await runMutation(
          async () => { createdResult = await client.createUser(body); return createdResult; },
          "User added. Complete the one-time password and authenticator provisioning handoff.",
          async (result) => {
            const user = (result as IdentityCreateUserResult).user;
            setQuery(""); setStatusFilter("");
            const loaded = await loadUsers(0, "", "");
            if (loaded) { setSelectedReference(user.userReference); setView("security"); }
            return loaded;
          }
        );
        if (created && createdResult) { setShowCreate(false); setProvisioningResult(createdResult); }
      }} />}

      <form className="identityFilters" onSubmit={(event) => { event.preventDefault(); void loadUsers(0, query.trim(), statusFilter); }}>
        <label htmlFor="identity-user-search">Search users</label>
        <input ref={searchRef} id="identity-user-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username or display name" />
        <label htmlFor="identity-user-status">Status</label>
        <select id="identity-user-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option><option>ACTIVE</option><option>INVITED</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option><option>RETIRED</option>
        </select>
        <button type="submit" disabled={loading}>Apply</button>
        <button className="secondaryButton" type="button" onClick={() => { setQuery(""); setStatusFilter(""); void loadUsers(0, "", ""); searchRef.current?.focus(); }}>Reset</button>
      </form>

      <div className={`identityWorkspace ${selectedReference ? "hasSelection" : ""}`}>
        <section className="identityUserList" aria-labelledby="identity-users-title">
          <div className="sectionHeading"><h3 id="identity-users-title">Users</h3><span>{users.length} returned</span></div>
          {loading ? <div className="inlineState" role="status">Loading users</div> : directoryError ? <SectionFailure label="User directory" error={directoryError} onRetry={directoryError.retryable ? () => void loadUsers(offset, query.trim(), statusFilter) : undefined} /> : users.length === 0 ? <div className="inlineState">No users match the current search.</div> : (
            <ul>
              {users.map((user) => <li key={user.userReference}>
                <button className={selectedReference === user.userReference ? "selectedUser" : ""} type="button" onClick={() => { setMfaProvisioningResult(undefined); setSelectedReference(user.userReference); setView("profile"); }}>
                  <strong>{user.displayName}</strong><span>{user.username}</span><StatusLabel value={user.status} />
                </button>
              </li>)}
            </ul>
          )}
          {!loading && !directoryError && <nav className="identityPagination" aria-label="User directory pages">
            <span>Page {Math.floor(offset / userPageSize) + 1}{users.length > 0 ? ` · Showing ${offset + 1}-${offset + users.length}` : " · No users on this page"}</span>
            <div className="formActions">
              <button className="secondaryButton" type="button" disabled={offset === 0} onClick={() => void loadUsers(Math.max(0, offset - userPageSize), query.trim(), statusFilter)}>Previous</button>
              <button className="secondaryButton" type="button" disabled={!hasNextPage} onClick={() => void loadUsers(offset + userPageSize, query.trim(), statusFilter)}>Next</button>
            </div>
          </nav>}
        </section>

        <section ref={detailRef} className="identityDetail" aria-label="Selected user administration" tabIndex={-1}>
          {!selectedReference ? <div className="inlineState"><h3>Select a user</h3><p>Choose a user to view or manage.</p></div> : detailLoading ? <div className="inlineState" role="status">Loading current user access</div> : detail ? (
            <>
              <header className="identityDetailHeader"><div><p className="eyebrow">Selected user</p><h3>{detail.user.displayName}</h3><p>{detail.user.username}{detail.user.userType ? ` · Legacy classification: ${displayUserType(detail.user.userType)}` : ""}</p></div><StatusLabel value={detail.user.status} /></header>
              <div className="identityTabs" role="tablist" aria-label="User administration areas">
                {(["profile", "access", "security", "audit"] as DetailView[]).map((tab) => <button key={tab} role="tab" type="button" aria-selected={view === tab} className={view === tab ? "activeTab" : ""} onClick={() => setView(tab)}>{detailViewLabels[tab]}</button>)}
              </div>
              {view === "profile" && <ProfileView detail={detail} canManage={canManageUsers} busy={mutationsDisabled} onUpdate={(body) => void runMutation(() => client.updateUser(detail.user.userReference, body), "Profile updated.")} onLifecycle={(action, body) => void runMutation(() => client.changeLifecycle(detail.user.userReference, action, body), `Account status changed to ${humanize(action)}.`)} />}
              {view === "access" && <AccessView detail={detail} roleCatalogState={roleCatalogState} permissionCatalogState={permissionCatalogState} sites={sites} siteGroups={siteGroups} canManageRoles={canManageRoles} canManageScopes={canManageScopes} canReviewAccess={canReviewAccess} busy={mutationsDisabled} onRetryRoles={loadRoleCatalog} onRetryPermissions={loadPermissionCatalog} runMutation={runMutation} client={client} />}
              {view === "security" && <SecurityView detail={detail} mfaState={mfaState} sessionState={sessionState} canResetMfa={canResetMfa} canRemoveMfa={canRemoveMfa} canRevokeSessions={canRevokeSessions} busy={mutationsDisabled} onRetryMfa={() => void loadMfa(detail.user.userReference)} onRetrySessions={() => void loadSessions(detail.user.userReference)} onProvision={async (action, expectedRowVersion) => {
                let provisioned: IdentityMfaProvisioningResult | undefined;
                const completed = await runMutation(
                  async () => {
                    const body = { expectedRowVersion, reasonCode: action === "setup" ? "GOVERNED_MFA_SETUP" : "GOVERNED_MFA_RESET" };
                    provisioned = action === "setup"
                      ? await client.setupMfa(detail.user.userReference, body)
                      : await client.resetMfa(detail.user.userReference, body);
                    return provisioned;
                  },
                  action === "setup" ? "Authenticator app set up." : "Authenticator app reset.",
                  async (result) => {
                    setMfaState({ status: "loaded", value: (result as IdentityMfaProvisioningResult).mfaStatus });
                    await loadSessions(detail.user.userReference);
                    return true;
                  }
                );
                if (completed && provisioned) setMfaProvisioningResult({ user: detail.user, result: provisioned });
              }} onRemove={async (expectedRowVersion) => {
                setMfaProvisioningResult(undefined);
                await runMutation(
                  () => client.removeMfa(detail.user.userReference, { expectedRowVersion, reasonCode: "GOVERNED_MFA_REMOVE" }),
                  "Authenticator app removed.",
                  async (result) => {
                    setMfaState({ status: "loaded", value: result as IdentityMfaStatus });
                    await loadSessions(detail.user.userReference);
                    return true;
                  }
                );
              }} runMutation={runMutation} client={client} />}
              {view === "audit" && <AuditView state={auditState} onRetry={() => void loadAudit(detail.user.userReference)} />}
            </>
          ) : <div className="inlineState">The requested user is unavailable within your authorized scope.</div>}
        </section>
      </div>
    </section>
  );
}

function CreateUserPanel({ busy, roleCatalogState, scopeCatalogState, onRetryRoles, onRetryScopes, onCancel, onCreate }: { busy: boolean; roleCatalogState: SectionLoadState<IdentityRoleDefinition[]>; scopeCatalogState: SectionLoadState<DelegableScopeCatalog>; onRetryRoles: () => Promise<void>; onRetryScopes: () => Promise<void>; onCancel: () => void; onCreate: (body: Record<string, unknown>) => Promise<void> }) {
  const [initialRoleReference, setInitialRoleReference] = useState("");
  const [scopeType, setScopeType] = useState<AssignableScopeType | "">("");
  const [initialScopeReference, setInitialScopeReference] = useState("");
  const roles = roleCatalogState.status === "loaded" ? roleCatalogState.value.filter((role) => role.status === "ACTIVE" && role.humanAssignable && role.directAddUserEligible) : [];
  const selectedRole = roles.find((role) => role.roleReference === initialRoleReference);
  const rolePresentation = selectedRole ? approvedRolePresentation(selectedRole.code) : undefined;
  const allowedScopeTypes = selectedRole?.scopePolicy.allowedScopeTypes ?? [];
  const effectiveScopeType = scopeType;
  const scopeOptions = scopeCatalogState.status !== "loaded" || effectiveScopeType === "GLOBAL" || !effectiveScopeType ? [] : effectiveScopeType === "SITE" ? scopeCatalogState.value.sites.map((site) => ({ reference: site.siteId, name: site.siteName })) : scopeCatalogState.value.siteGroups.map((group) => ({ reference: group.siteGroupId, name: group.siteGroupName }));
  const scopeSatisfied = !selectedRole?.scopePolicy.assignmentRequired || effectiveScopeType === "GLOBAL" || Boolean(effectiveScopeType && initialScopeReference);
  const submissionUnavailable = busy || !selectedRole || !scopeSatisfied || roleCatalogState.status !== "loaded" || (selectedRole.scopePolicy.assignmentRequired && effectiveScopeType !== "GLOBAL" && scopeCatalogState.status !== "loaded");

  function selectRole(reference: string) {
    setInitialRoleReference(reference);
    setInitialScopeReference("");
    const role = roles.find((candidate) => candidate.roleReference === reference);
    setScopeType(role?.scopePolicy.defaultScope ?? "");
  }

  return <form className="administrationForm" aria-labelledby="create-user-title" onSubmit={(event) => {
    event.preventDefault();
    if (!selectedRole) return;
    const data = new FormData(event.currentTarget);
    const targetReference = String(data.get("initialScopeReference") ?? "");
    void onCreate({ username: data.get("username"), displayName: data.get("displayName"), email: data.get("email") || null, maskedMobileNumber: data.get("mobile") || null, initialRoleReference: selectedRole.roleReference, initialScopeType: effectiveScopeType || null, initialSiteReference: effectiveScopeType === "SITE" ? targetReference : null, initialSiteGroupReference: effectiveScopeType === "SITE_GROUP" ? targetReference : null, effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() });
  }}>
    <div><h3 id="create-user-title">Add User</h3><p>Central PMS generates a temporary password valid for 72 hours and one-time authenticator provisioning material after the governed user, role, and scope operation succeeds.</p></div>
    <label>Username<input name="username" required autoComplete="off" /></label>
    <label>Display name<input name="displayName" required /></label>
    <label>Email (optional)<input name="email" type="email" /></label>
    <label>Masked mobile (optional)<input name="mobile" /></label>
    {roleCatalogState.status === "loading" && <div className="inlineState" role="status">Loading approved roles</div>}
    {roleCatalogState.status === "error" && <SectionFailure label="Role catalog" error={roleCatalogState.error} onRetry={roleCatalogState.error.retryable ? () => void onRetryRoles() : undefined} />}
    <label>Initial role<select name="initialRoleReference" required value={initialRoleReference} onChange={(event) => selectRole(event.target.value)} disabled={roleCatalogState.status !== "loaded"}><option value="">Select a role</option>{roles.map((role) => <option key={role.roleReference} value={role.roleReference}>{approvedRolePresentation(role.code)?.label ?? role.name}</option>)}</select></label>
    {rolePresentation && <div className="rolePolicySummary" role="note" aria-label={rolePresentation.label + " access"}><strong>{rolePresentation.label}</strong><p>{rolePresentation.summary}</p><p>Applications from Central PMS: {selectedRole?.applicationAccess.map(applicationLabel).join(", ")}</p></div>}
    {selectedRole && allowedScopeTypes.length === 0 && <div className="inlineState">This role does not require a Site assignment in this flow. Central PMS still validates the final assignment.</div>}
    {selectedRole && allowedScopeTypes.length > 0 && <>
      <label>Access level<select aria-label="Access level" value={effectiveScopeType} disabled={allowedScopeTypes.length === 1 && Boolean(selectedRole.scopePolicy.defaultScope)} onChange={(event) => { setScopeType(event.target.value as AssignableScopeType | ""); setInitialScopeReference(""); }}>{!selectedRole.scopePolicy.defaultScope && <option value="">Select an access level</option>}{allowedScopeTypes.map((value) => <option key={value} value={value}>{value === "SITE_GROUP" ? "Site Group" : value === "SITE" ? "Site" : "Global"}</option>)}</select></label>
      {effectiveScopeType === "GLOBAL" ? <div className="governanceBoundary" role="note"><strong>Global scope required by Central PMS.</strong> {rolePresentation?.label ?? selectedRole?.name} is submitted with explicit Global scope and the server validates the assignment.</div> : <>
        {scopeCatalogState.status === "loading" && <div className="inlineState" role="status">Loading authorized scope choices</div>}
        {scopeCatalogState.status === "error" && <SectionFailure label="Authoritative scope choices" error={scopeCatalogState.error} onRetry={scopeCatalogState.error.retryable ? () => void onRetryScopes() : undefined} />}
        <label>{effectiveScopeType === "SITE" ? "Assigned Site" : "Assigned Site Group"}<select key={effectiveScopeType} name="initialScopeReference" required value={initialScopeReference} onChange={(event) => setInitialScopeReference(event.target.value)} disabled={scopeCatalogState.status !== "loaded" || scopeOptions.length === 0}><option value="">Select {effectiveScopeType === "SITE" ? "a Site" : "a Site Group"}</option>{scopeOptions.map((scope) => <option key={scope.reference} value={scope.reference}>{scope.name}</option>)}</select></label>
      </>}
    </>}
    <label>Access starts<input name="effectiveFrom" type="datetime-local" required defaultValue={toLocalInput(new Date())} /></label>
    <label>Reason<input name="reasonCode" required /></label>
    <div className="formActions"><button type="submit" disabled={submissionUnavailable}>Add User</button><button className="secondaryButton" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function ProvisioningPanel({ result, onClose }: { result: IdentityCreateUserResult; onClose: () => void }) {
  const { user, provisioning } = result;
  return <section className="provisioningPanel" role="region" aria-labelledby="provisioning-title">
    <p className="eyebrow">Display once</p>
    <h3 id="provisioning-title">Provision {user.displayName}</h3>
    <p>Give these values to the user through the approved administrative handoff. They are removed from this screen when you close it and cannot be shown again.</p>
    <dl className="factGrid"><Fact label="Username" value={user.username} /><Fact label="Temporary password" value={provisioning.temporaryPassword} /><Fact label="Temporary password expires" value={formatDate(provisioning.temporaryPasswordExpiresAt)} /></dl>
    <TotpProvisioningDetails username={user.username} sharedSecret={provisioning.totpSecret} provisioningUri={provisioning.totpProvisioningUri} />
    <p><strong>Account status:</strong> Active. Normal application access remains blocked until the required password change is complete.</p>
    <p><strong>First sign-in:</strong> the user must enter the temporary password and TOTP, then change the password before accessing permitted functions.</p>
    <button type="button" onClick={onClose}>I have completed provisioning</button>
  </section>;
}

function MfaProvisioningPanel({ user, result, onClose }: { user: IdentityUserSummary; result: IdentityMfaProvisioningResult; onClose: () => void }) {
  return <section className="provisioningPanel" role="region" aria-labelledby="mfa-provisioning-title">
    <p className="eyebrow">Display once</p>
    <h3 id="mfa-provisioning-title">Set up authenticator</h3>
    <p>Target user: <strong>{user.displayName}</strong> ({user.username})</p>
    <p>Scan this QR code with the user's authenticator app.</p>
    <TotpProvisioningDetails username={user.username} sharedSecret={result.provisioning.totpSharedSecret} provisioningUri={result.provisioning.totpProvisioningUri} />
    <p><strong>This information is shown only once.</strong></p>
    <button type="button" onClick={onClose}>I have completed provisioning</button>
  </section>;
}

function TotpProvisioningDetails({ username, sharedSecret, provisioningUri }: { username: string; sharedSecret: string; provisioningUri: string | null }) {
  return <div className="totpProvisioningDetails">
    {provisioningUri && <TotpQrCode provisioningUri={provisioningUri} username={username} />}
    <p>Manual setup key:</p>
    <code className="totpManualKey">{sharedSecret}</code>
  </div>;
}
function ProfileView({ detail, canManage, busy, onUpdate, onLifecycle }: { detail: IdentityUserDetail; canManage: boolean; busy: boolean; onUpdate: (body: Record<string, unknown>) => void; onLifecycle: (action: string, body: Record<string, unknown>) => void }) {
  const user = detail.user;
  return <div className="identitySections">
    <section><h4>Profile and Access Dates</h4><dl className="factGrid"><Fact label="Username" value={user.username} /><Fact label="Masked email" value={user.maskedEmail ?? "Not provided"} /><Fact label="Masked mobile" value={user.maskedMobileNumber ?? "Not provided"} /><Fact label="Access starts" value={formatDate(user.effectiveFrom)} /><Fact label="Access ends" value={formatDate(user.effectiveTo)} /><Fact label="Last login" value={formatDate(user.lastLoginAt)} /></dl></section>
    {canManage && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const effectiveTo = String(data.get("effectiveTo") ?? ""); onUpdate({ displayName: data.get("displayName"), email: data.get("email") || null, maskedMobileNumber: data.get("mobile") || null, effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(), effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null, expectedRowVersion: user.rowVersion, reasonCode: data.get("reasonCode") }); }}><h4>Edit Profile and Access Dates</h4><label>Display name<input name="displayName" required defaultValue={user.displayName} /></label><label>Email<input name="email" type="email" /></label><label>Masked mobile<input name="mobile" defaultValue={user.maskedMobileNumber ?? ""} /></label><label>Access starts<input name="effectiveFrom" type="datetime-local" required defaultValue={toLocalInput(new Date(user.effectiveFrom))} /></label><label>Access ends<input name="effectiveTo" type="datetime-local" defaultValue={user.effectiveTo ? toLocalInput(new Date(user.effectiveTo)) : ""} /></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Save Profile</button></form>}
    {canManage && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const action = String(data.get("action")); if (window.confirm(`${humanize(action)} ${user.displayName}? This account status change will be checked before it is applied.`)) onLifecycle(action, { expectedRowVersion: user.rowVersion, reasonCode: data.get("reasonCode"), lockoutExpiresAt: null }); }}><h4>Account Status</h4><label>New status<select name="action"><option value="activate">Activate</option><option value="suspend">Suspend</option><option value="inactivate">Inactivate</option><option value="retire">Retire</option><option value="lock">Lock</option><option value="unlock">Unlock</option></select></label><label>Reason<input name="reasonCode" required /></label><button className="dangerButton" disabled={busy}>Update Account Status</button></form>}
  </div>;
}

interface AccessViewProps {
  detail: IdentityUserDetail;
  roleCatalogState: SectionLoadState<IdentityRoleDefinition[]>;
  permissionCatalogState: SectionLoadState<IdentityPermissionDefinition[]>;
  sites: ManagementPlatformSite[];
  siteGroups: Array<{ reference: string; name: string }>;
  canManageRoles: boolean;
  canManageScopes: boolean;
  canReviewAccess: boolean;
  busy: boolean;
  onRetryRoles: () => Promise<void>;
  onRetryPermissions: () => Promise<void>;
  runMutation: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  client: IdentityAdministrationClient;
}

function AccessView({ detail, roleCatalogState, permissionCatalogState, sites, siteGroups, canManageRoles, canManageScopes, canReviewAccess, busy, onRetryRoles, onRetryPermissions, runMutation, client }: AccessViewProps) {
  const user = detail.user;
  const roles = roleCatalogState.status === "loaded" ? roleCatalogState.value : [];
  const businessRoles = roles.filter((role) => role.status === "ACTIVE" && role.humanAssignable);

  return <div className="identitySections">
    <section>
      <h4>Roles &amp; Permissions</h4>
      {detail.roleAssignments.length === 0 ? <p>No roles are assigned.</p> : <div className="recordList">{detail.roleAssignments.map((assignment) => <article key={assignment.assignmentReference}><div><strong>{approvedRolePresentation(assignment.roleCode)?.label ?? assignment.roleName}</strong><p>{assignment.roleCode} · {humanize(assignment.status)}</p></div>{canManageRoles && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing ${assignment.roleName} from ${user.displayName}`); if (reason) void runMutation(() => client.revokeRole(user.userReference, assignment.assignmentReference, { expectedRowVersion: assignment.rowVersion, reasonCode: reason }), "Role removed."); }}>Remove Role</button>}</article>)}</div>}
    </section>
    {roleCatalogState.status === "loading" && <div className="inlineState" role="status">Loading role catalog</div>}
    {roleCatalogState.status === "error" && <SectionFailure label="Role catalog" error={roleCatalogState.error} onRetry={roleCatalogState.error.retryable ? () => void onRetryRoles() : undefined} />}
    {roleCatalogState.status === "not-authorized" && <div className="inlineState">The role catalog is not available with your current access.</div>}
    {roleCatalogState.status === "loaded" && roleCatalogState.value.length === 0 && <div className="inlineState">No assignable roles were returned.</div>}
    {canManageRoles && roleCatalogState.status === "loaded" && businessRoles.length > 0 && <form className="compactForm" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const role = roles.find((candidate) => candidate.roleReference === data.get("roleReference"));
      if (!role) return;
      void runMutation(() => client.assignRole(user.userReference, { roleReference: role.roleReference, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }), "Role assigned.");
    }}><h4>Add Role</h4><label>Role<select name="roleReference" required><option value="">Select a role</option>{businessRoles.map((role) => {
      const globalOnly = role.scopePolicy.allowedScopeTypes.length === 1 && role.scopePolicy.allowedScopeTypes.every((scope) => scope === "GLOBAL");
      return <option key={role.roleReference} value={role.roleReference}>{approvedRolePresentation(role.code)?.label ?? role.name}{globalOnly ? " (Global scope)" : ""}</option>;
    })}</select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Add Role</button></form>}

    <section><h4>Scope Access</h4><p className="warningText">Scope choices come from the selected role policy returned by Central PMS.</p>{detail.scopeGrants.length === 0 ? <p>No Site access is assigned.</p> : <div className="recordList">{detail.scopeGrants.map((grant) => {
      const assignment = detail.roleAssignments.find((candidate) => candidate.assignmentReference === grant.assignmentReference);
      const rolePolicy = assignment ? roles.find((role) => role.roleReference === assignment.roleReference) : undefined;
      const administrable = Boolean(rolePolicy?.scopePolicy.allowedScopeTypes.includes(grant.scopeType as AssignableScopeType));
      return <article key={grant.grantReference}><div><strong>{humanize(grant.scopeType)}</strong><p>{safeScopeName(grant, sites, siteGroups)} · {humanize(grant.status)}</p>{!administrable && <span className="readOnlyLabel">Read-only in Management Platform</span>}</div>{canManageScopes && administrable && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing this ${humanize(grant.scopeType)} access from ${user.displayName}`); if (reason) void runMutation(() => client.revokeScope(user.userReference, grant.assignmentReference, grant.grantReference, { expectedRowVersion: grant.rowVersion, reasonCode: reason }), "Access assignment removed."); }}>Remove Access</button>}</article>;
    })}</div>}</section>
    {canManageScopes && detail.roleAssignments.length > 0 && <ScopeGrantForm detail={detail} roleCatalogState={roleCatalogState} sites={sites} siteGroups={siteGroups} busy={busy} onGrant={(assignment, body) => void runMutation(() => client.grantScope(user.userReference, assignment, body), "Access assignment added.")} />}

    <section>
      <h4>Available Permissions</h4>
      {permissionCatalogState.status === "loading" && <div className="inlineState" role="status">Loading permission catalog</div>}
      {permissionCatalogState.status === "error" && <SectionFailure label="Permission catalog" error={permissionCatalogState.error} onRetry={permissionCatalogState.error.retryable ? () => void onRetryPermissions() : undefined} />}
      {permissionCatalogState.status === "not-authorized" && <div className="inlineState">The permission catalog is not available with your current access.</div>}
      {permissionCatalogState.status === "loaded" && <><p>{roles.length} roles and {permissionCatalogState.value.length} permissions are available in the current catalog.</p>{permissionCatalogState.value.length === 0 ? <p>No permissions were returned.</p> : <details><summary>View permission catalog</summary><ul className="catalogList">{permissionCatalogState.value.map((permission) => <li key={permission.permissionReference}><strong>{permission.name}</strong><span>{permission.code} · {permission.domain} · {humanize(permission.status)}</span></li>)}</ul></details>}</>}
    </section>

    {canReviewAccess && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void runMutation(() => client.reviewAccess(user.userReference, { assignmentReferences: detail.roleAssignments.map((item) => item.assignmentReference), scopeGrantReferences: detail.scopeGrants.map((item) => item.grantReference), outcome: data.get("outcome"), reasonCode: data.get("reasonCode") }), "Access Review recorded; access was not silently renewed."); }}><h4>Access Review</h4><label>Outcome<select name="outcome"><option>CONFIRMED</option><option>REMEDIATION_REQUIRED</option><option>REVOKE</option></select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Record Review</button></form>}
  </div>;
}

function ScopeGrantForm({ detail, roleCatalogState, sites, siteGroups, busy, onGrant }: { detail: IdentityUserDetail; roleCatalogState: SectionLoadState<IdentityRoleDefinition[]>; sites: ManagementPlatformSite[]; siteGroups: Array<{ reference: string; name: string }>; busy: boolean; onGrant: (assignment: string, body: Record<string, unknown>) => void }) {
  const roleCatalog = roleCatalogState.status === "loaded" ? roleCatalogState.value : [];
  const governedAssignments = detail.roleAssignments.flatMap((assignment) => {
    const role = roleCatalog.find((candidate) => candidate.roleReference === assignment.roleReference && candidate.status === "ACTIVE" && candidate.humanAssignable);
    return role && role.scopePolicy.allowedScopeTypes.length > 0 ? [{ assignment, role }] : [];
  });
  const [assignmentReference, setAssignmentReference] = useState("");
  const selected = governedAssignments.find((item) => item.assignment.assignmentReference === assignmentReference) ?? governedAssignments[0];
  const [requestedType, setRequestedType] = useState<AssignableScopeType | "">("");
  const allowedScopeTypes = selected?.role.scopePolicy.allowedScopeTypes ?? [];
  const effectiveType = allowedScopeTypes.includes(requestedType as AssignableScopeType)
    ? requestedType as AssignableScopeType
    : requestedType === "" ? selected?.role.scopePolicy.defaultScope ?? "" : "";
  const targets = effectiveType === "SITE" ? sites.map((site) => ({ reference: site.siteId, name: site.displayName })) : effectiveType === "SITE_GROUP" ? siteGroups : [];

  if (roleCatalogState.status !== "loaded" || governedAssignments.length === 0) {
    return <div className="inlineState" role="status">Scope assignment is unavailable until Central PMS returns valid role policy for an assigned role.</div>;
  }

  return <form className="compactForm" onSubmit={(event) => {
    event.preventDefault();
    if (!selected || !effectiveType || !selected.role.scopePolicy.allowedScopeTypes.includes(effectiveType)) return;
    const data = new FormData(event.currentTarget);
    const target = String(data.get("targetReference") ?? "");
    if (effectiveType !== "GLOBAL" && !target) return;
    onGrant(selected.assignment.assignmentReference, { scopeType: effectiveType, siteReference: effectiveType === "SITE" ? target : null, siteGroupReference: effectiveType === "SITE_GROUP" ? target : null, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() });
  }}><h4>Add Scope Access</h4><label>Role<select value={selected.assignment.assignmentReference} onChange={(event) => { const next = governedAssignments.find((item) => item.assignment.assignmentReference === event.target.value); setAssignmentReference(event.target.value); setRequestedType(next?.role.scopePolicy.defaultScope ?? ""); }}>{governedAssignments.map((item) => <option key={item.assignment.assignmentReference} value={item.assignment.assignmentReference}>{approvedRolePresentation(item.assignment.roleCode)?.label ?? item.assignment.roleName}</option>)}</select></label><label>Access level<select aria-label="Scope access level" value={effectiveType} disabled={allowedScopeTypes.length === 1 && Boolean(selected.role.scopePolicy.defaultScope)} onChange={(event) => setRequestedType(event.target.value as AssignableScopeType | "")}>{!selected.role.scopePolicy.defaultScope && <option value="">Select an access level</option>}{allowedScopeTypes.map((scope) => <option key={scope} value={scope}>{scope === "SITE_GROUP" ? "Site Group" : scope === "SITE" ? "Site" : "Global"}</option>)}</select></label>{effectiveType === "GLOBAL" ? <div className="governanceBoundary" role="note">Central PMS role policy requires or permits explicit Global scope for this assignment.</div> : effectiveType ? <><label>{effectiveType === "SITE" ? "Site" : "Site Group"}<select name="targetReference" required disabled={targets.length === 0}><option value="">Select {effectiveType === "SITE" ? "a Site" : "a Site Group"}</option>{targets.map((target) => <option key={target.reference} value={target.reference}>{target.name}</option>)}</select></label>{targets.length === 0 && <div className="inlineState">No authorized {effectiveType === "SITE" ? "Sites" : "Site Groups"} are available</div>}</> : <div className="inlineState">Select an access level from the Central PMS role policy.</div>}<label>Reason<input name="reasonCode" required /></label><button disabled={busy || !effectiveType || (effectiveType !== "GLOBAL" && targets.length === 0)}>Add Access</button></form>;
}
function SecurityView({ detail, mfaState, sessionState, canResetMfa, canRemoveMfa, canRevokeSessions, busy, onRetryMfa, onRetrySessions, onProvision, onRemove, runMutation, client }: { detail: IdentityUserDetail; mfaState: SectionLoadState<IdentityMfaStatus>; sessionState: SectionLoadState<IdentitySessionSummary[]>; canResetMfa: boolean; canRemoveMfa: boolean; canRevokeSessions: boolean; busy: boolean; onRetryMfa: () => void; onRetrySessions: () => void; onProvision: (action: "setup" | "reset", expectedRowVersion: number | null) => Promise<void>; onRemove: (expectedRowVersion: number) => Promise<void>; runMutation: (action: () => Promise<unknown>, success: string) => Promise<boolean>; client: IdentityAdministrationClient }) {
  const user = detail.user;
  const mfa = mfaState.status === "loaded" ? mfaState.value : undefined;
  const sessions = sessionState.status === "loaded" ? sessionState.value : [];

  return <div className="identitySections">
    <section>
      <h4>Two-Factor Authentication</h4>
      {mfaState.status === "loading" && <div className="inlineState" role="status">Loading two-factor authentication details</div>}
      {mfaState.status === "not-authorized" && <p>Two-factor authentication details are not available with your current access.</p>}
      {mfaState.status === "error" && <SectionFailure label="Two-Factor Authentication" error={mfaState.error} onRetry={mfaState.error.retryable ? onRetryMfa : undefined} />}
      {mfa && <><dl className="factGrid"><Fact label="Management Platform TOTP" value={mfa.enrolled ? "Required for sign-in" : "Authenticator is not provisioned"} /><Fact label="Authenticator app" value={mfa.enrolled ? "Set up" : "Not set up"} />{mfa.enrolled && <Fact label="Status" value={humanize(mfa.status)} />}<Fact label="Last used" value={formatDate(mfa.lastSuccessfullyUsedAt)} /></dl><div className="formActions">{canResetMfa && (mfa.enrolled ? <button disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Reset the authenticator app for ${user.displayName}?`, () => void onProvision("reset", mfa.rowVersion))}>Reset Authenticator App</button> : <button disabled={busy} onClick={() => confirmSecurityAction(`Set up the authenticator app for ${user.displayName}?`, () => void onProvision("setup", mfa.rowVersion))}>Set Up Authenticator App</button>)}{canRemoveMfa && mfa.enrolled && <button className="dangerButton" disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Remove the authenticator app for ${user.displayName}?`, () => void onRemove(mfa.rowVersion!))}>Remove Authenticator App</button>}</div></>}
      <p className="privacyNote">Provisioning details appear only in the successful setup or reset response and disappear when its panel is closed.</p>
    </section>
    <section>
      <h4>Active Sessions</h4>
      {sessionState.status === "loading" && <div className="inlineState" role="status">Loading active sessions</div>}
      {sessionState.status === "not-authorized" && <p>Active Sessions are not available with your current access.</p>}
      {sessionState.status === "error" && <SectionFailure label="Active Sessions" error={sessionState.error} onRetry={sessionState.error.retryable ? onRetrySessions : undefined} />}
      {sessionState.status === "loaded" && (sessions.length === 0 ? <p>No active sessions returned.</p> : <div className="recordList">{sessions.map((session, index) => <article key={session.sessionReference}><div><strong>{session.audience} session {index + 1}</strong><p>{humanize(session.status)} · Last seen {formatDate(session.lastSeenAt)} · Expires {formatDate(session.idleExpiresAt)}</p></div>{canRevokeSessions && session.status === "ACTIVE" && <button className="dangerTextButton" disabled={busy} onClick={() => confirmSecurityAction(`Sign out session ${index + 1} for ${user.displayName}?`, () => void runMutation(() => client.revokeSession(user.userReference, session.sessionReference, "GOVERNED_SESSION_REVOCATION"), "Session signed out."))}>Sign Out Session</button>}</article>)}</div>)}
      {canRevokeSessions && sessionState.status === "loaded" && sessions.length > 0 && <button className="dangerButton" disabled={busy} onClick={() => confirmSecurityAction(`Sign out all sessions for ${user.displayName}?`, () => void runMutation(() => client.revokeSession(user.userReference, null, "GOVERNED_REVOKE_ALL_SESSIONS"), "All sessions signed out for this user."))}>Sign Out All Sessions</button>}
      <p className="privacyNote">Session cookies, secrets, hashes, bearer tokens, and refresh tokens are never displayed.</p>
    </section>
  </div>;
}

function AuditView({ state, onRetry }: { state: SectionLoadState<IdentityAuditEntry[]>; onRetry: () => void }) {
  return <section className="identitySections"><div><h4>Activity Log</h4>
    {state.status === "loading" && <div className="inlineState" role="status">Loading activity</div>}
    {state.status === "not-authorized" && <p>Activity Log entries are not available with your current access.</p>}
    {state.status === "error" && <SectionFailure label="Activity Log" error={state.error} onRetry={state.error.retryable ? onRetry : undefined} />}
    {state.status === "loaded" && (state.value.length === 0 ? <p>No activity was returned for this user.</p> : <div className="auditTable" role="table" aria-label="User activity log">{state.value.map((entry) => <div role="row" key={entry.auditReference}><div role="cell"><strong>{humanize(entry.eventType)}</strong><span>{formatDate(entry.occurredAt)}</span></div><div role="cell"><StatusLabel value={entry.result} /><p>{entry.summary ?? humanize(entry.reasonCode ?? "No summary supplied")}</p>{entry.correlationReference && <small>Support reference: {entry.correlationReference}</small>}</div></div>)}</div>)}
  </div></section>;
}

function IdentityError({ error, onRetry }: { error: ManagementPlatformUiError; onRetry?: () => void }) {
  const title = error.kind === "permission-denied" ? "Permission denied" : error.kind === "not-found" ? "User unavailable" : error.kind === "conflict" ? "Current information changed" : "User Administration unavailable";
  const message = error.kind === "conflict" ? "Reload the current state before deliberately retrying. No stale change was applied." : error.message;
  return <div className="identityError" role="alert"><strong>{title}</strong><p>{message}</p>{error.correlationId && <small>Support reference: {error.correlationId}</small>}{onRetry && <button className="secondaryButton" onClick={onRetry}>Retry</button>}</div>;
}

function SectionFailure({ label, error, onRetry }: { label: string; error: ManagementPlatformUiError; onRetry?: () => void }) {
  const state = error.kind === "permission-denied" ? "Access denied" : error.kind === "not-found" ? "Not found" : error.kind === "conflict" ? "Current information changed" : "Unavailable";
  return <div className="identitySectionError" role="alert"><strong>{label}: {state}</strong><p>{error.message}</p>{error.correlationId && <small>Support reference: {error.correlationId}</small>}{onRetry && <button className="secondaryButton" type="button" onClick={onRetry}>Retry {label}</button>}</div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function StatusLabel({ value }: { value: string }) { return <span className={`statusLabel status-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{humanize(value)}</span>; }
function humanize(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function displayUserType(value: string) { return value === "HUMAN" ? "User" : humanize(value); }
function formatDate(value: string | null) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); }
function toLocalInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function asUiError(value: unknown): ManagementPlatformUiError { return typeof value === "object" && value !== null && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "IDENTITY_ADMIN_SAFE_FAILURE", message: "The User Administration request could not be completed.", retryable: false, mutationUncertain: false }; }
function confirmSecurityAction(message: string, action: () => void) { if (window.confirm(message)) action(); }
function safeScopeName(grant: IdentityUserDetail["scopeGrants"][number], sites: ManagementPlatformSite[], groups: Array<{ reference: string; name: string }>) { if (grant.scopeType === "SITE") return sites.find((site) => site.siteId === grant.siteReference)?.displayName ?? "Authoritative Site metadata unavailable"; if (grant.scopeType === "SITE_GROUP") return groups.find((group) => group.reference === grant.siteGroupReference)?.name ?? "Authoritative Site Group metadata unavailable"; return "Organization-wide access unavailable"; }
