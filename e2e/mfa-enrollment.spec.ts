import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const appRoute = "/management-platform/";
const enrollmentRoute = "/account/mfa-enrollment";
const csrfHeader = "x-csrf-token";

test.describe("W4.4 privileged TOTP enrollment and first-login MFA", () => {
  test("enrolls from a restricted session, requires reauthentication, and grants authority only after valid TOTP", async ({ page }) => {
    const fixture = await installMfaFixture(page);
    const requests: Request[] = [];
    const consoleMessages: string[] = [];
    page.on("request", (request) => requests.push(request));
    page.on("console", (message) => consoleMessages.push(message.text()));

    await page.goto(appRoute);
    await signIn(page, "enroll.admin", "privileged-password");

    await expect(page).toHaveURL(new RegExp(`${enrollmentRoute}$`));
    await expect(page.getByRole("heading", { name: "Set up an authenticator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Set up authenticator" }).click();

    await expect(page.getByLabel("Authenticator setup QR code")).toBeVisible();
    await expect(page.getByLabel("Manual setup secret")).toHaveText("FIRSTSETUPSECRET");
    await assertNoMfaSecretsInBrowserStorage(page);

    await page.getByLabel("Authenticator code").fill("000000");
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(page.getByRole("alert")).toContainText("code was not accepted");
    await expect(page.getByLabel("Authenticator code")).toHaveValue("");

    await page.getByLabel("Authenticator code").fill("123456");
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(page.getByRole("heading", { name: "Authenticator setup complete" })).toBeVisible();
    expect(fixture.restrictedAuthorityReads).toBeGreaterThan(0);
    expect(fixture.privilegedAuthorityReadBeforeMfa).toBe(false);
    await assertNoMfaSecretsInBrowserStorage(page);

    await page.getByRole("button", { name: "Sign in" }).click();
    await signIn(page, "enroll.admin", "privileged-password");
    await expect(page.getByLabel("Verification code")).toBeFocused();
    await page.getByLabel("Verification code").fill("654321");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Privileged Administrator", { exact: true })).toBeVisible();

    expect(fixture.fullMfaLoginCount).toBe(1);
    expect(requests.filter((request) => request.url().includes("/totp/enrollment")).every((request) => request.headers()[csrfHeader] === "csrf-w44")).toBe(true);
    expect(requests.every((request) => !request.headers().referer?.includes("otpauth"))).toBe(true);
    expect(consoleMessages.join("\n")).not.toMatch(/FIRSTSETUPSECRET|otpauth|123456|654321|privileged-password/i);
  });

  test("refresh discards one-time material and explicit restart replaces a lost pending enrollment", async ({ page }) => {
    const fixture = await installMfaFixture(page);
    await page.goto(appRoute);
    await signIn(page, "enroll.admin", "privileged-password");
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(page.getByLabel("Manual setup secret")).toHaveText("FIRSTSETUPSECRET");

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${enrollmentRoute}$`));
    await expect(page.locator("body")).not.toContainText("FIRSTSETUPSECRET");
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(page.getByText(/previous one-time setup secret cannot be shown again/i)).toBeVisible();
    await page.getByRole("button", { name: "Restart authenticator setup" }).click();

    await expect(page.getByLabel("Manual setup secret")).toHaveText("RESTARTEDSETUPSECRET");
    await expect(page.locator("body")).not.toContainText("FIRSTSETUPSECRET");
    expect(fixture.restartCount).toBe(1);
    await assertNoMfaSecretsInBrowserStorage(page);
  });

  test("direct enrollment requires a restricted session and remains production-refresh, keyboard, and mobile usable", async ({ page, browser }) => {
    const fixture = await installMfaFixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(enrollmentRoute);
    await expect(page).toHaveURL(/\/management-platform\/$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await signIn(page, "enroll.admin", "privileged-password");
    await expect(page.getByRole("button", { name: "Set up authenticator" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Authenticator code")).toBeFocused();
    await page.getByLabel("Authenticator code").fill("111111");
    fixture.throttleConfirmation = true;
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(page.getByRole("alert")).toContainText("Too many authenticator attempts");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await assertNoMfaSecretsInBrowserStorage(page);

    const productionPort = Number(process.env.MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT ?? 5180);
    const productionPage = await browser.newPage();
    try {
      await installMfaFixture(productionPage);
      await productionPage.goto(`http://127.0.0.1:${productionPort}${enrollmentRoute}`);
      await expect(productionPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await signIn(productionPage, "enroll.admin", "privileged-password");
      await expect(productionPage).toHaveURL(new RegExp(`${enrollmentRoute}$`));
      await productionPage.reload();
      await expect(productionPage.getByRole("heading", { name: "Set up an authenticator" })).toBeVisible();
    } finally {
      await productionPage.close();
    }
  });
});

interface MfaFixture {
  restartCount: number;
  restrictedAuthorityReads: number;
  privilegedAuthorityReadBeforeMfa: boolean;
  fullMfaLoginCount: number;
  throttleConfirmation: boolean;
}

async function installMfaFixture(page: Page): Promise<MfaFixture> {
  const fixture: MfaFixture = {
    restartCount: 0,
    restrictedAuthorityReads: 0,
    privilegedAuthorityReadBeforeMfa: false,
    fullMfaLoginCount: 0,
    throttleConfirmation: false
  };
  let currentSession: Record<string, unknown> | undefined;
  let pending = false;
  let active = false;

  await page.route("**/v1/management-platform/dashboard/catalog", async (route) => {
    if (!currentSession || currentSession.mfaSatisfied !== true) {
      fixture.privilegedAuthorityReadBeforeMfa = true;
      await safeJson(route, 403, authError("SCOPE_DENIED"));
      return;
    }
    await safeJson(route, 200, { contractVersion: "management-platform-dashboard-reporting:v1", generatedAt: "2030-01-01T00:00:00Z", reports: [] });
  });
  await page.route("**/v1/management-platform/dashboard/operational-overview?**", async (route) => {
    await safeJson(route, 200, {
      contractVersion: "management-platform-dashboard-reporting:v1",
      reportId: "operational-overview",
      requestedScope: { scopeType: "SITE", scopeReference: "71000000-0000-0000-0000-000000000101", displayName: "Site scope 1" },
      effectiveScope: { scopeType: "SITE", scopeReference: "71000000-0000-0000-0000-000000000101", displayName: "Site scope 1" },
      generatedAt: "2030-01-01T00:00:00Z",
      dataAsOf: "2030-01-01T00:00:00Z",
      availability: "AVAILABLE",
      freshness: "CURRENT",
      correlationId: "44000000-0000-4000-8000-000000000005",
      sections: [], warnings: [], limitations: []
    });
  });

  await page.route("**/v1/human-authentication/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/session") && request.method() === "GET") {
      if (!currentSession) {
        await safeJson(route, 401, authError("SESSION_INVALID"));
        return;
      }
      if (currentSession.mfaSatisfied === false) fixture.restrictedAuthorityReads += 1;
      await safeJson(route, 200, authSuccess(currentSession), { "X-CSRF-Token": "csrf-w44" });
      return;
    }
    if (path.endsWith("/login") && request.method() === "POST") {
      const body = request.postDataJSON() as { username?: string; password?: string; totpCode?: string };
      if (body.username !== "enroll.admin" || body.password !== "privileged-password") {
        await safeJson(route, 401, authError("INVALID_CREDENTIALS"));
        return;
      }
      if (!active) {
        currentSession = session(false);
        await safeJson(route, 200, authSuccess(currentSession), { "X-CSRF-Token": "csrf-w44" });
        return;
      }
      if (!body.totpCode) {
        await safeJson(route, 401, authError("TOTP_REQUIRED"));
        return;
      }
      if (body.totpCode !== "654321") {
        await safeJson(route, 401, authError("TOTP_INVALID"));
        return;
      }
      fixture.fullMfaLoginCount += 1;
      currentSession = session(true);
      await safeJson(route, 200, authSuccess(currentSession), { "X-CSRF-Token": "csrf-w44" });
      return;
    }
    if (path.endsWith("/totp/enrollment/restart") && request.method() === "POST") {
      fixture.restartCount += 1;
      pending = true;
      await safeJson(route, 200, enrollment("TOTP_ENROLLMENT_RESTARTED", "RESTARTEDSETUPSECRET", "restart"));
      return;
    }
    if (path.endsWith("/totp/enrollment/confirm") && request.method() === "POST") {
      const body = request.postDataJSON() as { code?: string };
      if (fixture.throttleConfirmation) {
        await safeJson(route, 429, enrollmentError("TOTP_THROTTLED"));
        return;
      }
      if (body.code !== "123456") {
        await safeJson(route, 400, enrollmentError("TOTP_CONFIRMATION_FAILED"));
        return;
      }
      active = true;
      pending = false;
      await safeJson(route, 200, enrollment("TOTP_CONFIRMED_REAUTHENTICATION_REQUIRED", null, "confirmed"));
      return;
    }
    if (path.endsWith("/totp/enrollment") && request.method() === "POST") {
      if (pending) {
        await safeJson(route, 409, enrollmentError("TOTP_AUTHENTICATOR_ALREADY_EXISTS"));
        return;
      }
      pending = true;
      await safeJson(route, 200, enrollment("TOTP_ENROLLMENT_STARTED", "FIRSTSETUPSECRET", "first"));
      return;
    }
    if (path.endsWith("/logout") && request.method() === "POST") {
      currentSession = undefined;
      await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
      return;
    }
    await safeJson(route, 404, authError("NOT_FOUND"));
  });
  return fixture;
}

function session(satisfied: boolean): Record<string, unknown> {
  return {
    sessionReference: "44000000-0000-0000-0000-000000000001",
    userReference: "44000000-0000-0000-0000-000000000002",
    username: "enroll.admin",
    displayName: "Privileged Administrator",
    audience: "MANAGEMENT_PLATFORM",
    assurance: satisfied ? "PASSWORD_TOTP" : "PASSWORD_MFA_PENDING",
    privilegedAccount: true,
    passwordChangeRequired: false,
    mfaRequired: true,
    mfaSatisfied: satisfied,
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: satisfied ? ["management-platform.overview.read", "dashboard.view"] : [],
    siteReferences: satisfied ? ["71000000-0000-0000-0000-000000000101"] : [],
    siteGroupReferences: satisfied ? ["71000000-0000-0000-0000-000000000900"] : [],
    hasGlobalScope: false,
    deviceServiceIdentityReference: null,
    correlationId: "44000000-0000-0000-0000-000000000003"
  };
}

function authSuccess(sessionValue: Record<string, unknown>) {
  return { outcome: "AUTHENTICATED", authenticated: true, session: sessionValue, aptSessionToken: null, errorCode: null, retryable: false, correlationId: "44000000-0000-0000-0000-000000000003" };
}

function authError(errorCode: string) {
  return { outcome: errorCode.startsWith("TOTP_") ? "MFA_REQUIRED" : "FAILED", authenticated: false, session: null, aptSessionToken: null, errorCode, retryable: errorCode === "TOTP_THROTTLED", correlationId: "44000000-0000-0000-0000-000000000004" };
}

function enrollment(outcome: string, sharedSecret: string | null, suffix: string) {
  return {
    outcome,
    sharedSecret,
    provisioningUri: sharedSecret ? `otpauth://totp/ExitPass:enroll.admin?secret=${sharedSecret}&issuer=ExitPass` : null,
    enrollmentStartedAt: sharedSecret ? "2030-01-01T00:00:00Z" : null,
    correlationId: `44000000-0000-4000-8000-00000000${suffix === "first" ? "0001" : suffix === "restart" ? "0002" : "0003"}`,
    errorCode: null
  };
}

function enrollmentError(errorCode: string) {
  return { outcome: "REJECTED", sharedSecret: null, provisioningUri: null, enrollmentStartedAt: null, correlationId: "44000000-0000-4000-8000-000000000009", errorCode };
}

async function safeJson(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  await route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }, body: JSON.stringify(body) });
}

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function assertNoMfaSecretsInBrowserStorage(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    databases: typeof indexedDB.databases === "function" ? await indexedDB.databases() : [],
    url: window.location.href
  }));
  expect(storage.local).toEqual({});
  expect(storage.session).toEqual({});
  expect(storage.databases).toEqual([]);
  expect(JSON.stringify(storage)).not.toMatch(/FIRSTSETUPSECRET|RESTARTEDSETUPSECRET|otpauth|123456|654321|privileged-password/i);
}
