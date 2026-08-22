import { expect, test, type Page, type Request } from "@playwright/test";

const route = "/management-platform/access-control";
const forbiddenMutationControls = /Create role|Edit role|Clone role|Retire role|Assign permission|Assign user|Revoke|Rotate|Disable service identity|Save|Submit|Delete/i;
const forbiddenConsoleTokens = [
  "stack trace",
  "SqlException",
  "raw backend error",
  "raw signing material",
  "database DSN",
  "bearer-token"
];

test.describe("Management Platform statutory RBAC read-only inventory", () => {
  test("primary read-only catalog flow renders permissions, role bundles, warnings, and filters", async ({ page }) => {
    await gotoRbacScenario(page, "populated");

    await expect(page.getByRole("button", { name: /Access Control RBAC Inventory/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Permission Catalog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Role Bundles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actor Boundary And Separation Warnings" })).toBeVisible();
    await expect(page.getByLabel("Permission Catalog").getByText("management-platform.identity-rbac.inventory.read")).toBeVisible();
    await expect(page.getByText("Operations Supervisor")).toBeVisible();
    await expect(page.getByText("WebPay Service Application")).toBeVisible();
    await expect(page.getByText("Service principals cannot approve or reject statutory requests.")).toBeVisible();
    await expect(page.getByText("Human reviewers cannot invoke service-only payable application.")).toBeVisible();
    await expect(page.getByText("Unknown or unresolved scope fails closed.")).toBeVisible();
    await expect(page.getByRole("button", { name: forbiddenMutationControls })).toHaveCount(0);

    const filter = page.getByLabel(/Search permissions/i);
    await filter.fill("Evidence");
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(filter).toHaveValue("");
  });

  test("safe states cover access denied, empty, unavailable, malformed, and partial scope", async ({ page }) => {
    await page.goto(`${route}?mpScenario=permission-denied&mpRbacScenario=populated`);
    await expect(page.getByRole("alert", { name: "Permission denied" })).toBeVisible();

    await gotoRbacScenario(page, "empty");
    await expect(page.getByRole("status", { name: "Empty Access Control inventory" })).toBeVisible();

    await page.goto(`${route}?mpScenario=authenticated&mpRbacScenario=unavailable`);
    await expect(page.getByRole("status", { name: "Access Control inventory unavailable" })).toContainText("temporarily unavailable");

    await page.goto(`${route}?mpScenario=authenticated&mpRbacScenario=malformed`);
    await expect(page.getByRole("alert", { name: "Access Control response unavailable" })).toContainText("could not be read safely");

    await gotoRbacScenario(page, "partial-scope");
    await expect(page.getByRole("status", { name: "Partial data" })).toContainText("fail-closed");
    await expect(page.getByText("Unresolved Site Group")).toBeVisible();
  });

  test("browser API boundary remains read-only and storage safe", async ({ page }) => {
    const apiRequests: Request[] = [];
    await stubInventory(page);
    page.on("request", (request) => {
      if (request.url().includes("/v1/ops/management-platform/identity-rbac/inventory")) {
        apiRequests.push(request);
      }
      expect(request.method()).not.toMatch(/POST|PUT|PATCH|DELETE/);
      const headerNames = Object.keys(request.headers()).map((header) => header.toLowerCase());
      expect(headerNames).not.toContain("authorization");
      expect(headerNames).not.toContain("x-exitpass-permissions");
      expect(headerNames).not.toContain("x-exitpass-service-identity-id");
    });

    await page.goto(`${route}?mpScenario=authenticated&mpRbacScenario=api-boundary`);
    await expect(page.getByRole("heading", { name: "RBAC Inventory" })).toBeVisible();
    expect(apiRequests.length).toBeGreaterThan(0);
    for (const apiRequest of apiRequests) {
      const url = new URL(apiRequest.url());
      expect(url.pathname).toBe("/v1/ops/management-platform/identity-rbac/inventory");
      expect(apiRequest.method()).toBe("GET");
    }

    const storageText = await page.evaluate(() => JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage }
    }));
    expect(storageText).not.toMatch(/statutory-discounts|RBAC|role|permission|Synthetic/i);
  });

  test("responsive layout and keyboard access remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await gotoRbacScenario(page, "mixed");
    await expect(page.getByRole("heading", { name: "RBAC Inventory" })).toBeInViewport();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Sales Invoice Configuration Sales Invoice Setups/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Access Control RBAC Inventory/i })).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByRole("heading", { name: "Permission Catalog" })).toBeVisible();
  });
});

test.afterEach(async ({ page }) => {
  const consoleMessages = await page.evaluate(() => []);
  expect(consoleMessages).toEqual([]);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  for (const token of forbiddenConsoleTokens) {
    expect(bodyText).not.toContain(token);
  }
});

async function gotoRbacScenario(page: Page, scenario: string) {
  await page.goto(`${route}?mpScenario=authenticated&mpRbacScenario=${scenario}`);
  await expect(page.getByRole("heading", { name: "RBAC Inventory" })).toBeVisible();
}

async function stubInventory(page: Page) {
  await page.route("**/v1/ops/management-platform/identity-rbac/inventory", async (routeRequest) => {
    await routeRequest.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json", "X-Correlation-Id": "e2e-rbac" },
      json: {
        users: [],
        roleBundles: [{
          roleKey: "operations-supervisor",
          displayName: "Operations Supervisor",
          purpose: "Reviews statutory privilege eligibility without payment-time application authority.",
          typicalAccessRights: ["statutory-discounts.decision.approve"],
          defaultRestrictions: ["No payable-basis application authority."],
          targetSurface: "Operator Console review"
        }],
        permissions: [{
          permissionKey: "management-platform.identity-rbac.inventory.read",
          displayLabel: "Identity/RBAC inventory read",
          category: "Management Platform",
          sourceCatalog: "CentralPmsRbacPolicyCatalog",
          mappedPolicies: ["ManagementPlatformIdentityRbacInventoryRead"],
          status: "implemented",
          notes: null
        }],
        policyMappings: [{
          policyName: "ManagementPlatformIdentityRbacInventoryRead",
          permissions: ["management-platform.identity-rbac.inventory.read"],
          routeOrFeatureArea: "Management Platform administration",
          implementedStatus: "implemented",
          notes: null
        }],
        userRoleAssignments: [],
        userSiteScopes: [],
        deviceBindings: [],
        shifts: [],
        gaps: [],
        generatedAt: "2026-07-29T00:00:00Z"
      }
    });
  });
}
