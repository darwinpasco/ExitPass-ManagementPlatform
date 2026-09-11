import { expect, test, type Page } from "@playwright/test";

const reportRoute = "/management-platform/reports/fiscal-exceptions?mpScenario=authenticated&mpFiscalScenario=";

test.describe("Sales Invoice exception reporting", () => {
  test("navigates to a partial PHP-only SITE report with lifecycle and findings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${reportRoute}partial`);
    await expect(page).toHaveTitle("Sales Invoice Exceptions - ExitPass Management Platform");
    await expect(page.getByRole("heading", { name: "Sales Invoice Exceptions" })).toBeVisible();
    await expect(page.getByLabel("Reporting scope")).toHaveValue(/^SITE:/);
    await expect(page.getByLabel("Report status").getByText("Availability: Partial")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sales Invoice issuance lifecycle" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PHP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "USD" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sales Invoice issuance failed" })).toBeVisible();
    await expect(page.getByText(/does not query Site POS Servers live/i)).toBeVisible();
    await assertNoOverflow(page);
    await captureReviewScreenshot(page, "fiscal-partial-desktop-1440.png");
  });

  test("fails closed when Site Group metadata is unavailable", async ({ page }) => {
    await page.goto("/management-platform/reports/fiscal-exceptions?mpScenario=no-sites&mpDashboardScenario=site-group&mpFiscalScenario=site-group");
    await expect(page.getByRole("combobox", { name: /Reporting scope/ })).toHaveValue("");
    await expect(page.locator('option[value^="GLOBAL"]')).toHaveCount(0);
    await expect(page.getByRole("status", { name: "No authorized reporting scope" })).toBeVisible();
    await expect(page.getByText(/Development Site Group|Authorized Site Group \d+/)).toHaveCount(0);
  });

  test("distinguishes no activity, unavailable source, and disabled feature", async ({ page }) => {
    await page.goto(`${reportRoute}no-activity`);
    await expect(page.getByRole("status", { name: "No Sales Invoice issuance activity" })).toBeVisible();
    await captureReviewScreenshot(page, "fiscal-no-activity.png");
    await page.goto(`${reportRoute}unavailable`);
    await expect(page.getByRole("alert", { name: "Report unavailable" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Expected issuance amounts" })).toHaveCount(0);
    await page.goto(`${reportRoute}feature-disabled`);
    await expect(page.getByRole("alert", { name: "Report disabled" })).toBeVisible();
  });

  test("fails closed for denied, concealed, malformed, and mismatched responses", async ({ page }) => {
    for (const [scenario, title] of [["permission-denied", "Permission denied"], ["scope-denied", "Reporting scope unavailable"], ["malformed", "Report could not be read"], ["mismatched-scope", "Report could not be read"], ["mismatched-period", "Report could not be read"]] as const) {
      await page.goto(`${reportRoute}${scenario}`);
      await expect(page.getByRole("alert", { name: title })).toBeVisible();
    }
  });

  test("retains prior data with a clear failed-refresh warning", async ({ page }) => {
    await page.goto(`${reportRoute}refresh-failure`);
    await expect(page.getByRole("heading", { name: "Sales Invoice issuance lifecycle" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh report" }).click();
    await expect(page.getByRole("status", { name: /Previously loaded report/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sales Invoice issuance lifecycle" })).toBeVisible();
    await captureReviewScreenshot(page, "fiscal-failed-refresh-retained.png");
  });

  test("is keyboard operable without document overflow at desktop, tablet, and mobile", async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${reportRoute}partial`);
      await page.getByLabel("Reporting scope").focus();
      await expect(page.getByLabel("Reporting scope")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Period start (UTC)")).toBeFocused();
      await assertNoOverflow(page);
      await expect(page.getByRole("heading", { name: "Sales Invoice Exceptions" })).toBeInViewport();
      if (viewport.width === 768) await captureReviewScreenshot(page, "fiscal-partial-tablet-768.png");
      if (viewport.width === 390) await captureReviewScreenshot(page, "fiscal-partial-mobile-390.png");
    }
  });

  test("does not persist report data or call unexpected services", async ({ page }) => {
    const requests: string[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(`${reportRoute}partial&mpIdentityScenario=populated`);
    await expect(page.getByRole("heading", { name: "Expected issuance amounts" })).toBeVisible();
    const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, indexedDb: await indexedDB.databases() }));
    expect(JSON.stringify(storage)).not.toMatch(/sales-invoice-report\.view|expectedIssuanceAmount|lifecycleSummaries|scopeReference|correlationId/i);
    expect(requests.filter((url) => /pos-server|webpay|payment-provider|operator-console/i.test(url))).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /User Administration/ })).toBeVisible();
  });
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function captureReviewScreenshot(page: Page, fileName: string) {
  const directory = process.env.MANAGEMENT_PLATFORM_FISCAL_REVIEW_SCREENSHOT_DIR;
  if (!directory) return;
  await page.screenshot({ path: `${directory}/${fileName}`, fullPage: true });
}
