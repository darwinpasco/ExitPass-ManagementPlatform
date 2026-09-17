export const approvedIdentityRoleCodes = [
  "SYSTEM_ADMINISTRATOR",
  "OPERATIONS_SUPERVISOR",
  "SITE_OPERATOR",
  "PARKING_ATTENDANT",
  "APT_CASHIER_OPERATOR",
  "FINANCE_RECONCILIATION_ANALYST",
  "COMPLIANCE_POLICY_ADMINISTRATOR",
  "EXECUTIVE_MANAGEMENT"
] as const;

export type ApprovedIdentityRoleCode = typeof approvedIdentityRoleCodes[number];
export type IdentityApplication = "MANAGEMENT_PLATFORM" | "OPERATOR_CONSOLE" | "NATIVE_PARKING_APP" | "APT";
export type AssignableScopeType = "SITE" | "SITE_GROUP" | "GLOBAL";

/** Presentation copy only. Central PMS supplies role availability, applicationAccess,
 * scopePolicy, permission behavior, and all role/scope authorization decisions. */
export interface ApprovedIdentityRolePresentation {
  code: ApprovedIdentityRoleCode;
  label: string;
  summary: string;
}

export const approvedIdentityRoles: readonly ApprovedIdentityRolePresentation[] = [
  { code: "SYSTEM_ADMINISTRATOR", label: "System Administrator", summary: "Identity administration. This label does not grant operational, cashier, statutory-discount approval, or business-workflow authority." },
  { code: "OPERATIONS_SUPERVISOR", label: "Operations Supervisor", summary: "Operations supervision. Central PMS supplies application and scope eligibility." },
  { code: "SITE_OPERATOR", label: "Site Operator", summary: "Site operations role." },
  { code: "PARKING_ATTENDANT", label: "Parking Attendant", summary: "Parking attendant role." },
  { code: "APT_CASHIER_OPERATOR", label: "APT / Cashier Operator", summary: "APT cashier role." },
  { code: "FINANCE_RECONCILIATION_ANALYST", label: "Finance / Reconciliation Analyst", summary: "Finance and reconciliation role." },
  { code: "COMPLIANCE_POLICY_ADMINISTRATOR", label: "Compliance / Policy Administrator", summary: "Compliance and policy administration role." },
  { code: "EXECUTIVE_MANAGEMENT", label: "Executive / Management", summary: "Executive and management role." }
] as const;

const presentations = new Map(approvedIdentityRoles.map((role) => [role.code, role]));

export function approvedRolePresentation(code: string): ApprovedIdentityRolePresentation | undefined {
  return presentations.get(code as ApprovedIdentityRoleCode);
}

/** Compatibility guard for presentation support. It does not authorize assignment. */
export function hasApprovedRolePresentation(code: string): code is ApprovedIdentityRoleCode {
  return presentations.has(code as ApprovedIdentityRoleCode);
}

export function applicationLabel(value: IdentityApplication): string {
  if (value === "MANAGEMENT_PLATFORM") return "Management Platform";
  if (value === "OPERATOR_CONSOLE") return "Operator Console";
  if (value === "NATIVE_PARKING_APP") return "Native Parking App";
  return "APT";
}
