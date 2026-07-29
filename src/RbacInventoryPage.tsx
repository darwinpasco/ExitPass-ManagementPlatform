import { useEffect, useMemo, useState } from "react";
import {
  groupPermissionsByDomain,
  inventoryHasPartialData,
  inventoryHasTargetOnly,
  permissionAccessClassification,
  permissionActorClass,
  permissionScopePosture,
  scopeSummary,
  statusLabel,
  toSafeInventoryError,
  type RbacInventoryClient,
  type RbacInventoryResponse,
  type RbacInventoryScenarioName,
  type RbacPermission
} from "./rbacInventory";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";

interface RbacInventoryPageProps {
  currentSite?: ManagementPlatformSite;
  client: RbacInventoryClient;
  developmentScenarioName?: RbacInventoryScenarioName;
}

type LoadState =
  | { loading: true; value?: undefined; error?: undefined }
  | { loading: false; value: RbacInventoryResponse; error?: undefined }
  | { loading: false; value?: undefined; error: ManagementPlatformUiError };

export function RbacInventoryPage({ currentSite, client, developmentScenarioName }: RbacInventoryPageProps) {
  const [state, setState] = useState<LoadState>({ loading: true });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    client.getInventory(controller.signal)
      .then((inventory) => setState({ loading: false, value: inventory }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, error: toSafeInventoryError(error) });
        }
      });

    return () => controller.abort();
  }, [client]);

  const filteredInventory = useMemo(() => {
    if (!state.value || !filter.trim()) {
      return state.value;
    }

    const normalizedFilter = filter.trim().toLowerCase();
    return {
      ...state.value,
      permissions: state.value.permissions.filter((permission) => permissionMatches(permission, normalizedFilter)),
      roleBundles: state.value.roleBundles.filter((role) =>
        [role.roleKey, role.displayName, role.purpose, role.targetSurface, ...role.typicalAccessRights].some((value) => value.toLowerCase().includes(normalizedFilter))),
      policyMappings: state.value.policyMappings.filter((mapping) =>
        [mapping.policyName, mapping.routeOrFeatureArea, mapping.implementedStatus, ...(mapping.permissions ?? [])].some((value) => value.toLowerCase().includes(normalizedFilter)))
    };
  }, [filter, state.value]);

  if (state.loading) {
    return <StateBlock title="Loading Access Control inventory" message="Loading read-only RBAC inventory from Central PMS." />;
  }

  if (state.error) {
    return <InventoryError error={state.error} />;
  }

  const inventory = filteredInventory ?? state.value;
  const emptyInventory = inventory.permissions.length === 0 && inventory.roleBundles.length === 0 && inventory.policyMappings.length === 0;
  const partialData = inventoryHasPartialData(inventory);
  const targetOnly = inventoryHasTargetOnly(inventory);

  return (
    <section className="panel rbacPage" aria-labelledby="rbac-title">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">Access Control</p>
          <h2 id="rbac-title">RBAC Inventory</h2>
        </div>
        <span className="statusPill">Read-only</span>
      </div>

      {developmentScenarioName && (
        <div className="developmentScenario compact" role="status" aria-label="Development RBAC inventory scenario">
          Development RBAC inventory scenario: <strong>{developmentScenarioName}</strong>. This fixture is non-authoritative.
        </div>
      )}

      <section className="rbacNotice" aria-labelledby="rbac-readonly-title">
        <h3 id="rbac-readonly-title">Read-only Central PMS inventory</h3>
        <p>Backend source: Central PMS GET /v1/ops/management-platform/identity-rbac/inventory.</p>
        <p>Inventory timestamp: {formatDateTime(state.value.generatedAt)}.</p>
        <p>Changes must be performed through future governed administration workflows. This page does not create roles, edit roles, assign permissions, assign users, change Site scope, rotate service identities, or update separation-of-duties configuration.</p>
      </section>

      <div className="rbacSummaryGrid" aria-label="Access Control posture summary">
        <SummaryCard title="Scope posture" value={scopeSummary(state.value, currentSite)} />
        <SummaryCard title="Canonical persistence" value="PRESENT_BUT_INCOMPLETE. Durable scoped grants and separation-of-duties writes remain backend-limited." />
        <SummaryCard title="Effective capability" value="Unavailable from this payload. The browser does not calculate authoritative grants from local permission arrays, role assumptions, or selected Site context." />
      </div>

      {!currentSite && <StateBlock title="No current Site context" message="No browser-selected Site is active. This is not an authorization grant; server-side scope remains authoritative and unresolved scope fails closed." tone="warning" />}
      {partialData && <StateBlock title="Partial data" message="Central PMS returned known gaps or unresolved scope. Treat missing durable scope as fail-closed." tone="warning" />}
      {targetOnly && <StateBlock title="Target-only inventory present" message="Target-only permissions are not production-ready and must not be treated as enforced capabilities." tone="warning" />}

      <WarningsPanel />

      <section className="subPanel" aria-labelledby="rbac-filter-title">
        <div className="sectionHeader">
          <h3 id="rbac-filter-title">Filter inventory</h3>
          <button className="secondaryButton" type="button" onClick={() => setFilter("")}>Reset filter</button>
        </div>
        <label className="formField" htmlFor="rbac-filter">
          <span>Search permissions, domains, actor classes, status, role bundles, or scope posture</span>
          <input id="rbac-filter" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      </section>

      {emptyInventory ? (
        <StateBlock title="Empty Access Control inventory" message="Central PMS returned no permissions, role bundles, or policy mappings for this read-only inventory." />
      ) : (
        <>
          <PermissionCatalog permissions={inventory.permissions} />
          <RoleBundles inventory={inventory} />
          <PolicyMappings inventory={inventory} />
          <ScopePosture inventory={state.value} currentSite={currentSite} />
          <GapList gaps={state.value.gaps} />
        </>
      )}
    </section>
  );
}

function PermissionCatalog({ permissions }: { permissions: RbacPermission[] }) {
  const groups = groupPermissionsByDomain(permissions);
  return (
    <section className="subPanel" aria-labelledby="permission-catalog-title">
      <div className="sectionHeader">
        <h3 id="permission-catalog-title">Permission Catalog</h3>
        <span className="countBadge">{permissions.length} permissions</span>
      </div>
      {groups.map((group) => (
        <section className="rbacDomainGroup" key={group.domain} aria-labelledby={`domain-${slug(group.domain)}`}>
          <h4 id={`domain-${slug(group.domain)}`}>{group.domain}</h4>
          <div className="tableScroller">
            <table className="dataTable rbacTable">
              <thead>
                <tr>
                  <th>Permission identifier</th>
                  <th>Description</th>
                  <th>Actor class</th>
                  <th>Implementation status</th>
                  <th>Scope posture</th>
                  <th>Classification</th>
                  <th>Limitations</th>
                </tr>
              </thead>
              <tbody>
                {group.permissions.map((permission) => (
                  <tr key={permission.permissionKey}>
                    <td><code>{permission.permissionKey}</code></td>
                    <td>{permission.displayLabel}</td>
                    <td>{permissionActorClass(permission)}</td>
                    <td>{statusLabel(permission.status)}</td>
                    <td>{permissionScopePosture(permission)}</td>
                    <td>{permissionAccessClassification(permission)}</td>
                    <td>{permission.notes ?? (permission.mappedPolicies.length > 0 ? `Mapped policies: ${permission.mappedPolicies.join(", ")}` : "No mapped policy supplied.")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}

function RoleBundles({ inventory }: { inventory: RbacInventoryResponse }) {
  return (
    <section className="subPanel" aria-labelledby="role-bundles-title">
      <div className="sectionHeader">
        <h3 id="role-bundles-title">Role Bundles</h3>
        <span className="countBadge">{inventory.roleBundles.length} bundles</span>
      </div>
      <div className="rbacCardGrid">
        {inventory.roleBundles.map((role) => {
          const rolePermissions = role.typicalAccessRights.map((permissionKey) => inventory.permissions.find((permission) => permission.permissionKey === permissionKey));
          const statuses = rolePermissions.map((permission) => permission?.status ?? "target-only");
          const actorClasses = Array.from(new Set(rolePermissions.filter(Boolean).map((permission) => permissionActorClass(permission as RbacPermission))));
          const scopePostures = Array.from(new Set(rolePermissions.filter(Boolean).map((permission) => permissionScopePosture(permission as RbacPermission))));
          return (
            <article className="rbacCard" key={role.roleKey}>
              <h4>{role.displayName}</h4>
              <p><code>{role.roleKey}</code></p>
              <p>{role.purpose}</p>
              <dl>
                <div><dt>Actor class</dt><dd>{actorClasses.join(", ") || "Unresolved"}</dd></div>
                <div><dt>Status</dt><dd>{Array.from(new Set(statuses.map(statusLabel))).join(", ") || "Target-only"}</dd></div>
                <div><dt>Scope posture</dt><dd>{scopePostures.join(", ") || "Unresolved - fails closed"}</dd></div>
                <div><dt>Target surface</dt><dd>{role.targetSurface}</dd></div>
              </dl>
              <h5>Permissions</h5>
              <ul>
                {role.typicalAccessRights.map((permission) => <li key={permission}><code>{permission}</code></li>)}
              </ul>
              <h5>Warnings</h5>
              <ul>
                {role.defaultRestrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PolicyMappings({ inventory }: { inventory: RbacInventoryResponse }) {
  return (
    <section className="subPanel" aria-labelledby="policy-mappings-title">
      <div className="sectionHeader">
        <h3 id="policy-mappings-title">Named Policies And Capabilities</h3>
        <span className="countBadge">{inventory.policyMappings.length} mappings</span>
      </div>
      <div className="tableScroller">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Policy</th>
              <th>Feature area</th>
              <th>Status</th>
              <th>Permissions</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {inventory.policyMappings.map((mapping) => (
              <tr key={mapping.policyName}>
                <td>{mapping.policyName}</td>
                <td>{mapping.routeOrFeatureArea}</td>
                <td>{statusLabel(mapping.implementedStatus)}</td>
                <td>{mapping.permissions.map((permission) => <code key={permission}>{permission} </code>)}</td>
                <td>{mapping.notes ?? "No additional limitations supplied."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScopePosture({ inventory, currentSite }: { inventory: RbacInventoryResponse; currentSite?: ManagementPlatformSite }) {
  return (
    <section className="subPanel" aria-labelledby="scope-posture-title">
      <div className="sectionHeader">
        <h3 id="scope-posture-title">Site And Site Group Scope Posture</h3>
        <span className="readOnlyBadge">Server-owned</span>
      </div>
      <p>{scopeSummary(inventory, currentSite)}</p>
      <p>Browser-selected Site is context only and is not an authorization grant. Missing durable scope support remains a backend limitation. Unknown or unresolved scope fails closed.</p>
      {inventory.userSiteScopes.length > 0 && (
        <div className="tableScroller">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Site Group</th>
                <th>Site</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.userSiteScopes.map((scope, index) => (
                <tr key={`${scope.userId}-${index}`}>
                  <td>{scope.siteGroupName || "Unresolved Site Group"}</td>
                  <td>{scope.siteName || "Unresolved Site"}</td>
                  <td>{scope.source}</td>
                  <td>{scope.status || "Unresolved - fails closed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GapList({ gaps }: { gaps: RbacInventoryResponse["gaps"] }) {
  return (
    <section className="subPanel" aria-labelledby="backend-gaps-title">
      <div className="sectionHeader">
        <h3 id="backend-gaps-title">Backend Gaps</h3>
        <span className="countBadge">{gaps.length} gaps</span>
      </div>
      {gaps.length === 0 ? (
        <p>No backend gaps were supplied in the read-only inventory.</p>
      ) : (
        <ul className="messageList">
          {gaps.map((gap) => <li key={gap.gapKey}><strong>{gap.severity}:</strong> {gap.summary}</li>)}
        </ul>
      )}
    </section>
  );
}

function WarningsPanel() {
  const warnings = [
    "Service principals cannot approve or reject statutory requests.",
    "Human reviewers cannot invoke service-only payable application.",
    "Queue access does not imply evidence access.",
    "Policy administration does not imply review authority.",
    "Approval and rejection are independently assignable.",
    "Self-review prohibition and separation-of-duties writes remain backend-owned.",
    "Payment-time application is service-only and must be revalidated by Central PMS."
  ];

  return (
    <section className="subPanel" aria-labelledby="actor-warnings-title">
      <div className="sectionHeader">
        <h3 id="actor-warnings-title">Actor Boundary And Separation Warnings</h3>
        <span className="readOnlyBadge">No grants calculated</span>
      </div>
      <ul className="messageList">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
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

function InventoryError({ error }: { error: ManagementPlatformUiError }) {
  const title = error.kind === "permission-denied"
    ? "Access Control permission denied"
    : error.kind === "authentication-required"
      ? "Access Control session unavailable"
      : error.kind === "malformed-response"
        ? "Access Control response unavailable"
        : "Access Control inventory unavailable";

  return (
    <StateBlock
      title={title}
      message={`${error.message}${error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}`}
      tone={error.kind === "permission-denied" || error.kind === "malformed-response" ? "danger" : "warning"}
    />
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

function permissionMatches(permission: RbacPermission, normalizedFilter: string): boolean {
  return [
    permission.permissionKey,
    permission.displayLabel,
    permission.category,
    permission.sourceCatalog,
    permission.status,
    permission.notes ?? "",
    permissionActorClass(permission),
    permissionScopePosture(permission),
    permissionAccessClassification(permission),
    ...permission.mappedPolicies
  ].some((value) => value.toLowerCase().includes(normalizedFilter));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Timestamp unavailable";
  }

  return date.toLocaleString();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
