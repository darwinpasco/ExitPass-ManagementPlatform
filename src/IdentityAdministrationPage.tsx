import { useCallback, useEffect, useRef, useState } from "react";
import {
  identityAdministrationPermissions,
  toAssignableRoleOption,
  toBusinessRoleOption,
  type IdentityAdministrationClient,
  type IdentityAuditEntry,
  type DelegableScopeCatalog,
  type IdentityMfaStatus,
  type IdentityPermissionDefinition,
  type IdentityPrivilegedAccessRequest,
  type IdentityRoleDefinition,
  type IdentitySessionSummary,
  type IdentityUserDetail,
  type IdentityUserSummary
} from "./identityAdministration";
import { hasAnyPermission, hasPermission } from "./permissions";
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
  const [privilegedRequestState, setPrivilegedRequestState] = useState<SectionLoadState<IdentityPrivilegedAccessRequest>>({ status: "idle" });
  const [privilegedRequestReference, setPrivilegedRequestReference] = useState("");
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
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const usersRequestSequence = useRef(0);

  const canManageUsers = hasPermission(permissions, identityAdministrationPermissions.userManage);
  const canManageRoles = hasAnyPermission(permissions, [identityAdministrationPermissions.roleAssignmentManage, "assignment.manage"]);
  const canManageScopes = hasAnyPermission(permissions, [identityAdministrationPermissions.scopeAssignmentManage, "assignment.manage"]);
  const canCreateUsers = canManageUsers && canManageRoles && canManageScopes;
  const canDecidePrivileged = hasPermission(permissions, identityAdministrationPermissions.privilegedAccessDecide);
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
    setPrivilegedRequestState({ status: "idle" });
    setPrivilegedRequestReference("");
    if (selectedReference) void loadDetail(selectedReference);
  }, [loadDetail, selectedReference]);
  useEffect(() => {
    if (selectedReference && window.matchMedia?.("(max-width: 1040px)").matches) {
      detailRef.current?.focus();
    }
  }, [selectedReference]);

  const loadPrivilegedRequest = useCallback(async (requestReference: string) => {
    const normalizedReference = requestReference.trim();
    if (!normalizedReference) return;
    setPrivilegedRequestState({ status: "loading" });
    try {
      const request = await client.getPrivilegedAccessRequest(normalizedReference);
      setPrivilegedRequestReference(request.requestReference);
      setPrivilegedRequestState({ status: "loaded", value: request });
    } catch (caught) {
      setPrivilegedRequestState({ status: "error", error: asUiError(caught) });
    }
  }, [client]);

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
      {error && <IdentityError error={error} onRetry={error.retryable ? () => void refreshAuthoritativeState() : undefined} />}
      {authoritativeStateStale && <div className="identityStaleState" role="alert"><strong>Information may be out of date.</strong><p>Previously loaded information is retained for reference. Changes are disabled until a successful authoritative refresh completes.</p><button className="secondaryButton" type="button" disabled={loading || busy} onClick={() => void refreshAuthoritativeState()}>Refresh authoritative state</button></div>}

      {showCreate && <CreateUserPanel busy={mutationsDisabled} roleCatalogState={roleCatalogState} scopeCatalogState={scopeCatalogState} onRetryRoles={loadRoleCatalog} onRetryScopes={loadScopeCatalog} onCancel={() => setShowCreate(false)} onCreate={async (body) => {
        const created = await runMutation(
          () => client.createUser(body),
          "User added with an initial role and access assignment.",
          async (result) => {
            const user = result as IdentityUserSummary;
            setQuery("");
            setStatusFilter("");
            const loaded = await loadUsers(0, "", "");
            if (loaded) {
              setSelectedReference(user.userReference);
              setView("profile");
            }
            return loaded;
          }
        );
        if (created) setShowCreate(false);
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
                <button className={selectedReference === user.userReference ? "selectedUser" : ""} type="button" onClick={() => { setSelectedReference(user.userReference); setView("profile"); }}>
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
              <header className="identityDetailHeader"><div><p className="eyebrow">Selected user</p><h3>{detail.user.displayName}</h3><p>{detail.user.username} · {displayUserType(detail.user.userType)}</p></div><StatusLabel value={detail.user.status} /></header>
              <div className="identityTabs" role="tablist" aria-label="User administration areas">
                {(["profile", "access", "security", "audit"] as DetailView[]).map((tab) => <button key={tab} role="tab" type="button" aria-selected={view === tab} className={view === tab ? "activeTab" : ""} onClick={() => setView(tab)}>{detailViewLabels[tab]}</button>)}
              </div>
              {view === "profile" && <ProfileView detail={detail} canManage={canManageUsers} busy={mutationsDisabled} onUpdate={(body) => void runMutation(() => client.updateUser(detail.user.userReference, body), "Profile updated.")} onLifecycle={(action, body) => void runMutation(() => client.changeLifecycle(detail.user.userReference, action, body), `Account status changed to ${humanize(action)}.`)} />}
              {view === "access" && <AccessView detail={detail} roleCatalogState={roleCatalogState} permissionCatalogState={permissionCatalogState} sites={sites} siteGroups={siteGroups} canManageRoles={canManageRoles} canManageScopes={canManageScopes} canDecidePrivileged={canDecidePrivileged} canReviewAccess={canReviewAccess} busy={mutationsDisabled} privilegedRequestState={privilegedRequestState} privilegedRequestReference={privilegedRequestReference} onPrivilegedRequestReference={setPrivilegedRequestReference} onLoadPrivilegedRequest={loadPrivilegedRequest} onPrivilegedRequest={(request) => { setPrivilegedRequestReference(request.requestReference); setPrivilegedRequestState({ status: "loaded", value: request }); }} onRetryRoles={loadRoleCatalog} onRetryPermissions={loadPermissionCatalog} runMutation={runMutation} client={client} />}
              {view === "security" && <SecurityView detail={detail} mfaState={mfaState} sessionState={sessionState} canResetMfa={canResetMfa} canRemoveMfa={canRemoveMfa} canRevokeSessions={canRevokeSessions} busy={mutationsDisabled} onRetryMfa={() => void loadMfa(detail.user.userReference)} onRetrySessions={() => void loadSessions(detail.user.userReference)} runMutation={runMutation} client={client} />}
              {view === "audit" && <AuditView state={auditState} onRetry={() => void loadAudit(detail.user.userReference)} />}
            </>
          ) : <div className="inlineState">The requested user is unavailable within your authorized scope.</div>}
        </section>
      </div>
    </section>
  );
}

function CreateUserPanel({ busy, roleCatalogState, scopeCatalogState, onRetryRoles, onRetryScopes, onCancel, onCreate }: { busy: boolean; roleCatalogState: SectionLoadState<IdentityRoleDefinition[]>; scopeCatalogState: SectionLoadState<DelegableScopeCatalog>; onRetryRoles: () => Promise<void>; onRetryScopes: () => Promise<void>; onCancel: () => void; onCreate: (body: Record<string, unknown>) => Promise<void> }) {
  const [scopeType, setScopeType] = useState<"SITE" | "SITE_GROUP">("SITE");
  const [userType, setUserType] = useState("");
  const [initialRoleReference, setInitialRoleReference] = useState("");
  const [initialScopeReference, setInitialScopeReference] = useState("");
  const roles = roleCatalogState.status === "loaded"
    ? roleCatalogState.value.map(toAssignableRoleOption).filter((role) => role !== undefined)
    : [];
  const userTypes = [...new Set(roles.map((role) => role.userType))];
  const compatibleRoles = roles.filter((role) => role.userType === userType);
  const scopeOptions = scopeCatalogState.status !== "loaded"
    ? []
    : scopeType === "SITE"
      ? scopeCatalogState.value.sites.map((site) => ({ reference: site.siteId, name: site.siteName }))
      : scopeCatalogState.value.siteGroups.map((group) => ({ reference: group.siteGroupId, name: group.siteGroupName }));
  const submissionUnavailable = busy || !userType || compatibleRoles.length === 0 || scopeOptions.length === 0 || !initialRoleReference || !initialScopeReference;
  return <form className="administrationForm" aria-labelledby="create-user-title" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const targetReference = String(data.get("initialScopeReference")); void onCreate({ username: data.get("username"), displayName: data.get("displayName"), email: data.get("email") || null, maskedMobileNumber: data.get("mobile") || null, userType: data.get("userType"), initialRoleReference: data.get("initialRoleReference"), initialScopeType: scopeType, initialSiteReference: scopeType === "SITE" ? targetReference : null, initialSiteGroupReference: scopeType === "SITE_GROUP" ? targetReference : null, effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }); }}>
    <div><h3 id="create-user-title">Add User</h3><p>No password is collected here. Account setup and invitation delivery are handled separately.</p></div>
    <label>Username<input name="username" required autoComplete="off" /></label><label>Display name<input name="displayName" required /></label><label>Email (optional)<input name="email" type="email" /></label><label>Masked mobile (optional)<input name="mobile" /></label><label>User type<select name="userType" required value={userType} onChange={(event) => { setUserType(event.target.value); setInitialRoleReference(""); }}><option value="">Select a user type</option>{userTypes.map((value) => <option key={value} value={value}>{displayUserType(value)}</option>)}</select></label>
    {roleCatalogState.status === "loading" && <div className="inlineState" role="status">Loading available roles</div>}
    {roleCatalogState.status === "error" && <SectionFailure label="Role catalog" error={roleCatalogState.error} onRetry={roleCatalogState.error.retryable ? () => void onRetryRoles() : undefined} />}
    <label>Initial role<select name="initialRoleReference" required value={initialRoleReference} onChange={(event) => setInitialRoleReference(event.target.value)} disabled={!userType}><option value="">Select a role</option>{compatibleRoles.map((role) => <option key={role.reference} value={role.reference}>{role.label}</option>)}</select></label>
    <label>Site access level<select value={scopeType} onChange={(event) => { setScopeType(event.target.value as "SITE" | "SITE_GROUP"); setInitialScopeReference(""); }}><option value="SITE">Site</option><option value="SITE_GROUP">Site Group</option></select></label>
    {scopeCatalogState.status === "loading" && <div className="inlineState" role="status">Loading authorized Site access</div>}
    {scopeCatalogState.status === "error" && <SectionFailure label="Authoritative Site access" error={scopeCatalogState.error} onRetry={scopeCatalogState.error.retryable ? () => void onRetryScopes() : undefined} />}
    {scopeCatalogState.status === "loaded" && scopeOptions.length === 0 && <div className="inlineState">No authorized {scopeType === "SITE" ? "Sites" : "Site Groups"} are available</div>}
    <label>{scopeType === "SITE" ? "Assigned Site" : "Assigned Site Group"}<select key={scopeType} name="initialScopeReference" required value={initialScopeReference} onChange={(event) => setInitialScopeReference(event.target.value)} disabled={scopeCatalogState.status !== "loaded" || scopeOptions.length === 0}><option value="">Select {scopeType === "SITE" ? "a Site" : "a Site Group"}</option>{scopeOptions.map((scope) => <option key={scope.reference} value={scope.reference}>{scope.name}</option>)}</select></label>
    <label>Access starts<input name="effectiveFrom" type="datetime-local" required defaultValue={toLocalInput(new Date())} /></label><label>Reason<input name="reasonCode" required /></label>
    <div className="formActions"><button type="submit" disabled={submissionUnavailable}>Add User</button><button className="secondaryButton" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
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
  canDecidePrivileged: boolean;
  canReviewAccess: boolean;
  busy: boolean;
  privilegedRequestState: SectionLoadState<IdentityPrivilegedAccessRequest>;
  privilegedRequestReference: string;
  onPrivilegedRequestReference: (value: string) => void;
  onLoadPrivilegedRequest: (requestReference: string) => Promise<void>;
  onPrivilegedRequest: (value: IdentityPrivilegedAccessRequest) => void;
  onRetryRoles: () => Promise<void>;
  onRetryPermissions: () => Promise<void>;
  runMutation: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  client: IdentityAdministrationClient;
}

function AccessView({ detail, roleCatalogState, permissionCatalogState, sites, siteGroups, canManageRoles, canManageScopes, canDecidePrivileged, canReviewAccess, busy, privilegedRequestState, privilegedRequestReference, onPrivilegedRequestReference, onLoadPrivilegedRequest, onPrivilegedRequest, onRetryRoles, onRetryPermissions, runMutation, client }: AccessViewProps) {
  const user = detail.user;
  const roles = roleCatalogState.status === "loaded" ? roleCatalogState.value : [];
  const businessRoles = roles.flatMap((role) => {
    const option = toBusinessRoleOption(role);
    return option ? [{ role, option }] : [];
  });
  const privilegedRequest = privilegedRequestState.status === "loaded" ? privilegedRequestState.value : undefined;

  return <div className="identitySections">
    <section>
      <h4>Roles &amp; Permissions</h4>
      {detail.roleAssignments.length === 0 ? <p>No roles are assigned.</p> : <div className="recordList">{detail.roleAssignments.map((assignment) => <article key={assignment.assignmentReference}><div><strong>{assignment.roleName}</strong><p>{assignment.roleCode} · {humanize(assignment.status)}</p></div>{canManageRoles && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing ${assignment.roleName} from ${user.displayName}`); if (reason) void runMutation(() => client.revokeRole(user.userReference, assignment.assignmentReference, { expectedRowVersion: assignment.rowVersion, reasonCode: reason }), "Role removed."); }}>Remove Role</button>}</article>)}</div>}
    </section>
    {roleCatalogState.status === "loading" && <div className="inlineState" role="status">Loading role catalog</div>}
    {roleCatalogState.status === "error" && <SectionFailure label="Role catalog" error={roleCatalogState.error} onRetry={roleCatalogState.error.retryable ? () => void onRetryRoles() : undefined} />}
    {roleCatalogState.status === "not-authorized" && <div className="inlineState">The role catalog is not available with your current access.</div>}
    {roleCatalogState.status === "loaded" && roleCatalogState.value.length === 0 && <div className="inlineState">No assignable roles were returned.</div>}
    {canManageRoles && roleCatalogState.status === "loaded" && businessRoles.length > 0 && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const role = roles.find((candidate) => candidate.roleReference === data.get("roleReference")); if (!role) return; if (role.isPrivileged) { void runMutation(async () => { const value = await client.createPrivilegedAccessRequest({ targetUserReference: user.userReference, roleReference: role.roleReference, scopeType: null, siteReference: null, siteGroupReference: null, effectiveFrom: new Date().toISOString(), effectiveTo: null, expiresAt: null, reasonCode: data.get("reasonCode") }); onPrivilegedRequest(value); return value; }, "Elevated access requested. Approval does not activate access."); } else { void runMutation(() => client.assignRole(user.userReference, { roleReference: role.roleReference, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }), "Role assigned."); } }}><h4>Add Role</h4><label>Role<select name="roleReference" required><option value="">Select a role</option>{businessRoles.map(({ role, option }) => <option key={role.roleReference} value={role.roleReference}>{option.label}{role.isPrivileged ? " (requires elevated access approval)" : ""}</option>)}</select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Add Role or Request Access</button></form>}

    <section><h4>Site Access</h4><p className="warningText"><strong>Organization-wide access is not available.</strong> Access must be limited to an approved Site or Site Group.</p>{detail.scopeGrants.length === 0 ? <p>No Site access is assigned.</p> : <div className="recordList">{detail.scopeGrants.map((grant) => {
      const administrable = grant.scopeType === "SITE" || grant.scopeType === "SITE_GROUP";
      return <article key={grant.grantReference}><div><strong>{humanize(grant.scopeType)}</strong><p>{safeScopeName(grant, sites, siteGroups)} · {humanize(grant.status)}</p>{!administrable && <span className="readOnlyLabel">Read-only in Management Platform</span>}</div>{canManageScopes && administrable && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing this ${humanize(grant.scopeType)} access from ${user.displayName}`); if (reason) void runMutation(() => client.revokeScope(user.userReference, grant.assignmentReference, grant.grantReference, { expectedRowVersion: grant.rowVersion, reasonCode: reason }), "Access assignment removed."); }}>Remove Access</button>}</article>;
    })}</div>}</section>
    {canManageScopes && detail.roleAssignments.length > 0 && <ScopeGrantForm detail={detail} sites={sites} siteGroups={siteGroups} busy={busy} onGrant={(assignment, body) => void runMutation(() => client.grantScope(user.userReference, assignment, body), "Access assignment added.")} />}

    <section>
      <h4>Available Permissions</h4>
      {permissionCatalogState.status === "loading" && <div className="inlineState" role="status">Loading permission catalog</div>}
      {permissionCatalogState.status === "error" && <SectionFailure label="Permission catalog" error={permissionCatalogState.error} onRetry={permissionCatalogState.error.retryable ? () => void onRetryPermissions() : undefined} />}
      {permissionCatalogState.status === "not-authorized" && <div className="inlineState">The permission catalog is not available with your current access.</div>}
      {permissionCatalogState.status === "loaded" && <><p>{roles.length} roles and {permissionCatalogState.value.length} permissions are available in the current catalog.</p>{permissionCatalogState.value.length === 0 ? <p>No permissions were returned.</p> : <details><summary>View permission catalog</summary><ul className="catalogList">{permissionCatalogState.value.map((permission) => <li key={permission.permissionReference}><strong>{permission.name}</strong><span>{permission.code} · {permission.domain} · {humanize(permission.status)}</span></li>)}</ul></details>}</>}
    </section>

    <section className="privilegedEvidence">
      <h4>Elevated Access</h4>
      <form className="compactForm" onSubmit={(event) => { event.preventDefault(); void onLoadPrivilegedRequest(privilegedRequestReference); }}>
        <label htmlFor="elevated-request-reference">Request reference<input id="elevated-request-reference" value={privilegedRequestReference} onChange={(event) => onPrivilegedRequestReference(event.target.value)} required autoComplete="off" spellCheck={false} /></label>
        <button disabled={busy || privilegedRequestState.status === "loading"}>Load Request</button>
      </form>
      {privilegedRequestState.status === "idle" && <p>Enter a request reference to reopen an existing elevated access request.</p>}
      {privilegedRequestState.status === "loading" && <div className="inlineState" role="status">Loading elevated access request</div>}
      {privilegedRequestState.status === "error" && <SectionFailure label="Elevated Access request" error={privilegedRequestState.error} onRetry={privilegedRequestState.error.retryable ? () => void onLoadPrivilegedRequest(privilegedRequestReference) : undefined} />}
      {privilegedRequest && <><StatusLabel value={privilegedRequest.status} /><p>Approval records the decision but does not activate access. Access becomes active only when Central PMS reports an active role.</p>{canDecidePrivileged && privilegedRequest.status === "REQUESTED" && <div className="formActions"><button disabled={busy} onClick={() => void runMutation(async () => { const value = await client.decidePrivilegedAccess(privilegedRequest.requestReference, { decision: "APPROVE", reasonCode: "GOVERNED_ADMIN_APPROVAL", expectedRowVersion: privilegedRequest.rowVersion }); onPrivilegedRequest(value); return value; }, "Elevated access approved, but access is not shown as active.")}>Approve Elevated Access</button><button className="dangerButton" disabled={busy} onClick={() => void runMutation(async () => { const value = await client.decidePrivilegedAccess(privilegedRequest.requestReference, { decision: "REJECT", reasonCode: "GOVERNED_ADMIN_REJECTION", expectedRowVersion: privilegedRequest.rowVersion }); onPrivilegedRequest(value); return value; }, "Elevated access rejected.")}>Reject</button></div>}</>}
    </section>
    {canReviewAccess && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void runMutation(() => client.reviewAccess(user.userReference, { assignmentReferences: detail.roleAssignments.map((item) => item.assignmentReference), scopeGrantReferences: detail.scopeGrants.map((item) => item.grantReference), outcome: data.get("outcome"), reasonCode: data.get("reasonCode") }), "Access Review recorded; access was not silently renewed."); }}><h4>Access Review</h4><label>Outcome<select name="outcome"><option>CONFIRMED</option><option>REMEDIATION_REQUIRED</option><option>REVOKE</option></select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Record Review</button></form>}
  </div>;
}

function ScopeGrantForm({ detail, sites, siteGroups, busy, onGrant }: { detail: IdentityUserDetail; sites: ManagementPlatformSite[]; siteGroups: Array<{ reference: string; name: string }>; busy: boolean; onGrant: (assignment: string, body: Record<string, unknown>) => void }) {
  const [type, setType] = useState<"SITE" | "SITE_GROUP">("SITE");
  const targets = type === "SITE" ? sites.map((site) => ({ reference: site.siteId, name: site.displayName })) : siteGroups;
  return <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const target = String(data.get("targetReference")); onGrant(String(data.get("assignmentReference")), { scopeType: type, siteReference: type === "SITE" ? target : null, siteGroupReference: type === "SITE_GROUP" ? target : null, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }); }}><h4>Add Site Access</h4><label>Role<select name="assignmentReference" required>{detail.roleAssignments.map((assignment) => <option key={assignment.assignmentReference} value={assignment.assignmentReference}>{assignment.roleName}</option>)}</select></label><label>Access level<select value={type} onChange={(event) => setType(event.target.value as "SITE" | "SITE_GROUP")}><option value="SITE">Site</option><option value="SITE_GROUP">Site Group</option></select></label>{targets.length === 0 && <div className="inlineState">No authorized {type === "SITE" ? "Sites" : "Site Groups"} are available</div>}<label>{type === "SITE" ? "Site" : "Site Group"}<select name="targetReference" required disabled={targets.length === 0}><option value="">Select {type === "SITE" ? "a Site" : "a Site Group"}</option>{targets.map((target) => <option key={target.reference} value={target.reference}>{target.name}</option>)}</select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy || targets.length === 0}>Add Access</button></form>;
}

function SecurityView({ detail, mfaState, sessionState, canResetMfa, canRemoveMfa, canRevokeSessions, busy, onRetryMfa, onRetrySessions, runMutation, client }: { detail: IdentityUserDetail; mfaState: SectionLoadState<IdentityMfaStatus>; sessionState: SectionLoadState<IdentitySessionSummary[]>; canResetMfa: boolean; canRemoveMfa: boolean; canRevokeSessions: boolean; busy: boolean; onRetryMfa: () => void; onRetrySessions: () => void; runMutation: (action: () => Promise<unknown>, success: string) => Promise<boolean>; client: IdentityAdministrationClient }) {
  const user = detail.user;
  const mfa = mfaState.status === "loaded" ? mfaState.value : undefined;
  const sessions = sessionState.status === "loaded" ? sessionState.value : [];

  return <div className="identitySections">
    <section>
      <h4>Two-Factor Authentication</h4>
      {mfaState.status === "loading" && <div className="inlineState" role="status">Loading two-factor authentication details</div>}
      {mfaState.status === "not-authorized" && <p>Two-factor authentication details are not available with your current access.</p>}
      {mfaState.status === "error" && <SectionFailure label="Two-Factor Authentication" error={mfaState.error} onRetry={mfaState.error.retryable ? onRetryMfa : undefined} />}
      {mfa && <><dl className="factGrid"><Fact label="Elevated access requirement" value={mfa.requiredForPrivilegedManagementPlatform ? "Required for elevated Management Platform access" : "Not required for this user"} /><Fact label="Authenticator app" value={mfa.enrolled ? "Set up" : "Not set up"} /><Fact label="Status" value={humanize(mfa.status)} /><Fact label="Last used" value={formatDate(mfa.lastSuccessfullyUsedAt)} /></dl><div className="formActions">{canResetMfa && <button disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Reset the authenticator app for ${user.displayName}?`, () => void runMutation(() => client.changeMfa(user.userReference, "reset", { expectedRowVersion: mfa.rowVersion, reasonCode: "GOVERNED_MFA_RESET" }), "Authenticator app reset recorded."))}>Reset Authenticator App</button>}{canRemoveMfa && <button className="dangerButton" disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Remove the authenticator app for ${user.displayName}?`, () => void runMutation(() => client.changeMfa(user.userReference, "remove", { expectedRowVersion: mfa.rowVersion, reasonCode: "GOVERNED_MFA_REMOVE" }), "Authenticator app removed."))}>Remove Authenticator App</button>}</div></>}
      <p className="privacyNote">Setup secrets, one-time codes, and recovery information are never displayed.</p>
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
