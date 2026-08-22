export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

export function hasAnyPermission(permissions: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => hasPermission(permissions, permission));
}

export function hasAllPermissions(permissions: readonly string[], required: readonly string[]): boolean {
  return required.every((permission) => hasPermission(permissions, permission));
}

export const managementPlatformOverviewPermission = "management-platform.overview.read";
export const managementDashboardPermission = "dashboard.view";
export const managementReportCatalogPermission = "reports.view";
export const managementPlatformIdentityRbacInventoryReadPermission = "management-platform.identity-rbac.inventory.read";
export const statutoryDiscountPolicyCoverageReadPermission = "statutory-discount-policy.view";
export const statutoryEvidenceGovernanceReadPermission = "statutory-discounts.evidence-governance.view";

export const identityAdministrationPresentationPermissions = [
  "user.view",
  "user.manage",
  "role.view",
  "permission.view",
  "identity.role-assignment.manage",
  "identity.scope-assignment.manage",
  "identity.privileged-access.decide",
  "identity.access-review.manage",
  "human-authentication.session.admin.view",
  "human-authentication.session.admin.revoke",
  "human-authentication.mfa.status.view",
  "human-authentication.mfa.reset",
  "human-authentication.mfa.remove"
] as const;

export const futureSalesInvoiceProfilePermissions = {
  read: "sales-invoice-profile.read",
  manage: "sales-invoice-profile.manage",
  approve: "sales-invoice-profile.approve"
} as const;
