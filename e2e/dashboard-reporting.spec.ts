import { expect, test, type Page } from "@playwright/test";

const dashboardRoute = "/management-platform/overview?mpScenario=authenticated&mpDashboardScenario=";

test.describe("Management Dashboard reporting foundation", () => {
  test("opens from existing navigation with explicit Site scope and catalog", async ({ page }) => {
    await page.goto(`${dashboardRoute}current&mpPaymentScenario=current`);

    await expect(page).toHaveTitle("Dashboard - ExitPass Management Platform");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByLabel("Reporting scope")).toHaveValue(/^SITE:/);
    await expect(page.getByText("Site operational status")).toBeVisible();
    await expect(page.getByText("Connector health")).toBeVisible();
    await expect(page.getByText("Vendor projection freshness")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Report catalog" })).toBeVisible();
    await expect(page.getByText("Payment and Reconciliation").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Payment and Reconciliation" })).toBeVisible();
    await assertNoOverflow(page);
  });

  test("uses explicit Site Group scope when no direct Site is authorized", async ({ page }) => {
    await page.goto("/management-platform/overview?mpScenario=no-sites&mpDashboardScenario=site-group");

    await expect(page.getByLabel("Reporting scope")).toHaveValue(/^SITE_GROUP:/);
    await expect(page.getByText(/Requesting explicit Site Group scope/)).toBeVisible();
    await expect(page.getByText(/Development Site Group \(Site Group\)/)).toBeVisible();
  });

  test("keeps partial and stale source classifications visibly distinct", async ({ page }) => {
    await page.goto(`${dashboardRoute}partial-connectors`);
    await expect(page.getByText("Availability: Partial data").first()).toBeVisible();
    await expect(page.getByText("Freshness: Mixed freshness").first()).toBeVisible();
    await expect(page.getByText("One connector target is not healthy.")).toBeVisible();

    await page.goto(`${dashboardRoute}stale-projection`);
    await expect(page.getByText("Freshness: Stale").first()).toBeVisible();
    await expect(page.getByText("Projection information is stale.")).toBeVisible();
    await expect(page.getByText(/Data as of:/).first()).toBeVisible();
  });

  test("does not show fabricated metrics for unavailable or not-configured sources", async ({ page }) => {
    await page.goto(`${dashboardRoute}unavailable-projection`);
    await expect(page.getByText("No authoritative metric values are available for this section.")).toHaveCount(2);
    await expect(page.locator('[data-metric-id="active-projections"]')).toHaveCount(0);

    await page.goto(`${dashboardRoute}not-configured`);
    await expect(page.getByText("Availability: Not applicable")).toBeVisible();
    await expect(page.getByText("No connector target is configured for this scope.")).toBeVisible();
    await expect(page.locator('[data-metric-id="connector-targets"]')).toHaveCount(0);
  });

  test("supports manual refresh and controlled denied, concealed, and unavailable states", async ({ page }) => {
    await page.goto(`${dashboardRoute}current`);
    await page.getByRole("button", { name: "Refresh operational dashboard" }).click();
    await expect(page.getByText("Active Sites")).toBeVisible();

    await page.goto(`${dashboardRoute}permission-denied`);
    await expect(page.getByRole("alert", { name: "Dashboard permission denied" })).toBeVisible();
    await page.goto(`${dashboardRoute}scope-denied`);
    await expect(page.getByRole("alert", { name: "Reporting scope unavailable" })).toContainText("not found or is not available");
    await page.goto(`${dashboardRoute}feature-disabled`);
    await expect(page.getByRole("alert", { name: "Dashboard unavailable" })).toBeVisible();
    await page.goto(`${dashboardRoute}retryable-failure`);
    await expect(page.getByRole("alert", { name: "Operational source unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
  });

  test("is keyboard operable and responsive at desktop, tablet, and mobile widths", async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${dashboardRoute}current`);
      await page.getByLabel("Reporting scope").focus();
      await expect(page.getByLabel("Reporting scope")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Refresh operational dashboard" })).toBeFocused();
      await assertNoOverflow(page);
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeInViewport();
      if (viewport.width === 390) {
        await page.goto(`${dashboardRoute}unavailable-projection`);
        await expect(page.getByText("VENDOR_PROJECTION_SOURCE_UNAVAILABLE").first()).toBeVisible();
        await assertNoOverflow(page);
      }
    }
  });

  test("does not persist reporting payloads or browser-owned authority", async ({ page }) => {
    await page.goto(`${dashboardRoute}current`);
    await expect(page.getByText("Active Sites")).toBeVisible();
    const storage = await page.evaluate(async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      indexedDb: await indexedDB.databases()
    }));
    expect(JSON.stringify(storage)).not.toMatch(/dashboard\.view|reports\.view|active-projections|scopeReference|correlationId/i);
  });

  test("preserves existing User Administration navigation", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=populated");
    await expect(page.getByRole("heading", { name: "User Administration" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
  });
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
