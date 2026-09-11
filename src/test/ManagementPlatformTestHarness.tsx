import { App } from "../App";
import { HumanAuthenticationShell } from "../HumanAuthenticationShell";

/**
 * Explicit isolated browser-test entry point. Normal development and production
 * startup never render this component, even when mp*Scenario query parameters exist.
 */
export function ManagementPlatformTestHarness() {
  // Authentication E2E tests deliberately exercise the real session shell with
  // intercepted same-origin APIs. Scenario data is available only when a test
  // URL explicitly selects it inside this separately gated test build.
  if (!new URLSearchParams(window.location.search).has("mpScenario")) {
    return <HumanAuthenticationShell />;
  }

  return <App
    developmentScenariosEnabled
    profileScenariosEnabled
    rbacScenariosEnabled
    policyCoverageScenariosEnabled
    evidenceGovernanceScenariosEnabled
    identityAdministrationScenariosEnabled
    dashboardScenariosEnabled
    paymentReconciliationScenariosEnabled
    fiscalExceptionScenariosEnabled
  />;
}
