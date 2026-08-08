import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const appRoute = "/management-platform/";
const csrfHeader = "x-csrf-token";

test.describe("Management Platform I-020 human authentication consumer", () => {
  test("ordinary login skips TOTP, rediscovers the session on refresh, and logs out through CSRF", async ({ page }) => {
    const fixture = await installAuthenticationFixture(page);
    const requests: Request[] = [];
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("request", (request) => {
      if (request.url().includes("/v1/human-authentication/")) {
        requests.push(request);
      }
    });

    await page.goto(appRoute);
    await signIn(page, "ordinary.user", "ordinary-password");

    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toBeVisible();
    await expect(page.getByLabel("Verification code")).toHaveCount(0);
    await expect(page.getByText("Ordinary Management User", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 Site scope; 1 Site Group scope/).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toBeVisible();
    expect(fixture.sessionReads).toBeGreaterThanOrEqual(2);
    await assertStorageHasNoAuthenticationAuthority(page);
    assertNoPrivilegedIdentityHeaders(requests);
    expect(requests.every((request) => new URL(request.url()).origin === new URL(page.url()).origin)).toBe(true);
    expect(consoleErrors.every((message) => message === "Failed to load resource: the server responded with a status of 401 (Unauthorized)")).toBe(true);
    expect(consoleErrors.join("\n")).not.toMatch(/password|totp|token|cookie|authorization|stack trace|exception|sql|ordinary\.user/i);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(fixture.logoutHeaders?.[csrfHeader]).toBe("csrf-browser-runtime");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("privileged login presents TOTP only when required and handles an invalid code safely", async ({ page }) => {
    await installAuthenticationFixture(page);
    await page.goto(appRoute);
    await signIn(page, "privileged.admin", "privileged-password");

    const totp = page.getByLabel("Verification code");
    await expect(totp).toBeFocused();
    await totp.fill("000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("verification code was not accepted");
    await expect(totp).toHaveValue("");

    await totp.fill("123456");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByText("Privileged Administrator", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toBeVisible();
  });

  test("invalid credentials and throttling remain anti-enumerating", async ({ page }) => {
    await installAuthenticationFixture(page);
    await page.goto(appRoute);
    await signIn(page, "unknown.user", "wrong-password");
    await expect(page.getByRole("alert")).toContainText("username or password was not accepted");
    await expect(page.locator("body")).not.toContainText(/user does not exist|SQL|stack trace|credential hash/i);

    await page.getByLabel("Username").fill("throttled.user");
    await page.getByLabel("Password").fill("another-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Too many attempts");
  });

  test("expired or revoked protected requests remove the workspace while 403 keeps the session", async ({ page }) => {
    const fixture = await installAuthenticationFixture(page);
    await page.route("**/v1/management-platform/sales-invoice-header-profiles**", async (route) => {
      if (fixture.protectedStatus === 403) {
        await safeJson(route, 403, { errorCode: "SCOPE_DENIED" });
      } else {
        await safeJson(route, 401, { errorCode: fixture.protectedStatus === 401 ? "SESSION_REVOKED" : "SESSION_EXPIRED" });
      }
    });

    fixture.protectedStatus = 403;
    await page.goto("/management-platform/sales-invoice-profiles");
    await signIn(page, "ordinary.user", "ordinary-password");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);

    fixture.protectedStatus = 401;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("expired or was revoked");
    await expect(page.getByRole("button", { name: "Create" })).toHaveCount(0);
  });

  test("expired and revoked current sessions return controlled login states", async ({ page }) => {
    const fixture = await installAuthenticationFixture(page);
    fixture.sessionMode = "expired";
    await page.goto(appRoute);
    await expect(page.getByRole("alert")).toContainText("session expired");

    fixture.sessionMode = "revoked";
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("session is no longer active");
    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toHaveCount(0);
  });

  test("production ignores development-principal query parameters", async ({ browser }) => {
    const productionPort = Number(process.env.MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT ?? 5180);
    const productionPage = await browser.newPage();
    try {
      await installAuthenticationFixture(productionPage);
      await productionPage.goto(`http://127.0.0.1:${productionPort}/management-platform/?mpScenario=authenticated&mpProfileScenario=manage`);
      await expect(productionPage.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(productionPage.getByRole("status", { name: "Development scenario" })).toHaveCount(0);
      await expect(productionPage.getByText("Management Platform User", { exact: true })).toHaveCount(0);
    } finally {
      await productionPage.close();
    }
  });

  test("startup outage and malformed responses fail closed with a safe retry", async ({ page }) => {
    const fixture = await installAuthenticationFixture(page);
    fixture.sessionMode = "unavailable";
    await page.goto(appRoute);
    await expect(page.getByRole("alert", { name: "Sign-in service unavailable" })).toContainText("temporarily unavailable");
    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toHaveCount(0);

    fixture.sessionMode = "malformed";
    await page.getByRole("button", { name: "Retry session check" }).click();
    await expect(page.getByRole("alert", { name: "Sign-in service unavailable" })).toContainText("could not be read safely");

    fixture.sessionMode = "normal";
    await page.getByRole("button", { name: "Retry session check" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("login remains keyboard usable and responsive at 390 by 844", async ({ page }) => {
    await installAuthenticationFixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(appRoute);
    await expect(page.getByLabel("Username")).toBeFocused();
    await page.keyboard.type("ordinary.user");
    await page.keyboard.press("Tab");
    await page.keyboard.type("ordinary-password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Management Platform foundation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
});

interface AuthenticationFixture {
  sessionReads: number;
  logoutHeaders?: Record<string, string>;
  protectedStatus: 401 | 403;
  sessionMode: "normal" | "unavailable" | "malformed" | "expired" | "revoked";
}

async function installAuthenticationFixture(page: Page): Promise<AuthenticationFixture> {
  const fixture: AuthenticationFixture = { sessionReads: 0, protectedStatus: 403, sessionMode: "normal" };
  let currentSession: Record<string, unknown> | undefined;

  await page.route("**/v1/human-authentication/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/session") && request.method() === "GET") {
      fixture.sessionReads += 1;
      if (fixture.sessionMode === "unavailable") {
        await safeJson(route, 503, authError("AUTHENTICATION_UNAVAILABLE", true));
        return;
      }
      if (fixture.sessionMode === "malformed") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{malformed" });
        return;
      }
      if (fixture.sessionMode === "expired" || fixture.sessionMode === "revoked") {
        await safeJson(route, 401, authError(fixture.sessionMode === "expired" ? "SESSION_EXPIRED" : "SESSION_REVOKED"));
        return;
      }
      if (!currentSession) {
        await safeJson(route, 401, authError("SESSION_INVALID"));
        return;
      }
      await safeJson(route, 200, authSuccess(currentSession), { "X-CSRF-Token": "csrf-browser-runtime" });
      return;
    }

    if (path.endsWith("/login") && request.method() === "POST") {
      const body = request.postDataJSON() as { username?: string; password?: string; audience?: string; totpCode?: string };
      expect(body.audience).toBe("MANAGEMENT_PLATFORM");
      if (body.username === "throttled.user") {
        await safeJson(route, 429, authError("AUTHENTICATION_THROTTLED", true));
        return;
      }
      if (body.username === "privileged.admin" && !body.totpCode) {
        await safeJson(route, 401, authError("TOTP_REQUIRED"));
        return;
      }
      if (body.username === "privileged.admin" && body.totpCode !== "123456") {
        await safeJson(route, 401, authError("TOTP_INVALID"));
        return;
      }
      if (!((body.username === "ordinary.user" && body.password === "ordinary-password") || (body.username === "privileged.admin" && body.password === "privileged-password"))) {
        await safeJson(route, 401, authError("INVALID_CREDENTIALS"));
        return;
      }
      currentSession = session(body.username === "privileged.admin");
      await safeJson(route, 200, authSuccess(currentSession), {
        "X-CSRF-Token": "csrf-browser-runtime",
        "Set-Cookie": "__Host-ExitPass-HumanSession=opaque-fixture; Path=/; HttpOnly; Secure; SameSite=Strict"
      });
      return;
    }

    if (path.endsWith("/logout") && request.method() === "POST") {
      fixture.logoutHeaders = request.headers();
      if (request.headers()[csrfHeader] !== "csrf-browser-runtime") {
        await safeJson(route, 400, authError("CSRF_VALIDATION_FAILED"));
        return;
      }
      currentSession = undefined;
      await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
      return;
    }

    await safeJson(route, 404, authError("NOT_FOUND"));
  });
  return fixture;
}

function session(privileged: boolean): Record<string, unknown> {
  return {
    sessionReference: "10000000-0000-0000-0000-000000000001",
    userReference: "10000000-0000-0000-0000-000000000002",
    username: privileged ? "privileged.admin" : "ordinary.user",
    displayName: privileged ? "Privileged Administrator" : "Ordinary Management User",
    audience: "MANAGEMENT_PLATFORM",
    assurance: privileged ? "PASSWORD_TOTP" : "PASSWORD",
    privilegedAccount: privileged,
    passwordChangeRequired: false,
    mfaRequired: privileged,
    mfaSatisfied: privileged,
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: ["management-platform.overview.read", "sales-invoice-profile.read"],
    siteReferences: ["71000000-0000-0000-0000-000000000101"],
    siteGroupReferences: ["71000000-0000-0000-0000-000000000900"],
    hasGlobalScope: false,
    deviceServiceIdentityReference: null,
    correlationId: "10000000-0000-0000-0000-000000000003"
  };
}

function authSuccess(sessionValue: Record<string, unknown>) {
  return { outcome: "AUTHENTICATED", authenticated: true, session: sessionValue, aptSessionToken: null, errorCode: null, retryable: false, correlationId: "10000000-0000-0000-0000-000000000003" };
}

function authError(errorCode: string, retryable = false) {
  return { outcome: errorCode.startsWith("TOTP_") ? "MFA_REQUIRED" : "FAILED", authenticated: false, session: null, aptSessionToken: null, errorCode, retryable, correlationId: "10000000-0000-0000-0000-000000000004" };
}

async function safeJson(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  await route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }, body: JSON.stringify(body) });
}

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

function assertNoPrivilegedIdentityHeaders(requests: Request[]) {
  for (const request of requests) {
    const names = Object.keys(request.headers()).map((name) => name.toLowerCase());
    expect(names).not.toContain("authorization");
    expect(names).not.toContain("x-exitpass-user-id");
    expect(names).not.toContain("x-operator-user-id");
    expect(names).not.toContain("x-exitpass-permissions");
    expect(names).not.toContain("x-management-platform-permissions");
    expect(names).not.toContain("x-exitpass-site-id");
    expect(names).not.toContain("x-exitpass-site-group-id");
  }
}

async function assertStorageHasNoAuthenticationAuthority(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: { ...localStorage },
    transient: { ...sessionStorage },
    databases: typeof indexedDB.databases === "function" ? await indexedDB.databases() : [],
    cacheNames: "caches" in window ? await caches.keys() : []
  }));
  expect(storage.local).toEqual({});
  expect(storage.transient).toEqual({});
  expect(storage.databases).toEqual([]);
  expect(storage.cacheNames).toEqual([]);
}
