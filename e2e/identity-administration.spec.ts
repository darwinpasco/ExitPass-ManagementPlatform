import { expect, test } from "@playwright/test";

const route = "/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=populated";

test.describe("governed User Administration", () => {
  test("loads users, detail, access, security, and audit as one workspace", async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "User Administration" })).toBeVisible();
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await expect(page.getByRole("heading", { name: "Synthetic Administration User" })).toBeVisible();

    await page.getByRole("tab", { name: "Roles & Permissions" }).click();
    await expect(page.getByRole("heading", { name: "Roles & Permissions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site Access", exact: true })).toBeVisible();
    await expect(page.getByText(/Organization-wide access is not available/)).toBeVisible();
    await expect(page.getByLabel("Access level").getByRole("option", { name: "Site", exact: true })).toBeAttached();
    await expect(page.getByLabel("Access level").getByRole("option", { name: "Site Group", exact: true })).toBeAttached();
    await expect(page.getByLabel("Access level").getByRole("option", { name: /global/i })).toHaveCount(0);

    await page.getByRole("tab", { name: "Security" }).click();
    await expect(page.getByRole("heading", { name: "Two-Factor Authentication" })).toBeVisible();
    await expect(page.getByText("Required for elevated Management Platform access")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active Sessions" })).toBeVisible();
    await expect(page.getByText(/Session cookies, secrets, hashes/)).toBeVisible();

    await page.getByRole("tab", { name: "Activity Log" }).click();
    await expect(page.getByRole("table", { name: "User activity log" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/81000000-0000-4000-8000-/i);
  });

  test("create and governed mutation controls never request credentials", async ({ page }) => {
    await page.goto(route);
    await page.getByRole("button", { name: "Add User" }).click();
    await expect(page.getByRole("heading", { name: "Add User" })).toBeVisible();
    await expect(page.getByLabel(/password|totp|seed|provisioning/i)).toHaveCount(0);
    await expect(page.getByText(/Account setup and invitation delivery are handled separately/)).toBeVisible();
  });

  test("safe empty, denied, conflict, and unavailable scenarios remain distinct", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=empty");
    await expect(page.getByText("No users match the current search.")).toBeVisible();

    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=permission-denied");
    await expect(page.getByRole("alert")).toContainText("Permission denied");

    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=unavailable");
    await expect(page.getByRole("alert")).toContainText("User Administration unavailable");

    await page.goto("/management-platform/identity-administration?mpScenario=permission-denied&mpIdentityScenario=populated");
    await expect(page.getByRole("alert", { name: "Permission denied" })).toBeVisible();
  });

  test("responsive and keyboard navigation keep administration reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const workspaceTitle = page.getByRole("heading", { name: "User Administration" });
    await workspaceTitle.scrollIntoViewIfNeeded();
    await expect(workspaceTitle).toBeInViewport();
    await page.getByRole("button", { name: /Synthetic Administration User/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Synthetic Administration User" })).toBeVisible();
    await page.getByRole("tab", { name: "Roles & Permissions" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Organization-wide access is not available/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });

  test("browser storage contains no authentication, permission, scope, or administration authority", async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "User Administration" })).toBeVisible();
    const storage = await page.evaluate(async () => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
      indexedDb: await indexedDB.databases()
    }));
    expect(JSON.stringify(storage)).not.toMatch(/synthetic\.admin|SITE_ACCESS_ADMINISTRATOR|user\.manage|csrf|sessionReference/i);
  });
});
