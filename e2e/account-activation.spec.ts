import { expect, test, type Page, type Request, type Route } from "@playwright/test";

const activationPath = "/account/activate";
const reference = "11111111-2222-4333-8444-555555555555";
const secret = "employee-one-time-activation-secret";

test.describe("ExitPass W4.2 account activation", () => {
  test("email or QR link scrubs its URL, creates the first password once, and proceeds to sign in", async ({ page }) => {
    const activationRequests: Request[] = [];
    const unrelatedRequests: Request[] = [];
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/v1/human-authentication/activations") activationRequests.push(request);
      else if (request.resourceType() !== "document") unrelatedRequests.push(request);
    });
    await page.route("**/v1/human-authentication/activations", async (route) => {
      await safeJson(route, 200, activationResponse("ACCOUNT_ACTIVATED"));
    });

    await page.goto(`${activationPath}?challengeReference=${reference}&challengeSecret=${secret}`);

    await expect(page).toHaveURL(new RegExp(`${activationPath}$`));
    await expect(page.getByRole("heading", { name: "Activate your ExitPass account" })).toBeVisible();
    await expect(page.getByText("Governed administration for authorized staff.")).toHaveCount(0);
    await expect(page.getByLabel("Activation reference")).toHaveValue(reference);
    await expect(page.getByLabel("Activation code")).toHaveValue(secret);
    await page.getByLabel("New password", { exact: true }).fill("employee-owned-first-password");
    await page.getByLabel("Confirm new password").fill("employee-owned-first-password");
    await page.getByRole("button", { name: "Activate account" }).click();

    await expect(page.getByRole("heading", { name: "Account activated" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/management-platform/");
    expect(activationRequests).toHaveLength(1);
    expect(activationRequests[0].postDataJSON()).toEqual({
      challengeReference: reference,
      challengeSecret: secret,
      newPassword: "employee-owned-first-password"
    });
    const unrelatedLeaks = unrelatedRequests
      .filter((request) => request.url().includes(secret)
        || String(request.headers().referer ?? "").includes(secret)
        || String(request.postData() ?? "").includes(secret))
      .map((request) => ({
        path: new URL(request.url()).pathname,
        resourceType: request.resourceType(),
        urlContainsSecret: request.url().includes(secret),
        referrerContainsSecret: String(request.headers().referer ?? "").includes(secret),
        bodyContainsSecret: String(request.postData() ?? "").includes(secret)
      }));
    expect(unrelatedLeaks).toEqual([]);
    expect(consoleMessages.join("\n")).not.toContain(secret);
    await assertNoSensitiveBrowserStorage(page);
  });

  test("manual admin-issued activation handles mismatch, password retry, invalid challenge, and refresh safely", async ({ page }) => {
    let responseMode: "password" | "invalid" | "success" = "password";
    let requestCount = 0;
    await page.route("**/v1/human-authentication/activations", async (route) => {
      requestCount += 1;
      if (responseMode === "password") {
        await safeJson(route, 400, activationResponse("PASSWORD_REJECTED", "PASSWORD_POLICY_FAILED"));
      } else if (responseMode === "invalid") {
        await safeJson(route, 400, activationResponse("CHALLENGE_REJECTED", "INVALID_OR_EXPIRED_CHALLENGE"));
      } else {
        await safeJson(route, 200, activationResponse("ACCOUNT_ACTIVATED"));
      }
    });
    await page.goto(activationPath);
    await page.getByLabel("Activation reference").fill(reference);
    await page.getByLabel("Activation code").fill(secret);
    await page.getByLabel("New password", { exact: true }).fill("first-password");
    await page.getByLabel("Confirm new password").fill("does-not-match");
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(page.getByRole("alert")).toContainText("confirmation does not match");
    expect(requestCount).toBe(0);

    await fillMatchingPassword(page, "policy-rejected-password");
    await expect(page.getByRole("alert")).toContainText("not accepted by the ExitPass password policy");
    await expect(page.getByLabel("Activation code")).toHaveValue(secret);
    expect(requestCount).toBe(1);

    responseMode = "invalid";
    await fillMatchingPassword(page, "employee-owned-first-password");
    await expect(page.getByRole("alert")).toContainText("new invitation or activation code");
    await expect(page.getByLabel("Activation reference")).toHaveValue("");
    await expect(page.getByLabel("Activation code")).toHaveValue("");
    expect(requestCount).toBe(2);

    responseMode = "success";
    await page.getByLabel("Activation reference").fill(reference);
    await page.getByLabel("Activation code").fill("new-admin-issued-secret");
    await fillMatchingPassword(page, "accepted-employee-password");
    await expect(page.getByRole("heading", { name: "Account activated" })).toBeVisible();

    await page.goto(`${activationPath}?challengeReference=${reference}&challengeSecret=${secret}`);
    await expect(page).toHaveURL(new RegExp(`${activationPath}$`));
    await page.reload();
    await expect(page.getByLabel("Activation reference")).toHaveValue("");
    await expect(page.getByLabel("Activation code")).toHaveValue("");
    await assertNoSensitiveBrowserStorage(page);
  });

  test("direct development and production navigation are responsive and keyboard accessible", async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(activationPath);
    await expect(page.getByLabel("Activation reference")).toBeFocused();
    await page.keyboard.type(reference);
    await page.keyboard.press("Tab");
    await page.keyboard.type(secret);
    await page.keyboard.press("Tab");
    await page.keyboard.type("employee-owned-password");
    await page.keyboard.press("Tab");
    await page.keyboard.type("employee-owned-password");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Activate account" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    const productionPort = Number(process.env.MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT ?? 5180);
    const productionPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await productionPage.goto(`http://127.0.0.1:${productionPort}${activationPath}`);
      await expect(productionPage.getByRole("heading", { name: "Activate your ExitPass account" })).toBeVisible();
      await productionPage.reload();
      await expect(productionPage.getByLabel("Activation reference")).toBeVisible();
      expect(await productionPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    } finally {
      await productionPage.close();
    }
  });
});

async function fillMatchingPassword(page: Page, password: string) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Activate account" }).click();
}

function activationResponse(outcome: string, errorCode: string | null = null) {
  return {
    outcome,
    authenticated: false,
    session: null,
    aptSessionToken: null,
    errorCode,
    retryable: false,
    correlationId: "w42-browser-correlation"
  };
}

async function safeJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
    body: JSON.stringify(body)
  });
}

async function assertNoSensitiveBrowserStorage(page: Page) {
  const storage = await page.evaluate(async () => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    indexedDb: typeof indexedDB.databases === "function" ? await indexedDB.databases() : []
  }));
  expect(JSON.stringify(storage)).not.toMatch(/challengeReference|challengeSecret|employee-owned|one-time-activation|role|scope/i);
  expect(storage.local).toHaveLength(0);
  expect(storage.session).toHaveLength(0);
  expect(storage.indexedDb).toHaveLength(0);
}
