import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const forgotPath = "/account/forgot-password";
const resetPath = "/account/reset-password";
const reference = "22222222-3333-4444-8555-666666666666";
const secret = "employee-one-time-password-reset-secret";

test.describe("ExitPass W4.3 password recovery", () => {
  test("sign-in exposes Forgot password and username-only requests stay anti-enumerating", async ({ browser, page }) => {
    const normalRuntimePort = Number(process.env.MANAGEMENT_PLATFORM_E2E_NORMAL_RUNTIME_PORT ?? 5181);
    const normalPage = await browser.newPage();
    try {
      await normalPage.route("**/v1/human-authentication/session", (route) => safeJson(route, 401, authenticationFailure()));
      await normalPage.goto(`http://127.0.0.1:${normalRuntimePort}/management-platform/`);
      await expect(normalPage.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", forgotPath);
    } finally {
      await normalPage.close();
    }

    const requestBodies: unknown[] = [];
    await page.route("**/v1/human-authentication/password-reset-requests", async (route) => {
      requestBodies.push(route.request().postDataJSON());
      await safeJson(route, 202, { outcome: "REQUEST_ACCEPTED", correlationId: "w43-request-correlation" });
    });

    for (const username of ["employee.with.email", "unknown-or-no-email-user"]) {
      await page.goto(forgotPath);
      await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
      await expect(page.getByLabel("Username")).toBeFocused();
      await expect(page.getByLabel(/email/i)).toHaveCount(0);
      await page.getByLabel("Username").fill(username);
      await page.getByRole("button", { name: "Request password reset" }).click();
      await expect(page.getByRole("heading", { name: "Check for a reset link" })).toBeVisible();
      await expect(page.getByText(/If an eligible ExitPass account with a registered email address/)).toBeVisible();
      await expect(page.getByText(/contact your administrator/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Sign in" })).toHaveAttribute("href", "/management-platform/");
      await expect(page.getByText(/username not found|account has no email|email required/i)).toHaveCount(0);
    }
    expect(requestBodies).toEqual([{ username: "employee.with.email" }, { username: "unknown-or-no-email-user" }]);
  });

  test("email reset link is scrubbed before unrelated requests and completes without automatic login", async ({ page }) => {
    const resetRequests: Request[] = [];
    const unrelatedRequests: Request[] = [];
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/v1/human-authentication/password-resets") resetRequests.push(request);
      else if (request.resourceType() !== "document") unrelatedRequests.push(request);
    });
    await page.route("**/v1/human-authentication/password-resets", (route) => safeJson(route, 200, resetResponse("PASSWORD_RESET_COMPLETED")));

    await page.goto(`${resetPath}?challengeReference=${reference}&challengeSecret=${secret}`);
    await expect(page).toHaveURL(new RegExp(`${resetPath}$`));
    await expect(page.getByLabel("Reset reference")).toHaveValue(reference);
    await expect(page.getByLabel("Reset code")).toHaveValue(secret);
    await fillMatchingPassword(page, "employee-owned-replacement-password");

    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible();
    await expect(page.getByText(/existing signed-in sessions were ended/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/management-platform/");
    expect(resetRequests).toHaveLength(1);
    expect(resetRequests[0].postDataJSON()).toEqual({
      challengeReference: reference,
      challengeSecret: secret,
      newPassword: "employee-owned-replacement-password"
    });
    expect(unrelatedRequests.filter((request) => request.url().includes(secret)
      || String(request.headers().referer ?? "").includes(secret)
      || String(request.postData() ?? "").includes(secret))).toEqual([]);
    expect(consoleMessages.join("\n")).not.toContain(secret);
    await assertNoSensitiveBrowserStorage(page);
  });

  test("manual reset handles mismatch, policy retry, invalid/replay, and unavailable states safely", async ({ page }) => {
    let responseMode: "password" | "invalid" | "unavailable" | "success" = "password";
    let requestCount = 0;
    await page.route("**/v1/human-authentication/password-resets", async (route) => {
      requestCount += 1;
      if (responseMode === "password") await safeJson(route, 400, resetResponse("PASSWORD_REJECTED", "PASSWORD_POLICY_FAILED"));
      else if (responseMode === "invalid") await safeJson(route, 400, resetResponse("CHALLENGE_REJECTED", "INVALID_OR_EXPIRED_CHALLENGE"));
      else if (responseMode === "unavailable") await safeJson(route, 503, { ...resetResponse("FAILED", "AUTHENTICATION_UNAVAILABLE"), retryable: true });
      else await safeJson(route, 200, resetResponse("PASSWORD_RESET_COMPLETED"));
    });
    await page.goto(resetPath);
    await page.getByLabel("Reset reference").fill(reference);
    await page.getByLabel("Reset code").fill(secret);
    await page.getByLabel("New password", { exact: true }).fill("first-password");
    await page.getByLabel("Confirm new password").fill("different-password");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert")).toContainText("confirmation does not match");
    expect(requestCount).toBe(0);

    await fillMatchingPassword(page, "policy-rejected-password");
    await expect(page.getByRole("alert")).toContainText("not accepted by the ExitPass password policy");
    await expect(page.getByLabel("Reset code")).toHaveValue(secret);

    responseMode = "unavailable";
    await fillMatchingPassword(page, "retry-after-outage-password");
    await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
    await expect(page.getByLabel("Reset code")).toHaveValue(secret);

    responseMode = "invalid";
    await fillMatchingPassword(page, "replayed-or-expired-password");
    await expect(page.getByRole("alert")).toContainText("Request a new password reset link");
    await expect(page.getByLabel("Reset reference")).toHaveValue("");
    await expect(page.getByLabel("Reset code")).toHaveValue("");

    responseMode = "success";
    await page.getByLabel("Reset reference").fill(reference);
    await page.getByLabel("Reset code").fill("new-reset-secret");
    await fillMatchingPassword(page, "accepted-replacement-password");
    await expect(page.getByRole("heading", { name: "Password reset complete" })).toBeVisible();
    expect(requestCount).toBe(4);
  });

  test("forgot and reset routes support direct refresh, mobile layout, and keyboard use in development and production", async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(forgotPath);
    await expect(page.getByLabel("Username")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    await page.goto(resetPath);
    await expect(page.getByLabel("Reset reference")).toBeFocused();
    await page.keyboard.type(reference);
    await page.keyboard.press("Tab");
    await page.keyboard.type(secret);
    await page.keyboard.press("Tab");
    await page.keyboard.type("replacement-password");
    await page.keyboard.press("Tab");
    await page.keyboard.type("replacement-password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Reset password" })).toBeFocused();
    await page.reload();
    await expect(page.getByLabel("Reset reference")).toHaveValue("");
    await assertNoSensitiveBrowserStorage(page);

    const productionPort = Number(process.env.MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT ?? 5180);
    const productionPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      for (const route of [forgotPath, resetPath]) {
        await productionPage.goto(`http://127.0.0.1:${productionPort}${route}`);
        await expect(productionPage.locator("main.accountActivationShell")).toBeVisible();
        await productionPage.reload();
        await expect(productionPage.locator("main.accountActivationShell")).toBeVisible();
        expect(await productionPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      }
    } finally {
      await productionPage.close();
    }
  });
});

async function fillMatchingPassword(page: Page, password: string) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Reset password" }).click();
}

function resetResponse(outcome: string, errorCode: string | null = null) {
  return { outcome, authenticated: false, session: null, aptSessionToken: null, errorCode, retryable: false, correlationId: "w43-browser-correlation" };
}

function authenticationFailure() {
  return { outcome: "SESSION_INVALID", authenticated: false, session: null, aptSessionToken: null, errorCode: "SESSION_INVALID", retryable: false, correlationId: "w43-auth-correlation" };
}

async function safeJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" }, body: JSON.stringify(body) });
}

async function assertNoSensitiveBrowserStorage(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    indexedDb: typeof indexedDB.databases === "function" ? await indexedDB.databases() : []
  }));
  expect(JSON.stringify(storage)).not.toMatch(/challengeReference|challengeSecret|employee-owned|password-reset-secret|reset-password\?/i);
  expect(storage.local).toHaveLength(0);
  expect(storage.session).toHaveLength(0);
  expect(storage.indexedDb).toHaveLength(0);
}
