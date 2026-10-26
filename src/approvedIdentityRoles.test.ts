import { describe, expect, it } from "vitest";
import { approvedIdentityRoleCodes, approvedRolePresentation } from "./approvedIdentityRoles";

describe("approved identity role presentation", () => {
  it("presents all thirteen Central PMS assignable canonical roles", () => {
    expect(approvedIdentityRoleCodes).toEqual([
      "SYSTEM_ADMINISTRATOR",
      "OPERATIONS_SUPERVISOR",
      "STATUTORY_DISCOUNT_PROCESSOR",
      "SITE_OPERATOR",
      "PARKING_ATTENDANT",
      "APT_CASHIER_OPERATOR",
      "APT_CASH_CUSTODY_MOVEMENT_OPERATOR",
      "APT_CASH_CUSTODY_SUPERVISOR",
      "APT_SITE_CUSTODIAN",
      "APT_CASH_COLLECTOR",
      "FINANCE_RECONCILIATION_ANALYST",
      "COMPLIANCE_POLICY_ADMINISTRATOR",
      "EXECUTIVE_MANAGEMENT"
    ]);
    expect(approvedRolePresentation("APT_CASH_CUSTODY_MOVEMENT_OPERATOR")?.label).toBe("APT Cash Custody Movement Operator");
    expect(approvedRolePresentation("APT_CASH_CUSTODY_SUPERVISOR")?.label).toBe("APT Cash Custody Supervisor");
    expect(approvedRolePresentation("APT_SITE_CUSTODIAN")?.label).toBe("APT Site Custodian");
    expect(approvedRolePresentation("APT_CASH_COLLECTOR")?.label).toBe("APT Cash Collector");
  });

  it("presents the statutory discount processor without defining authorization policy", () => {
    expect(approvedIdentityRoleCodes).toContain("STATUTORY_DISCOUNT_PROCESSOR");
    expect(approvedRolePresentation("STATUTORY_DISCOUNT_PROCESSOR")).toEqual({
      code: "STATUTORY_DISCOUNT_PROCESSOR",
      label: "Statutory Discount Processor",
      summary: "Reviews and approves or rejects statutory discount requests across all Sites."
    });
  });
});
