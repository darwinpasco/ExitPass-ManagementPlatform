import { expect, test } from "@playwright/test";

const contractVersion = "management-platform-statutory-benefit-review:v1";
const decisionReference = "20000000-0000-4000-8000-000000000001";
const correlationId = "50000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/management-platform/statutory-benefit-requests**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ contractVersion, decisionCommandReference: decisionReference, status: "APPROVED", decision: "APPROVE", reviewerDisplayName: "Head Office Reviewer", decidedAt: "2026-08-24T02:00:00Z", alreadyDecided: false, version: 8, correlationId }) });
    if (url.pathname.endsWith("/evidence")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ contractVersion, decisionCommandReference: decisionReference, evidenceRequired: true, evidenceRecorded: true, items: [{ evidenceType: "GOVERNMENT_ID", captureMethod: "UPLOAD", maskedReference: "***1234", verificationStatus: "RECORDED" }], correlationId }) });
    if (url.pathname.endsWith(decisionReference)) return route.fulfill({ contentType: "application/json", body: JSON.stringify(detail()) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(queue()) });
  });
});

test("reviews a PHP-only WebPay request with privacy and permission controls", async ({ page }) => {
  await page.goto("/management-platform/statutory-benefit-requests?mpScenario=authenticated&mpBenefitReviewScenario=populated");
  await expect(page).toHaveTitle("Statutory Benefit Requests - ExitPass Management Platform");
  await expect(page.getByRole("heading", { name: "Statutory Benefit Requests" })).toBeVisible();
  await expect(page.getByLabel("Evidence privacy notice")).toBeVisible();
  await page.getByRole("button", { name: /Person with disability/ }).click();
  await expect(page.getByText(/1,234\.56/)).toBeVisible();
  await expect(page.getByText("***1234")).toBeVisible();
  await expect(page.getByText(/USD|currency conversion|multi-currency/i)).toHaveCount(0);
  await expect(page.getByText(/plate/i)).toHaveCount(0);
});

test("keeps filters, pagination, and detail usable at desktop, tablet, and mobile", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/management-platform/statutory-benefit-requests?mpScenario=authenticated&mpBenefitReviewScenario=populated");
    await page.getByLabel("Status").focus();
    await expect(page.getByLabel("Status")).toBeFocused();
    await page.getByRole("button", { name: /Person with disability/ }).click();
    await expect(page.getByRole("heading", { name: "Person with disability" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});

test("writes no review or authority data to browser storage and calls no client application", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/management-platform/statutory-benefit-requests?mpScenario=authenticated&mpBenefitReviewScenario=populated");
  await page.getByRole("button", { name: /Person with disability/ }).click();
  const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, indexedDb: await indexedDB.databases() }));
  expect(JSON.stringify(storage)).not.toMatch(/statutory|permission|evidence|decision/i);
  expect(requests.filter((url) => /webpay|assisted-payment|operator-console/i.test(url))).toEqual([]);
});

function queue() { return { contractVersion, items: [{ requestReference: "30000000-0000-4000-8000-000000000001", decisionCommandReference: decisionReference, parkingSessionReference: "40000000-0000-4000-8000-000000000001", ticketReference: "SAFE-001", siteReference: "71000000-0000-4000-8000-000000000101", siteCode: "SITE-A", siteName: "Development Site Alpha", sourceChannel: "WEBPAY", benefitType: "PWD", status: "PENDING_REVIEW", evidenceRequired: true, evidenceRecorded: true, submittedAt: "2026-08-24T01:00:00Z" }], page: 1, pageSize: 25, totalCount: 1, hasMore: false, correlationId }; }
function detail() { return { ...queue().items[0], contractVersion, requesterAttestation: true, idDocumentType: "PWD_ID", maskedIdReference: "***1234", money: { originalAmountMinorUnits: 123456, discountAmountMinorUnits: 24691, finalPayableAmountMinorUnits: 108765, currency: "PHP" }, version: 7, correlationId }; }
