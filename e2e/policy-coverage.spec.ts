import { expect, test, type Page, type Request } from "@playwright/test";

const route = "/management-platform/statutory-policy-coverage";
const apiPath = "/v1/ops/management-platform/statutory-discounts/policy-coverage";
const forbiddenMutationControls = /Create|Edit|Delete|Activate|Deactivate|Upload|Approve|Apply|Override|Recalculate|Publish|Import|Save|Submit/i;
const forbiddenText = [
  "stack trace",
  "SqlException",
  "connection string",
  "Authorization:",
  "X-ExitPass-Permissions",
  "X-ExitPass-Service-Identity-Id",
  "bearer token"
];

test.describe("Management Platform statutory policy coverage read-only workspace", () => {
  test("primary Site Group flow renders scope, entitlements, classifications, filters, and support reference", async ({ page }) => {
    await gotoCoverageScenario(page, "site-group-covered");

    await expect(page.getByRole("button", { name: /Statutory Policy Coverage Read-only/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Statutory Policy Coverage" })).toBeVisible();
    await expect(page.getByText("Central PMS authoritative read model")).toBeVisible();
    await expect(page.getByLabel("Scope type")).toHaveValue("SITE_GROUP");
    await expect(page.locator("#policy-coverage-site-group")).toHaveValue("71000000-0000-0000-0000-000000000900");
    await expect(page.locator("tbody").getByText("Senior Citizen").first()).toBeVisible();
    await expect(page.locator("tbody").getByText("PWD").first()).toBeVisible();
    await expect(page.locator("tbody").getByText("Active covered")).toBeVisible();
    await expect(page.locator("tbody").getByText("Future effective")).toBeVisible();
    await expect(page.locator("tbody").getByText("Expired", { exact: true })).toBeVisible();
    await expect(page.locator("tbody").getByText("Incomplete configuration")).toBeVisible();
    await expect(page.getByText("dev-policy-coverage-correlation")).toBeVisible();
    await expect(page.getByRole("button", { name: forbiddenMutationControls })).toHaveCount(0);

    await page.getByLabel("Entitlement type").selectOption("SENIOR_CITIZEN");
    await expect(page.getByLabel("Entitlement type")).toHaveValue("SENIOR_CITIZEN");
    await page.getByLabel("Entitlement type").selectOption("PWD");
    await expect(page.getByLabel("Entitlement type")).toHaveValue("PWD");
    await page.getByLabel("Scope type").selectOption("SITE");
    await expect(page.locator("#policy-coverage-site")).toHaveValue("71000000-0000-0000-0000-000000000101");
  });

  test("safe states cover no coverage, empty, denied, unavailable, malformed, and unsupported classification", async ({ page }) => {
    await gotoCoverageScenario(page, "no-coverage");
    await expect(page.getByText("No applicable policy").first()).toBeVisible();
    await expect(page.getByText("Entitlement not covered").first()).toBeVisible();

    await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=empty`);
    await expect(page.getByRole("status", { name: "Empty statutory policy coverage" })).toBeVisible();

    await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=scope-denied`);
    await expect(page.getByRole("alert", { name: "Statutory policy coverage access denied" })).toContainText("SCOPE_DENIED");

    await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=source-unavailable`);
    await expect(page.getByRole("alert", { name: "Statutory policy coverage unavailable" })).toContainText("Retryable: Yes");
    await expect(page.getByRole("button", { name: "Retry statutory policy coverage" })).toBeVisible();

    await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=malformed-response`);
    await expect(page.getByRole("alert", { name: "Statutory policy coverage malformed" })).toContainText("could not be read safely");

    await gotoCoverageScenario(page, "malformed-authoritative");
    await expect(page.getByText("Malformed authoritative record")).toBeVisible();

    await gotoCoverageScenario(page, "ambiguous-scope");
    await expect(page.getByRole("status", { name: "Unsupported authoritative classification" })).toContainText("fail-closed");
    await expect(page.getByText("Unsupported classification: AMBIGUOUS_SCOPE")).toBeVisible();
  });

  test("browser boundary uses one read-only relative API call without privileged headers or durable storage", async ({ page }) => {
    const apiRequests: Request[] = [];
    await page.route(`**${apiPath}**`, async (routeRequest) => {
      await routeRequest.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-Id": "e2e-policy-coverage" },
        json: coveragePayload()
      });
    });

    page.on("request", (request) => {
      expect(request.method()).not.toMatch(/POST|PUT|PATCH|DELETE/);
      if (request.url().includes(apiPath)) {
        apiRequests.push(request);
        const headerNames = Object.keys(request.headers()).map((header) => header.toLowerCase());
        expect(headerNames).not.toContain("authorization");
        expect(headerNames).not.toContain("x-exitpass-permissions");
        expect(headerNames).not.toContain("x-management-platform-permissions");
        expect(headerNames).not.toContain("x-exitpass-service-identity-id");
      }
    });

    await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=api-boundary`);
    await expect(page.getByRole("heading", { name: "Coverage rows" })).toBeVisible();
    expect(apiRequests.length).toBeGreaterThan(0);
    for (const request of apiRequests) {
      const url = new URL(request.url());
      expect(url.pathname).toBe(apiPath);
      expect(url.searchParams.get("scopeType")).toBe("SITE_GROUP");
      expect(url.searchParams.get("scopeId")).toBe("71000000-0000-0000-0000-000000000900");
      expect(request.method()).toBe("GET");
    }

    const storageText = await page.evaluate(() => JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage }
    }));
    expect(storageText).not.toMatch(/policy-coverage|statutory-discount-policy|ACTIVE_COVERED|SYNTHETIC_LOCAL_AUTHORITY/i);
  });

  test("responsive layout and keyboard navigation remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await gotoCoverageScenario(page, "mixed");
    await expect(page.getByRole("heading", { name: "Statutory Policy Coverage" })).toBeInViewport();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Sales Invoice Configuration Sales Invoice Setups/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Statutory Policy Coverage Read-only/i })).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByRole("heading", { name: "Coverage rows" })).toBeVisible();
  });
});

test.afterEach(async ({ page }) => {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  for (const token of forbiddenText) {
    expect(bodyText).not.toContain(token);
  }
});

async function gotoCoverageScenario(page: Page, scenario: string) {
  await page.goto(`${route}?mpScenario=authenticated&mpPolicyCoverageScenario=${scenario}`);
  await expect(page.getByRole("heading", { name: "Coverage rows" })).toBeVisible();
}

function coveragePayload() {
  return {
    requestedScopeType: "SITE_GROUP",
    requestedScopeReference: "71000000-0000-0000-0000-000000000900",
    resolvedScopeType: "SITE_GROUP",
    resolvedScopeReference: "71000000-0000-0000-0000-000000000900",
    scopeDisplayName: "Development Site Group",
    correlationId: "e2e-policy-coverage",
    evaluationTimestamp: "2026-08-01T00:00:00Z",
    coverageRows: [{
      siteReference: "71000000-0000-0000-0000-000000000101",
      siteDisplayName: "Development Site Alpha",
      entitlementType: "SENIOR_CITIZEN",
      coverageClassification: "ACTIVE_COVERED",
      policyStatusClassification: "ACTIVE",
      authoritativeCoverageAvailable: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      policyReference: "SC-POLICY-2026",
      ordinanceOrLegalAuthorityReference: "SYNTHETIC_LOCAL_AUTHORITY",
      jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
      policyVersionOrRevisionReference: "2026.1",
      lastAuthoritativeUpdateTimestamp: "2026-08-01T00:00:00Z",
      dataQualityClassification: "AUTHORITATIVE",
      reasonClassification: "ACTIVE_COVERED",
      sourceClassification: "E2E_FIXTURE"
    }]
  };
}
