import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  identityAdministrationPermissions,
  type IdentityAdministrationClient,
  type IdentityAuditEntry,
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

const detailViewLabels: Record<DetailView, string> = {
  profile: "Profile",
  access: "Roles & Permissions",
  security: "Security",
  audit: "Activity Log"
};

interface Props {
  client: IdentityAdministrationClient;
  permissions: readonly string[];
  authorizedSites: ManagementPlatformSite[];
  authorizedSiteGroupReferences: readonly string[];
}

export function IdentityAdministrationPage({ client, permissions, authorizedSites, authorizedSiteGroupReferences }: Props) {
  const [users, setUsers] = useState<IdentityUserSummary[]>([]);
  const [selectedReference, setSelectedReference] = useState<string>();
  const [detail, setDetail] = useState<IdentityUserDetail>();
  const [roles, setRoles] = useState<IdentityRoleDefinition[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<IdentityPermissionDefinition[]>([]);
  const [sessions, setSessions] = useState<IdentitySessionSummary[]>([]);
  const [mfa, setMfa] = useState<IdentityMfaStatus>();
  const [audit, setAudit] = useState<IdentityAuditEntry[]>([]);
  const [privilegedRequest, setPrivilegedRequest] = useState<IdentityPrivilegedAccessRequest>();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<DetailView>("profile");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ManagementPlatformUiError>();
  const [notice, setNotice] = useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const canManageUsers = hasPermission(permissions, identityAdministrationPermissions.userManage);
  const canManageRoles = hasAnyPermission(permissions, [identityAdministrationPermissions.roleAssignmentManage, "assignment.manage"]);
  const canManageScopes = hasAnyPermission(permissions, [identityAdministrationPermissions.scopeAssignmentManage, "assignment.manage"]);
  const canDecidePrivileged = hasPermission(permissions, identityAdministrationPermissions.privilegedAccessDecide);
  const canReviewAccess = hasPermission(permissions, identityAdministrationPermissions.accessReviewManage);
  const canViewSessions = hasPermission(permissions, identityAdministrationPermissions.sessionView);
  const canRevokeSessions = hasPermission(permissions, identityAdministrationPermissions.sessionRevoke);
  const canViewMfa = hasPermission(permissions, identityAdministrationPermissions.mfaStatusView);
  const canResetMfa = hasPermission(permissions, identityAdministrationPermissions.mfaReset);
  const canRemoveMfa = hasPermission(permissions, identityAdministrationPermissions.mfaRemove);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.listUsers({ query: query.trim() || undefined, status: statusFilter || undefined });
      setUsers(result);
      if (selectedReference && !result.some((user) => user.userReference === selectedReference)) {
        setSelectedReference(undefined);
        setDetail(undefined);
      }
    } catch (caught) {
      setError(asUiError(caught));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [client, query, selectedReference, statusFilter]);

  const loadDetail = useCallback(async (userReference: string) => {
    setDetailLoading(true);
    setError(undefined);
    try {
      const [userDetail, roleCatalog, permissionsCatalog] = await Promise.all([
        client.getUser(userReference),
        client.listRoles().catch(() => []),
        client.listPermissions().catch(() => [])
      ]);
      setDetail(userDetail);
      setRoles(roleCatalog);
      setPermissionCatalog(permissionsCatalog);
      const [sessionResult, mfaResult, auditResult] = await Promise.all([
        canViewSessions ? client.listSessions(userReference).catch(() => []) : Promise.resolve([]),
        canViewMfa ? client.getMfaStatus(userReference).catch(() => undefined) : Promise.resolve(undefined),
        client.listAuditEvents(userReference).catch(() => [])
      ]);
      setSessions(sessionResult);
      setMfa(mfaResult);
      setAudit(auditResult);
    } catch (caught) {
      setDetail(undefined);
      setError(asUiError(caught));
    } finally {
      setDetailLoading(false);
    }
  }, [canViewMfa, canViewSessions, client]);

  useEffect(() => { void loadUsers(); }, []); // Initial server-authoritative inventory only.
  useEffect(() => { if (selectedReference) void loadDetail(selectedReference); }, [loadDetail, selectedReference]);

  async function runMutation(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      setNotice(success);
      await loadUsers();
      if (selectedReference) await loadDetail(selectedReference);
    } catch (caught) {
      setError(asUiError(caught));
    } finally {
      setBusy(false);
    }
  }

  const siteGroups = useMemo(() => {
    const fromSites = authorizedSites.filter((site) => site.siteGroupId).map((site) => ({ reference: site.siteGroupId!, name: site.siteGroupDisplayName ?? "Authorized Site Group" }));
    return authorizedSiteGroupReferences.map((reference, index) => fromSites.find((group) => group.reference === reference) ?? ({ reference, name: `Authorized Site Group ${index + 1}` }));
  }, [authorizedSiteGroupReferences, authorizedSites]);

  return (
    <section className="identityAdministration" aria-labelledby="identity-administration-title">
      <header className="pageTitle identityAdministrationHeader">
        <div>
          <p className="eyebrow">Account access</p>
          <h2 id="identity-administration-title">User Administration</h2>
          <p>Manage users, roles and permissions, Site access, sign-in security, and access reviews.</p>
        </div>
        <div className="pageActions">
          <button className="secondaryButton" type="button" disabled={loading || busy} onClick={() => void loadUsers()}>Refresh</button>
          {canManageUsers && <button type="button" onClick={() => setShowCreate(true)}>Add User</button>}
        </div>
      </header>

      <div className="governanceBoundary" role="note">
        <strong>Governed administration.</strong> Available actions reflect your current access. Central PMS verifies every change.
      </div>
      {notice && <div className="operationNotice" role="status">{notice}</div>}
      {error && <IdentityError error={error} onRetry={error.retryable ? () => void (selectedReference ? loadDetail(selectedReference) : loadUsers()) : undefined} />}

      {showCreate && <CreateUserPanel busy={busy} onCancel={() => setShowCreate(false)} onCreate={(body) => runMutation(() => client.createUser(body), "User added. Account setup remains governed by Central PMS.").then(() => setShowCreate(false))} />}

      <form className="identityFilters" onSubmit={(event) => { event.preventDefault(); void loadUsers(); }}>
        <label htmlFor="identity-user-search">Search users</label>
        <input ref={searchRef} id="identity-user-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username or display name" />
        <label htmlFor="identity-user-status">Status</label>
        <select id="identity-user-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option><option>ACTIVE</option><option>INVITED</option><option>SUSPENDED</option><option>INACTIVE</option><option>LOCKED</option><option>RETIRED</option>
        </select>
        <button type="submit" disabled={loading}>Apply</button>
        <button className="secondaryButton" type="button" onClick={() => { setQuery(""); setStatusFilter(""); window.setTimeout(() => void loadUsers()); searchRef.current?.focus(); }}>Reset</button>
      </form>

      <div className="identityWorkspace">
        <section className="identityUserList" aria-labelledby="identity-users-title">
          <div className="sectionHeading"><h3 id="identity-users-title">Users</h3><span>{users.length} returned</span></div>
          {loading ? <div className="inlineState" role="status">Loading users</div> : users.length === 0 ? <div className="inlineState">No users match the current search.</div> : (
            <ul>
              {users.map((user) => <li key={user.userReference}>
                <button className={selectedReference === user.userReference ? "selectedUser" : ""} type="button" onClick={() => { setSelectedReference(user.userReference); setView("profile"); }}>
                  <strong>{user.displayName}</strong><span>{user.username}</span><StatusLabel value={user.status} />
                </button>
              </li>)}
            </ul>
          )}
        </section>

        <section className="identityDetail" aria-label="Selected user administration">
          {!selectedReference ? <div className="inlineState"><h3>Select a user</h3><p>Choose a user to view or manage.</p></div> : detailLoading ? <div className="inlineState" role="status">Loading current user access</div> : detail ? (
            <>
              <header className="identityDetailHeader"><div><p className="eyebrow">Selected user</p><h3>{detail.user.displayName}</h3><p>{detail.user.username} · {displayUserType(detail.user.userType)}</p></div><StatusLabel value={detail.user.status} /></header>
              <div className="identityTabs" role="tablist" aria-label="User administration areas">
                {(["profile", "access", "security", "audit"] as DetailView[]).map((tab) => <button key={tab} role="tab" type="button" aria-selected={view === tab} className={view === tab ? "activeTab" : ""} onClick={() => setView(tab)}>{detailViewLabels[tab]}</button>)}
              </div>
              {view === "profile" && <ProfileView detail={detail} canManage={canManageUsers} busy={busy} onUpdate={(body) => void runMutation(() => client.updateUser(detail.user.userReference, body), "Profile updated.")} onLifecycle={(action, body) => void runMutation(() => client.changeLifecycle(detail.user.userReference, action, body), `Account status changed to ${humanize(action)}.`)} />}
              {view === "access" && <AccessView detail={detail} roles={roles} permissionCatalog={permissionCatalog} sites={authorizedSites} siteGroups={siteGroups} canManageRoles={canManageRoles} canManageScopes={canManageScopes} canDecidePrivileged={canDecidePrivileged} canReviewAccess={canReviewAccess} busy={busy} privilegedRequest={privilegedRequest} onPrivilegedRequest={setPrivilegedRequest} runMutation={runMutation} client={client} />}
              {view === "security" && <SecurityView detail={detail} mfa={mfa} sessions={sessions} canResetMfa={canResetMfa} canRemoveMfa={canRemoveMfa} canRevokeSessions={canRevokeSessions} busy={busy} runMutation={runMutation} client={client} />}
              {view === "audit" && <AuditView entries={audit} />}
            </>
          ) : <div className="inlineState">The requested user is unavailable within your authorized scope.</div>}
        </section>
      </div>
    </section>
  );
}

function CreateUserPanel({ busy, onCancel, onCreate }: { busy: boolean; onCancel: () => void; onCreate: (body: Record<string, unknown>) => Promise<void> }) {
  return <form className="administrationForm" aria-labelledby="create-user-title" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onCreate({ username: data.get("username"), displayName: data.get("displayName"), email: data.get("email") || null, maskedMobileNumber: data.get("mobile") || null, userType: data.get("userType"), effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }); }}>
    <div><h3 id="create-user-title">Add User</h3><p>No password is collected here. Account setup and invitation delivery are handled separately.</p></div>
    <label>Username<input name="username" required autoComplete="off" /></label><label>Display name<input name="displayName" required /></label><label>Email (optional)<input name="email" type="email" /></label><label>Masked mobile (optional)<input name="mobile" /></label><label>User type<select name="userType"><option value="HUMAN">User</option><option value="SERVICE_SUPPORT">Support Service</option></select></label><label>Access starts<input name="effectiveFrom" type="datetime-local" required defaultValue={toLocalInput(new Date())} /></label><label>Reason<input name="reasonCode" required /></label>
    <div className="formActions"><button type="submit" disabled={busy}>Add User</button><button className="secondaryButton" type="button" onClick={onCancel}>Cancel</button></div>
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

function AccessView({ detail, roles, permissionCatalog, sites, siteGroups, canManageRoles, canManageScopes, canDecidePrivileged, canReviewAccess, busy, privilegedRequest, onPrivilegedRequest, runMutation, client }: { detail: IdentityUserDetail; roles: IdentityRoleDefinition[]; permissionCatalog: IdentityPermissionDefinition[]; sites: ManagementPlatformSite[]; siteGroups: Array<{ reference: string; name: string }>; canManageRoles: boolean; canManageScopes: boolean; canDecidePrivileged: boolean; canReviewAccess: boolean; busy: boolean; privilegedRequest?: IdentityPrivilegedAccessRequest; onPrivilegedRequest: (value: IdentityPrivilegedAccessRequest) => void; runMutation: (action: () => Promise<unknown>, success: string) => Promise<void>; client: IdentityAdministrationClient }) {
  const user = detail.user;
  return <div className="identitySections">
    <section><h4>Roles &amp; Permissions</h4>{detail.roleAssignments.length === 0 ? <p>No roles are assigned.</p> : <div className="recordList">{detail.roleAssignments.map((assignment) => <article key={assignment.assignmentReference}><div><strong>{assignment.roleName}</strong><p>{assignment.roleCode} · {humanize(assignment.status)}</p></div>{canManageRoles && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing ${assignment.roleName} from ${user.displayName}`); if (reason) void runMutation(() => client.revokeRole(user.userReference, assignment.assignmentReference, { expectedRowVersion: assignment.rowVersion, reasonCode: reason }), "Role removed."); }}>Remove Role</button>}</article>)}</div>}</section>
    {canManageRoles && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const role = roles.find((candidate) => candidate.roleReference === data.get("roleReference")); if (!role) return; if (role.isPrivileged) { void runMutation(async () => { const value = await client.createPrivilegedAccessRequest({ targetUserReference: user.userReference, roleReference: role.roleReference, scopeType: null, siteReference: null, siteGroupReference: null, effectiveFrom: new Date().toISOString(), effectiveTo: null, expiresAt: null, reasonCode: data.get("reasonCode") }); onPrivilegedRequest(value); return value; }, "Elevated access requested. Approval does not activate access."); } else { void runMutation(() => client.assignRole(user.userReference, { roleReference: role.roleReference, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }), "Role assigned."); } }}><h4>Add Role</h4><label>Role<select name="roleReference" required><option value="">Select a role</option>{roles.filter((role) => role.status === "ACTIVE").map((role) => <option key={role.roleReference} value={role.roleReference}>{role.name}{role.isPrivileged ? " (requires elevated access approval)" : ""}</option>)}</select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Add Role or Request Access</button></form>}
    <section><h4>Site Access</h4><p className="warningText"><strong>Organization-wide access is not available.</strong> Access must be limited to an approved Site or Site Group.</p>{detail.scopeGrants.length === 0 ? <p>No Site access is assigned.</p> : <div className="recordList">{detail.scopeGrants.map((grant) => <article key={grant.grantReference}><div><strong>{humanize(grant.scopeType)}</strong><p>{safeScopeName(grant, sites, siteGroups)} · {humanize(grant.status)}</p></div>{canManageScopes && <button className="dangerTextButton" disabled={busy} onClick={() => { const reason = window.prompt(`Reason for removing this ${humanize(grant.scopeType)} access from ${user.displayName}`); if (reason) void runMutation(() => client.revokeScope(user.userReference, grant.assignmentReference, grant.grantReference, { expectedRowVersion: grant.rowVersion, reasonCode: reason }), "Site access removed."); }}>Remove Access</button>}</article>)}</div>}</section>
    {canManageScopes && detail.roleAssignments.length > 0 && <ScopeGrantForm detail={detail} sites={sites} siteGroups={siteGroups} busy={busy} onGrant={(assignment, body) => void runMutation(() => client.grantScope(user.userReference, assignment, body), "Site access added.")} />}
    <section><h4>Available Permissions</h4><p>{roles.length} roles and {permissionCatalog.length} permissions are available in the current catalog.</p><details><summary>View permission catalog</summary><ul className="catalogList">{permissionCatalog.map((permission) => <li key={permission.permissionReference}><strong>{permission.name}</strong><span>{permission.code} · {permission.domain} · {humanize(permission.status)}</span></li>)}</ul></details></section>
    {privilegedRequest && <section className="privilegedEvidence"><h4>Elevated Access</h4><StatusLabel value={privilegedRequest.status} /><p>Approval records the decision but does not activate access. Access becomes active only when Central PMS reports an active role.</p>{canDecidePrivileged && privilegedRequest.status === "REQUESTED" && <div className="formActions"><button disabled={busy} onClick={() => void runMutation(async () => { const value = await client.decidePrivilegedAccess(privilegedRequest.requestReference, { decision: "APPROVE", reasonCode: "GOVERNED_ADMIN_APPROVAL", expectedRowVersion: privilegedRequest.rowVersion }); onPrivilegedRequest(value); return value; }, "Elevated access approved, but access is not shown as active.")}>Approve Elevated Access</button><button className="dangerButton" disabled={busy} onClick={() => void runMutation(async () => { const value = await client.decidePrivilegedAccess(privilegedRequest.requestReference, { decision: "REJECT", reasonCode: "GOVERNED_ADMIN_REJECTION", expectedRowVersion: privilegedRequest.rowVersion }); onPrivilegedRequest(value); return value; }, "Elevated access rejected.")}>Reject</button></div>}</section>}
    {canReviewAccess && <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void runMutation(() => client.reviewAccess(user.userReference, { assignmentReferences: detail.roleAssignments.map((item) => item.assignmentReference), scopeGrantReferences: detail.scopeGrants.map((item) => item.grantReference), outcome: data.get("outcome"), reasonCode: data.get("reasonCode") }), "Access Review recorded; access was not silently renewed."); }}><h4>Access Review</h4><label>Outcome<select name="outcome"><option>CONFIRMED</option><option>REMEDIATION_REQUIRED</option><option>REVOKE</option></select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Record Review</button></form>}
  </div>;
}

function ScopeGrantForm({ detail, sites, siteGroups, busy, onGrant }: { detail: IdentityUserDetail; sites: ManagementPlatformSite[]; siteGroups: Array<{ reference: string; name: string }>; busy: boolean; onGrant: (assignment: string, body: Record<string, unknown>) => void }) {
  const [type, setType] = useState<"SITE" | "SITE_GROUP">("SITE");
  return <form className="compactForm" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const target = String(data.get("targetReference")); onGrant(String(data.get("assignmentReference")), { scopeType: type, siteReference: type === "SITE" ? target : null, siteGroupReference: type === "SITE_GROUP" ? target : null, effectiveFrom: new Date().toISOString(), effectiveTo: null, reasonCode: data.get("reasonCode"), idempotencyKey: crypto.randomUUID() }); }}><h4>Add Site Access</h4><label>Role<select name="assignmentReference" required>{detail.roleAssignments.map((assignment) => <option key={assignment.assignmentReference} value={assignment.assignmentReference}>{assignment.roleName}</option>)}</select></label><label>Access level<select value={type} onChange={(event) => setType(event.target.value as "SITE" | "SITE_GROUP")}><option value="SITE">Site</option><option value="SITE_GROUP">Site Group</option></select></label><label>{type === "SITE" ? "Site" : "Site Group"}<select name="targetReference" required>{(type === "SITE" ? sites.map((site) => ({ reference: site.siteId, name: site.displayName })) : siteGroups).map((target) => <option key={target.reference} value={target.reference}>{target.name}</option>)}</select></label><label>Reason<input name="reasonCode" required /></label><button disabled={busy}>Add Access</button></form>;
}

function SecurityView({ detail, mfa, sessions, canResetMfa, canRemoveMfa, canRevokeSessions, busy, runMutation, client }: { detail: IdentityUserDetail; mfa?: IdentityMfaStatus; sessions: IdentitySessionSummary[]; canResetMfa: boolean; canRemoveMfa: boolean; canRevokeSessions: boolean; busy: boolean; runMutation: (action: () => Promise<unknown>, success: string) => Promise<void>; client: IdentityAdministrationClient }) {
  const user = detail.user;
  return <div className="identitySections"><section><h4>Two-Factor Authentication</h4>{mfa ? <><dl className="factGrid"><Fact label="Elevated access requirement" value={mfa.requiredForPrivilegedManagementPlatform ? "Required for elevated Management Platform access" : "Not required for this user"} /><Fact label="Authenticator app" value={mfa.enrolled ? "Set up" : "Not set up"} /><Fact label="Status" value={humanize(mfa.status)} /><Fact label="Last used" value={formatDate(mfa.lastSuccessfullyUsedAt)} /></dl><div className="formActions">{canResetMfa && <button disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Reset the authenticator app for ${user.displayName}?`, () => void runMutation(() => client.changeMfa(user.userReference, "reset", { expectedRowVersion: mfa.rowVersion, reasonCode: "GOVERNED_MFA_RESET" }), "Authenticator app reset recorded."))}>Reset Authenticator App</button>}{canRemoveMfa && <button className="dangerButton" disabled={busy || mfa.rowVersion === null} onClick={() => confirmSecurityAction(`Remove the authenticator app for ${user.displayName}?`, () => void runMutation(() => client.changeMfa(user.userReference, "remove", { expectedRowVersion: mfa.rowVersion, reasonCode: "GOVERNED_MFA_REMOVE" }), "Authenticator app removed."))}>Remove Authenticator App</button>}</div></> : <p>Two-factor authentication details are unavailable or not permitted.</p>}<p className="privacyNote">Setup secrets, one-time codes, and recovery information are never displayed.</p></section>
  <section><h4>Active Sessions</h4>{sessions.length === 0 ? <p>No active sessions returned.</p> : <div className="recordList">{sessions.map((session, index) => <article key={session.sessionReference}><div><strong>{session.audience} session {index + 1}</strong><p>{humanize(session.status)} · Last seen {formatDate(session.lastSeenAt)} · Expires {formatDate(session.idleExpiresAt)}</p></div>{canRevokeSessions && session.status === "ACTIVE" && <button className="dangerTextButton" disabled={busy} onClick={() => confirmSecurityAction(`Sign out session ${index + 1} for ${user.displayName}?`, () => void runMutation(() => client.revokeSession(user.userReference, session.sessionReference, "GOVERNED_SESSION_REVOCATION"), "Session signed out."))}>Sign Out Session</button>}</article>)}</div>}{canRevokeSessions && sessions.length > 0 && <button className="dangerButton" disabled={busy} onClick={() => confirmSecurityAction(`Sign out all sessions for ${user.displayName}?`, () => void runMutation(() => client.revokeSession(user.userReference, null, "GOVERNED_REVOKE_ALL_SESSIONS"), "All sessions signed out for this user."))}>Sign Out All Sessions</button>}<p className="privacyNote">Session cookies, secrets, hashes, bearer tokens, and refresh tokens are never displayed.</p></section></div>;
}

function AuditView({ entries }: { entries: IdentityAuditEntry[] }) {
  return <section className="identitySections"><div><h4>Activity Log</h4>{entries.length === 0 ? <p>No activity was returned for this user.</p> : <div className="auditTable" role="table" aria-label="User activity log">{entries.map((entry) => <div role="row" key={entry.auditReference}><div role="cell"><strong>{humanize(entry.eventType)}</strong><span>{formatDate(entry.occurredAt)}</span></div><div role="cell"><StatusLabel value={entry.result} /><p>{entry.summary ?? humanize(entry.reasonCode ?? "No summary supplied")}</p>{entry.correlationReference && <small>Support reference: {entry.correlationReference}</small>}</div></div>)}</div>}</div></section>;
}

function IdentityError({ error, onRetry }: { error: ManagementPlatformUiError; onRetry?: () => void }) {
  const title = error.kind === "permission-denied" ? "Permission denied" : error.kind === "not-found" ? "User unavailable" : error.kind === "conflict" ? "Current information changed" : "User Administration unavailable";
  const message = error.kind === "conflict" ? "Reload the current state before deliberately retrying. No stale change was applied." : error.message;
  return <div className="identityError" role="alert"><strong>{title}</strong><p>{message}</p>{error.correlationId && <small>Support reference: {error.correlationId}</small>}{onRetry && <button className="secondaryButton" onClick={onRetry}>Retry</button>}</div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function StatusLabel({ value }: { value: string }) { return <span className={`statusLabel status-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{humanize(value)}</span>; }
function humanize(value: string) { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function displayUserType(value: string) { return value === "HUMAN" ? "User" : humanize(value); }
function formatDate(value: string | null) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); }
function toLocalInput(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function asUiError(value: unknown): ManagementPlatformUiError { return typeof value === "object" && value !== null && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "IDENTITY_ADMIN_SAFE_FAILURE", message: "The User Administration request could not be completed.", retryable: false, mutationUncertain: false }; }
function confirmSecurityAction(message: string, action: () => void) { if (window.confirm(message)) action(); }
function safeScopeName(grant: IdentityUserDetail["scopeGrants"][number], sites: ManagementPlatformSite[], groups: Array<{ reference: string; name: string }>) { if (grant.scopeType === "SITE") return sites.find((site) => site.siteId === grant.siteReference)?.displayName ?? "Authorized Site"; if (grant.scopeType === "SITE_GROUP") return groups.find((group) => group.reference === grant.siteGroupReference)?.name ?? "Authorized Site Group"; return "Organization-wide access unavailable"; }
