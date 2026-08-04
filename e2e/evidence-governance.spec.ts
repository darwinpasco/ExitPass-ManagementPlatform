import { expect, test, type Page, type Request } from "@playwright/test";

const route = "/management-platform/statutory-evidence-governance";
const apiPath = "/v1/ops/management-platform/statutory-discounts/evidence-governance";
const forbiddenMutationControls = /Create|Edit|Enable|Disable|Upload|Preview|Download|Approve|Reject|Lock|Hold|Delete|Request deletion|Change retention|Change media|Change storage|Change entitlement/i;
const forbiddenHeaders = [
  "authorization",
  "x-exitpass-permissions",
  "x-management-platform-permissions",
  "x-exitpass-service-identity-id",
  "x-exitpass-user-id",
  "x-exitpass-site-id",
  "x-exitpass-site-group-id",
  "x-management-platform-site-id",
  "x-management-platform-site-group-id"
];

test.describe("Management Platform statutory evidence governance read-only workspace", () => {
  test("authorized workspace renders governance, readiness, filters, detail, warnings, and support reference", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoScenario(page, "ready");

    await expect(page.getByRole("button", { name: /Evidence Governance Read-only readiness/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Statutory Evidence Governance" })).toBeVisible();
    await expect(page.getByText("Central PMS authoritative governance read model")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Development Site Alpha" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Development Site Beta" })).toBeVisible();
    await expect(page.getByText("Configured and ready").last()).toBeVisible();
    await expect(page.getByText("Configured, partially ready").last()).toBeVisible();
    await expect(page.getByRole("button", { name: forbiddenMutationControls })).toHaveCount(0);

    await page.locator("#evidence-governance-entitlement").selectOption("PWD");
    await page.locator("#evidence-governance-status").selectOption("CONFIGURED_PARTIALLY_READY");
    await page.locator("#evidence-governance-readiness").selectOption("PARTIALLY_READY");
    await page.locator("#evidence-governance-capture").selectOption("ENABLED");
    await page.locator("#evidence-governance-freshness").selectOption("FRESH");
    await page.getByLabel("Search returned safe fields").fill("Beta");
    await expect(page.getByRole("heading", { name: "Development Site Beta" })).toBeVisible();

    await page.locator("#evidence-governance-status").selectOption("ALL");
    await page.locator("#evidence-governance-readiness").selectOption("ALL");
    await page.getByLabel("Search returned safe fields").fill("");
    const detailTrigger = page.getByRole("button", { name: "Open details for Development Site Alpha" });
    await detailTrigger.click();
    const dialog = page.getByRole("dialog", { name: "Development Site Alpha" });
    await expect(dialog).toContainText("management-platform-statutory-evidence-governance:v1");
    await expect(dialog).toContainText("Protected-storage posture");
    await expect(dialog).toContainText("Lifecycle capability matrix");
    await page.getByRole("button", { name: "Copy support reference" }).click();
    await expect(page.getByText("Support reference copied.")).toBeVisible();
    await page.getByRole("button", { name: "Close evidence governance details" }).click();
    await expect(detailTrigger).toBeFocused();
  });

  test("safe scenarios remain distinct and retry appears only for retryable failures", async ({ page }) => {
    const states: Array<[string, string, "status" | "alert"]> = [
      ["partially-ready", "Configured, partially ready", "status"],
      ["incomplete", "Configuration incomplete", "status"],
      ["capture-disabled", "Capture disabled", "status"],
      ["configuration-unavailable", "Configuration unavailable", "status"],
      ["stale", "Stale authoritative response", "status"],
      ["unknown", "Unknown readiness classification", "status"],
      ["empty-scope", "Empty authorized scope", "status"],
      ["site-denied", "Site scope denied", "alert"],
      ["site-group-denied", "Site Group scope denied", "alert"],
      ["malformed", "Evidence governance response malformed", "alert"],
      ["unavailable", "Evidence governance unavailable", "alert"],
      ["transient-failure", "Evidence governance unavailable", "alert"]
    ];

    for (const [scenario, name, role] of states) {
      await page.goto(`${route}?mpScenario=authenticated&mpEvidenceGovernanceScenario=${scenario}`);
      if (role === "alert") {
        await expect(page.getByRole("alert", { name })).toBeVisible();
      } else if (
        name === "Configured, partially ready" ||
        name === "Configuration incomplete" ||
        name === "Capture disabled" ||
        name === "Configuration unavailable"
      ) {
        await expect(page.getByText(name).last()).toBeVisible();
      } else {
        await expect(page.getByRole("status", { name })).toBeVisible();
      }
    }

    await page.goto(`${route}?mpScenario=authenticated&mpEvidenceGovernanceScenario=permission-denied`);
    await expect(page.getByRole("alert", { name: "Evidence governance permission denied" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry evidence governance" })).toHaveCount(0);
    await page.goto(`${route}?mpScenario=authenticated&mpEvidenceGovernanceScenario=unavailable`);
    await expect(page.getByRole("button", { name: "Retry evidence governance" })).toBeVisible();
  });

  test("direct navigation without the dedicated permission fails closed", async ({ page }) => {
    await page.goto(`${route}?mpScenario=permission-denied&mpEvidenceGovernanceScenario=ready`);
    await expect(page.getByRole("alert", { name: "Permission denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Statutory Evidence Governance" })).toHaveCount(0);
  });

  test("browser uses only the three same-origin GET routes without privileged headers or mutation requests", async ({ page }) => {
    const governanceRequests: Request[] = [];
    const mutationRequests: Request[] = [];
    await page.route(`**${apiPath}**`, async (routeRequest) => {
      await routeRequest.fulfill({ status: 200, headers: { "Content-Type": "application/json", "X-Correlation-Id": "H004-E2E-CORRELATION" }, json: governancePayload() });
    });
    page.on("request", (request) => {
      if (/POST|PUT|PATCH|DELETE/.test(request.method())) {
        mutationRequests.push(request);
      }
      if (request.url().includes(apiPath)) {
        governanceRequests.push(request);
        const headerNames = Object.keys(request.headers()).map((header) => header.toLowerCase());
        forbiddenHeaders.forEach((header) => expect(headerNames).not.toContain(header));
      }
    });

    await page.goto(`${route}?mpScenario=multi-site&mpEvidenceGovernanceScenario=api-boundary`);
    await expect(page.getByRole("heading", { name: "E2E Governance Site" })).toBeVisible();
    await page.locator("#evidence-governance-scope").selectOption("SITE");
    await expect.poll(() => governanceRequests.some((request) => new URL(request.url()).pathname.includes("/sites/"))).toBe(true);
    await page.locator("#evidence-governance-scope").selectOption("SITE_GROUP");
    await expect.poll(() => governanceRequests.some((request) => new URL(request.url()).pathname.includes("/site-groups/"))).toBe(true);

    expect(mutationRequests).toHaveLength(0);
    expect(governanceRequests.length).toBeGreaterThanOrEqual(3);
    for (const request of governanceRequests) {
      const url = new URL(request.url());
      expect(url.origin).toBe(new URL(page.url()).origin);
      expect(url.pathname === apiPath || url.pathname.startsWith(`${apiPath}/sites/`) || url.pathname.startsWith(`${apiPath}/site-groups/`)).toBe(true);
      expect(request.method()).toBe("GET");
    }
  });

  test("browser storage remains non-authoritative and page exposes no customer or storage-internal data", async ({ page }) => {
    await gotoScenario(page, "ready");
    const storage = await page.evaluate(async () => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      indexedDbNames: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((database) => database.name ?? "") : [],
      cacheNames: "caches" in window ? await caches.keys() : []
    }));
    expect(JSON.stringify(storage)).not.toMatch(/evidence-governance|CONFIGURED_READY|I014-H004|statutory-discounts\.evidence-governance\.view/i);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/must-not-enter-browser-contract|synthetic-customer|synthetic-ticket|synthetic-plate|storage\.internal|test-secret-signing-material/i);
    await expect(page.getByRole("button", { name: forbiddenMutationControls })).toHaveCount(0);
  });

  for (const viewport of [
    { name: "desktop", width: 1366, height: 768 },
    { name: "narrow", width: 768, height: 900 },
    { name: "compact", width: 390, height: 844 }
  ]) {
    test(`responsive ${viewport.name} layout has no document-level horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoScenario(page, "ready");
      const heading = page.getByRole("heading", { name: "Statutory Evidence Governance" });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("keyboard-only navigation opens and closes details with focus restoration", async ({ page }) => {
    await gotoScenario(page, "ready");
    const trigger = page.getByRole("button", { name: "Open details for Development Site Alpha" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close evidence governance details" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});

async function gotoScenario(page: Page, scenario: string) {
  await page.goto(`${route}?mpScenario=authenticated&mpEvidenceGovernanceScenario=${scenario}`);
  await expect(page.getByRole("heading", { name: "Evidence-governance Sites" })).toBeVisible();
}

function governancePayload() {
  return {
    contractVersion: "management-platform-statutory-evidence-governance:v1",
    requestedScopeType: null,
    requestedScopeReference: null,
    correlationId: "91400000-0000-0000-0000-000000000301",
    evaluationTimestamp: "2026-08-04T08:00:00Z",
    freshnessStatus: "FRESH",
    stale: false,
    sites: [{
      siteReference: "71000000-0000-0000-0000-000000000101",
      siteDisplayName: "E2E Governance Site",
      siteGroupReference: "71000000-0000-0000-0000-000000000900",
      siteGroupDisplayName: "E2E Governance Site Group",
      entitlementTypesSupported: ["SENIOR_CITIZEN", "PWD"],
      governanceStatus: "CONFIGURED_PARTIALLY_READY",
      readinessStatus: "PARTIALLY_READY",
      evidenceCaptureConfigured: true,
      evidenceCaptureEnabled: true,
      requiredDocumentProfiles: [{ profileCode: "STATUTORY_ID", profileVersion: "v1", retentionClassCode: "STATUTORY_EVIDENCE_STANDARD", retentionPolicyVersion: "v1", retentionPolicyStatus: "APPROVED_ENABLED", retentionPolicyApproved: true }],
      allowedMediaTypes: ["image/jpeg", "image/png"],
      maximumUploadSizeBytes: 5242880,
      uploadAuthorizationTtlSeconds: 300,
      uploadAuthorizationReadiness: "READY",
      uploadFinalizationReadiness: "READY",
      protectedStorageProviderClassification: "S3_COMPATIBLE",
      protectedStorageReadiness: "READY",
      storagePrivateAccessPosture: "PRIVATE_ACCESS_REQUIRED",
      serverSideEncryptionPosture: "REQUIRED_VERIFIED",
      checksumVerificationReadiness: "READY",
      providerMetadataVerificationReadiness: "READY",
      uploadLifecycleReadiness: "READY",
      validationLifecycleReadiness: "READY",
      malwareScanLifecycleReadiness: "READY",
      reviewabilityLifecycleReadiness: "READY",
      bindingLifecycleReadiness: "READY",
      holdLifecycleReadiness: "READY",
      deletionRequestLifecycleReadiness: "READY",
      malwareScanningExecutionReadiness: "NOT_IMPLEMENTED",
      securePreviewReadiness: "NOT_IMPLEMENTED",
      retentionPolicyReadiness: "READY",
      retentionWorkerReadiness: "NOT_IMPLEMENTED",
      deletionWorkerReadiness: "NOT_IMPLEMENTED",
      objectReconciliationReadiness: "NOT_IMPLEMENTED",
      lastEvaluatedAt: "2026-08-04T08:00:00Z",
      configurationUpdatedAt: "2026-08-04T07:55:00Z",
      freshnessStatus: "FRESH",
      stale: false,
      retryable: false,
      supportReference: "I014-H004-E2E-SUPPORT",
      warnings: ["MALWARE_SCANNING_NOT_IMPLEMENTED"],
      blockers: []
    }],
    warnings: [],
    blockers: []
  };
}
