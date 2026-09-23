import { describe, expect, it } from "vitest";
import { approvedIdentityRoleCodes, approvedRolePresentation } from "./approvedIdentityRoles";

describe("approved identity role presentation", () => {
  it("presents the statutory discount processor without defining authorization policy", () => {
    expect(approvedIdentityRoleCodes).toContain("STATUTORY_DISCOUNT_PROCESSOR");
    expect(approvedRolePresentation("STATUTORY_DISCOUNT_PROCESSOR")).toEqual({
      code: "STATUTORY_DISCOUNT_PROCESSOR",
      label: "Statutory Discount Processor",
      summary: "Reviews and approves or rejects statutory discount requests across all Sites."
    });
  });
});
