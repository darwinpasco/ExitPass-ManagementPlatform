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
    await expect(page.getByRole("heading", { name: "Scope Access", exact: true })).toBeVisible();
    await expect(page.getByText(/Scope choices come from the selected role policy/)).toBeVisible();
    await expect(page.getByLabel("Scope access level").getByRole("option", { name: "Site", exact: true })).toBeAttached();
    await expect(page.getByLabel("Scope access level").getByRole("option", { name: "Site Group", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Scope access level").getByRole("option", { name: /global/i })).toHaveCount(0);

    await page.getByRole("tab", { name: "Security" }).click();
    await expect(page.getByRole("heading", { name: "Two-Factor Authentication" })).toBeVisible();
    await expect(page.getByText("Required for sign-in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset Authenticator App" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Authenticator App" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active Sessions" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/otpauth:\/\/|JBSWY3DPEHPK3PXP/i);
    await expect(page.getByText(/Session cookies, secrets, hashes/)).toBeVisible();

    await page.getByRole("tab", { name: "Activity Log" }).click();
    await expect(page.getByRole("table", { name: "User activity log" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/81000000-0000-4000-8000-/i);
  });

  test("shows approved roles, Global-only Executive scope, and one-time provisioning", async ({ page }) => {
    await page.goto(route);
    await page.getByRole("button", { name: "Add User" }).click();
    const form = page.getByRole("heading", { name: "Add User" }).locator("xpath=ancestor::form");
    await expect(form.getByLabel("User type")).toHaveCount(0);
    await expect(form.getByLabel("Initial role").locator("option")).toHaveText([
      "Select a role", "System Administrator", "Operations Supervisor", "Site Operator", "Parking Attendant", "APT / Cashier Operator", "Finance / Reconciliation Analyst", "Compliance / Policy Administrator", "Executive / Management"
    ]);
    for (const label of ["System Administrator", "Operations Supervisor", "Site Operator", "Parking Attendant", "APT / Cashier Operator", "Finance / Reconciliation Analyst", "Compliance / Policy Administrator", "Executive / Management"]) {
      await form.getByLabel("Initial role").selectOption({ label });
      await expect(form.getByLabel("Initial role")).toHaveValue(/.+/);
    }
    await form.getByLabel("Initial role").selectOption({ label: "Finance / Reconciliation Analyst" });
    await expect(form.getByLabel("Access level")).toHaveValue("");
    await expect(form.getByLabel("Access level")).toBeEnabled();

    await form.getByLabel("Initial role").selectOption({ label: "Executive / Management" });
    await expect(form.getByLabel("Access level")).toHaveValue("GLOBAL");
    await expect(form.getByLabel("Access level")).toBeDisabled();
    await expect(form.getByText(/Global scope required/)).toBeVisible();

    await form.getByLabel("Initial role").selectOption({ label: "Site Operator" });
    await expect(form.getByLabel("Assigned Site").getByRole("option", { name: "PITX Level 3", exact: true })).toBeAttached();
    await form.getByLabel("Username").fill("new.operator");
    await form.getByLabel("Display name").fill("New Operator");
    await form.getByLabel("Reason").fill("AUTHORIZED_PROVISIONING");
    await form.getByLabel("Assigned Site").selectOption({ index: 1 });
    await form.getByRole("button", { name: "Add User" }).click();
    const provisioning = page.getByRole("region", { name: "Provision Provisioned User" });
    await expect(provisioning).toContainText("Temporary password");
    await expect(provisioning).toContainText("Manual setup key");
    await expect(provisioning.getByAltText("Authenticator QR code for provisioned.user")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await expect(provisioning).toContainText("Account status: Active");
    await expect(provisioning).toContainText("Normal application access remains blocked until the required password change is complete.");
    await provisioning.getByRole("button", { name: "I have completed provisioning" }).click();
    await expect(provisioning).toHaveCount(0);
  });

  test("reset provisions a replacement once and remove transitions to setup", async ({ page }) => {
    page.on("dialog", (dialog) => void dialog.accept());
    const externalQrRequests: string[] = [];
    page.on("request", (request) => {
      if (/qr|chart/i.test(request.url()) && !request.url().startsWith("http://127.0.0.1")) externalQrRequests.push(request.url());
    });
    await page.goto(route);
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("tab", { name: "Security" }).click();
    await page.getByRole("button", { name: "Reset Authenticator App" }).click();

    const panel = page.getByRole("region", { name: "Set up authenticator" });
    await expect(panel).toContainText("Synthetic Administration User");
    await expect(panel).toContainText("KRSXG5DSNFXGOIDB");
    await expect(panel).toContainText("This information is shown only once.");
    await expect(panel.getByAltText("Authenticator QR code for synthetic.admin")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    expect(externalQrRequests).toEqual([]);
    expect(page.url()).not.toContain("KRSXG5DSNFXGOIDB");
    const storageWhileOpen = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storageWhileOpen).not.toContain("KRSXG5DSNFXGOIDB");

    await panel.getByRole("button", { name: "I have completed provisioning" }).click();
    await expect(page.getByText("KRSXG5DSNFXGOIDB")).toHaveCount(0);
    await expect(page.getByAltText("Authenticator QR code for synthetic.admin")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove Authenticator App" }).click();
    await expect(page.getByText("Not set up")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set Up Authenticator App" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Set up authenticator" })).toHaveCount(0);
  });
  test("production runtime cannot activate synthetic identity or authentication fixtures", async ({ browser }) => {
    const productionPort = Number(process.env.MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT ?? 5180);
    const productionPage = await browser.newPage();
    try {
      await productionPage.route("**/v1/human-authentication/session", async (requestRoute) => {
        await requestRoute.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ outcome: "FAILED", authenticated: false, session: null, aptSessionToken: null, errorCode: "SESSION_REQUIRED", retryable: false, correlationId: "10000000-0000-0000-0000-000000000099" }) });
      });
      await productionPage.goto(`http://127.0.0.1:${productionPort}/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=populated`);
      await expect(productionPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(productionPage.getByText("Synthetic Administration User")).toHaveCount(0);
      await expect(productionPage.getByText(/Temporary-Only-72h|JBSWY3DPEHPK3PXP/)).toHaveCount(0);
    } finally {
      await productionPage.close();
    }
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
    await expect(page.getByText(/Scope choices come from the selected role policy/)).toBeVisible();
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
    await expect(page.getByLabel("Scope access level").getByRole("option", { name: /global/i })).toHaveCount(0);
  });

  test("user directory continues beyond fifty records with bounded previous and next controls", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=paginated");
    await expect(page.getByText(/Page 1.*Showing 1-50/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/Page 2.*Showing 51-53/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByText(/Page 1.*Showing 1-50/)).toBeVisible();
  });

  test("assigns approved roles directly and keeps Global scope labeling", async ({ page }) => {
    await page.goto(route);
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("tab", { name: "Roles & Permissions" }).click();
    const form = page.getByRole("heading", { name: "Add Role" }).locator("xpath=ancestor::form");
    await expect(form.getByRole("option", { name: "System Administrator (Global scope)" })).toBeAttached();
    await expect(form.getByRole("option", { name: "Executive / Management (Global scope)" })).toBeAttached();
    await expect(form.getByText(/elevated access approval/i)).toHaveCount(0);
    await form.getByLabel("Role").selectOption({ label: "System Administrator (Global scope)" });
    await form.getByLabel("Reason").fill("AUTHORIZED_ROLE_ASSIGNMENT");
    await form.getByRole("button", { name: "Add Role" }).click();
    await expect(page.getByText("Role assigned.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Elevated Access" })).toHaveCount(0);
  });

  test("uncertain mutations retain stale read-only data until authoritative refresh succeeds", async ({ page }) => {
    await page.goto("/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=mutation-uncertain");
    await page.getByRole("button", { name: /Synthetic Administration User/ }).click();
    await page.getByRole("button", { name: "Add User" }).click();
    const form = page.getByRole("heading", { name: "Add User" }).locator("xpath=ancestor::form");
    await form.getByLabel("Username").fill("uncertain.user");
    await form.getByLabel("Display name").fill("Uncertain User");
    await form.getByLabel("Reason").fill("MANUAL_VALIDATION");
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
