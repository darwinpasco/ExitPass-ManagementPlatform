import { expect, test, type Page } from "@playwright/test";

const reportRoute = "/management-platform/reports/payment-reconciliation?mpScenario=authenticated&mpPaymentScenario=";

test.describe("Payment and Reconciliation reporting", () => {
  test("navigates to a currency-separated SITE report with internal findings", async ({ page }) => {
    await page.goto(`${reportRoute}current&mpIdentityScenario=populated`);
    await expect(page).toHaveTitle("Payment and Reconciliation - ExitPass Management Platform");
    await expect(page.getByRole("heading", { name: "Payment and Reconciliation" })).toBeVisible();
    await expect(page.getByLabel("Reporting scope")).toHaveValue(/^SITE:/);
    await expect(page.getByRole("heading", { name: "PHP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "USD" })).toBeVisible();
    await expect(page.getByText("Confirmed payment amount").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Amount mismatch" })).toBeVisible();
    await expect(page.getByText(/Currencies are never combined/)).toBeVisible();
    await expect(page.getByText(/does not prove settlement/).first()).toBeVisible();
    await assertNoOverflow(page);
  });

  test("uses explicit Site Group scope and valid half-open UTC controls", async ({ page }) => {
    await page.goto("/management-platform/reports/payment-reconciliation?mpScenario=no-sites&mpDashboardScenario=site-group&mpPaymentScenario=site-group");
    await expect(page.getByLabel("Reporting scope")).toHaveValue(/^SITE_GROUP:/);
    await expect(page.getByText(/end excluded/)).toBeVisible();
    await page.getByLabel("Period start (UTC)").fill("2026-08-20T00:00");
    await page.getByLabel("Period end (UTC)").fill("2026-08-21T00:00");
    await page.getByRole("button", { name: "Refresh report" }).click();
    await expect(page.getByText(/Aug 20, 2026/)).toBeVisible();
    await expect(page.locator('option[value^="GLOBAL"]')).toHaveCount(0);
  });

  test("distinguishes partial, unavailable, disabled, and no-activity states", async ({ page }) => {
    await page.goto(`${reportRoute}partial`);
    await expect(page.getByText("Availability: Partial")).toBeVisible();
    await expect(page.getByText(/expected source dimensions are unavailable/)).toBeVisible();
    await expect(page.getByText(/^No internal mismatches were detected/)).toHaveCount(0);

    await page.goto(`${reportRoute}no-activity`);
    await expect(page.getByRole("status", { name: "No payment activity" })).toBeVisible();

    await page.goto(`${reportRoute}unavailable`);
    await expect(page.getByRole("status", { name: "Report unavailable" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PHP" })).toHaveCount(0);

    await page.goto(`${reportRoute}feature-disabled`);
    await expect(page.getByRole("alert", { name: "Report disabled" })).toBeVisible();
  });

  test("handles denied, concealed, malformed, and retryable failures safely", async ({ page }) => {
    await page.goto(`${reportRoute}permission-denied`);
    await expect(page.getByRole("alert", { name: "Permission denied" })).toBeVisible();
    await page.goto(`${reportRoute}scope-denied`);
    await expect(page.getByRole("alert", { name: "Reporting scope unavailable" })).toBeVisible();
    await page.goto(`${reportRoute}malformed`);
    await expect(page.getByRole("alert", { name: "Report could not be read" })).toBeVisible();
    await page.goto(`${reportRoute}retryable-failure`);
    await expect(page.getByRole("button", { name: "Retry report" })).toBeVisible();
  });

  test("is keyboard operable without horizontal overflow at desktop, tablet, and mobile widths", async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${reportRoute}current`);
      await page.getByLabel("Reporting scope").focus();
      await expect(page.getByLabel("Reporting scope")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Period start (UTC)")).toBeFocused();
      await assertNoOverflow(page);
      await expect(page.getByRole("heading", { name: "Payment and Reconciliation" })).toBeInViewport();
    }
  });

  test("does not persist report or authority data and preserves existing navigation", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(`${reportRoute}current&mpIdentityScenario=populated`);
    await expect(page.getByRole("heading", { name: "Payment activity summary" })).toBeVisible();
    const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, indexedDb: await indexedDB.databases() }));
    expect(JSON.stringify(storage)).not.toMatch(/reconciliation\.view|confirmedAmount|currencySummaries|scopeReference|correlationId/i);
    expect(consoleErrors).toEqual([]);
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /User Administration/ })).toBeVisible();
  });
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
