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
export const managementPlatformIdentityRbacInventoryReadPermission = "management-platform.identity-rbac.inventory.read";
export const statutoryDiscountPolicyCoverageReadPermission = "statutory-discount-policy.view";

export const futureSalesInvoiceProfilePermissions = {
  read: "sales-invoice-profile.read",
  manage: "sales-invoice-profile.manage",
  approve: "sales-invoice-profile.approve"
} as const;
