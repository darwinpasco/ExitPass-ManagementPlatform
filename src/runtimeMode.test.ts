import { describe, expect, it } from "vitest";
import { shouldUseDevelopmentScenario } from "./runtimeMode";

describe("Management Platform runtime composition", () => {
  it("requires an explicit development scenario in a development build", () => {
    expect(shouldUseDevelopmentScenario(true, "")).toBe(false);
    expect(shouldUseDevelopmentScenario(true, "?mpScenario=authenticated")).toBe(true);
    expect(shouldUseDevelopmentScenario(true, "?mpProfileScenario=manage")).toBe(true);
  });

  it("prohibits development principal composition in production", () => {
    expect(shouldUseDevelopmentScenario(false, "?mpScenario=authenticated&mpProfileScenario=manage")).toBe(false);
  });
});
