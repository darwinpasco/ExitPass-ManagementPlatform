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
    await expect(page.getByLabel("User type")).toHaveValue("");
    await expect(page.getByLabel("User type").locator("option")).toHaveCount(6);
    await expect(page.getByText(/H-007 Denied User|H-007 Synthetic Target User|H-007 View Only/)).toHaveCount(0);
    await expect(page.getByLabel(/password|totp|seed|provisioning/i)).toHaveCount(0);
    await expect(page.getByText(/Account setup and invitation delivery are handled separately/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add User" }).last()).toBeDisabled();
    await expect(page.getByLabel("Assigned Site").getByRole("option", { name: "PITX Level 3", exact: true })).toBeAttached();
    await expect(page.getByLabel("Assigned Site").getByRole("option", { name: "PITX Open Lot", exact: true })).toBeAttached();
    await expect(page.getByLabel("Assigned Site").getByRole("option", { name: /Test Site|SAMPLE-METRO|Mactan Newtown/i })).toHaveCount(0);
    await expect(page.getByText(/Authorized Site Group \d+|Site scope \d+/i)).toHaveCount(0);

    await page.getByLabel("Site access level").selectOption("SITE_GROUP");
    await expect(page.getByLabel("Assigned Site Group").getByRole("option", { name: "PITX", exact: true })).toBeAttached();
    await expect(page.getByLabel("Assigned Site Group").getByRole("option", { name: /SAMPLE-METRO|Mactan Newtown/i })).toHaveCount(0);

    await page.getByLabel("Site access level").selectOption("SITE");
    await page.getByLabel("User type").selectOption("SITE_OPERATOR");
    await page.getByLabel("Initial role").selectOption({ label: "Site Operator" });
    await page.getByLabel("Assigned Site").selectOption("2d1dcdf8-f563-537c-8542-0bde7cc9da97");
    await expect(page.getByRole("button", { name: "Add User" }).last()).toBeEnabled();

    for (const [userType, roleName] of [
      ["SUPPORT_USER", "Support Agent"],
      ["FINANCE_USER", "Finance / Reconciliation Analyst"],
      ["MERCHANT_USER", "Merchant Administrator"]
    ]) {
      await page.getByLabel("User type").selectOption(userType);
      await expect(page.getByLabel("Initial role").getByRole("option", { name: roleName, exact: true })).toBeAttached();
    }
    const roleOptions = await page.getByLabel("Initial role").locator("option").allTextContents();
    expect(roleOptions.join(" ")).not.toMatch(/Finance User|Merchant User|Support Staff|Site Administrator|SERVICE_PRINCIPAL/);
  });

  test("safe empty, denied, conflict, and unavailable scenarios remain distinct", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=empty");
    await expect(page.getByText("No users match the current search.")).toBeVisible();

    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=permission-denied");
    await expect(page.getByRole("alert")).toContainText("User directory: Access denied");

    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=unavailable");
    await expect(page.getByRole("alert")).toContainText("User directory: Unavailable");

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
    await expect(page.locator(".identityDetail")).toBeFocused();
    const responsiveOrder = await page.evaluate(() => ({
      detailTop: document.querySelector(".identityDetail")?.getBoundingClientRect().top ?? Number.MAX_SAFE_INTEGER,
      listTop: document.querySelector(".identityUserList")?.getBoundingClientRect().top ?? 0
    }));
    expect(responsiveOrder.detailTop).toBeLessThan(responsiveOrder.listTop);
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

  test("secondary request failures remain section-level and never appear empty", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=partial-failure");
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await expect(page.getByRole("heading", { name: "Synthetic Administration User" })).toBeVisible();
    await page.getByRole("tab", { name: "Roles & Permissions" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Role catalog: Unavailable" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Permission catalog: Unavailable" })).toBeVisible();
    await expect(page.getByText("No assignable roles were returned.")).toHaveCount(0);

    await page.getByRole("tab", { name: "Security" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Two-Factor Authentication: Access denied" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Active Sessions: Unavailable" })).toBeVisible();
    await expect(page.getByText("No active sessions returned.")).toHaveCount(0);

    await page.getByRole("tab", { name: "Activity Log" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Activity Log: Unavailable" })).toBeVisible();
    await expect(page.getByText("No activity was returned for this user.")).toHaveCount(0);
  });

  test("GLOBAL access is transparent and read-only while governed scope creation stays bounded", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=global-readonly");
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("tab", { name: "Roles & Permissions" }).click();
    const globalRow = page.locator(".recordList article").filter({ hasText: "Organization-wide access unavailable" });
    await expect(globalRow).toContainText("Read-only in Management Platform");
    await expect(globalRow.getByRole("button")).toHaveCount(0);
    await globalRow.focus();
    await page.keyboard.press("Enter");
    await expect(globalRow.getByRole("button")).toHaveCount(0);
    await expect(page.getByLabel("Access level").getByRole("option", { name: /global/i })).toHaveCount(0);
  });

  test("user directory continues beyond fifty records with bounded previous and next controls", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=paginated");
    await expect(page.getByText("Page 1 · Showing 1-50")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Page 2 · Showing 51-53")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByText("Page 1 · Showing 1-50")).toBeVisible();
  });

  test("persisted applied Elevated Access requests can be reopened without browser authority", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=elevated-rediscovery");
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("tab", { name: "Roles & Permissions" }).click();
    await page.getByLabel("Request reference").fill("synthetic-request-reference");
    await page.getByRole("button", { name: "Load Request" }).click();
    await expect(page.getByText("Applied", { exact: true })).toBeVisible();
    await expect(page.getByText(/target user must sign in again/)).toBeVisible();
    const storage = await page.evaluate(async () => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
      indexedDb: await indexedDB.databases()
    }));
    expect(JSON.stringify(storage)).not.toMatch(/synthetic-request-reference|privileged|elevated|authority/i);
  });

  test("uncertain mutations retain stale read-only data until authoritative refresh succeeds", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=mutation-uncertain");
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("button", { name: "Add User" }).click();
    const form = page.getByRole("heading", { name: "Add User" }).locator("xpath=ancestor::form");
    await form.getByLabel("Username").fill("uncertain.user");
    await form.getByLabel("Display name").fill("Uncertain User");
    await form.getByLabel("Reason").fill("MANUAL_VALIDATION");
    await form.getByLabel("User type").selectOption("SITE_OPERATOR");
    await form.getByLabel("Initial role").selectOption({ label: "Site Operator" });
    await form.getByLabel("Assigned Site").selectOption({ index: 1 });
    await form.getByRole("button", { name: "Add User" }).click();

    await expect(page.getByText("Information may be out of date.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Synthetic Administration User" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Profile" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Update Account Status" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Refresh authoritative state" })).toBeEnabled();

    await page.getByRole("button", { name: "Refresh authoritative state" }).click();
    await expect(page.getByText("Information may be out of date.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Profile" })).toBeEnabled();
  });
});
