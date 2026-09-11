import { describe, expect, it } from "vitest";
import { shouldUseDevelopmentScenario } from "./runtimeMode";

describe("Management Platform runtime composition", () => {
  it("does not allow URL scenarios to activate in a normal development build", () => {
    expect(shouldUseDevelopmentScenario(true, "")).toBe(false);
    expect(shouldUseDevelopmentScenario(true, "?mpScenario=authenticated")).toBe(false);
    expect(shouldUseDevelopmentScenario(true, "?mpProfileScenario=manage")).toBe(false);
    expect(shouldUseDevelopmentScenario(true, "?mpIdentityScenario=populated&mpDashboardScenario=current")).toBe(false);
  });

  it("prohibits development principal composition in production", () => {
    expect(shouldUseDevelopmentScenario(false, "?mpScenario=authenticated&mpProfileScenario=manage")).toBe(false);
  });
});
