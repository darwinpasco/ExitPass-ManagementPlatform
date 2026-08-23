import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import {
  createDashboardReportingClient,
  dashboardCatalogRoute,
  dashboardContractVersion,
  dashboardOperationalOverviewRoute,
  dashboardOverviewRequestPath,
  parseDashboardCatalog,
  parseDashboardOperationalOverview
} from "./dashboardReporting";
import { fiscalExceptionContractVersion } from "./fiscalExceptionReporting";
import { paymentReconciliationContractVersion } from "./paymentReconciliationReporting";

const siteReference = "71000000-0000-0000-0000-000000000101";
const siteGroupReference = "71000000-0000-0000-0000-000000000900";

describe("Management Dashboard reporting contract", () => {
  it("parses the stable catalog contract and classifications", () => {
    const catalog = parseDashboardCatalog(catalogPayload());
    expect(catalog.contractVersion).toBe(dashboardContractVersion);
    expect(catalog.reports.map((report) => report.reportId)).toEqual([
      "operational-overview",
      "payment-reconciliation-summary",
      "fiscal-exception-summary",
      "management-activity-summary"
    ]);
    expect(catalog.reports.map((report) => report.contractVersion)).toEqual([
      dashboardContractVersion,
      paymentReconciliationContractVersion,
      fiscalExceptionContractVersion,
      dashboardContractVersion
    ]);
    expect(catalog.reports[3].availability).toBe("UNAVAILABLE");
  });

  it("parses authoritative overview metrics, source, scope, and freshness", () => {
    const overview = parseDashboardOperationalOverview(overviewPayload("SITE", siteReference));
    expect(overview.requestedScope).toMatchObject({ scopeType: "SITE", scopeReference: siteReference });
    expect(overview.sections[0]).toMatchObject({ sourceAuthority: "CENTRAL_PMS_SITE_REGISTRY", freshness: "CURRENT" });
    expect(overview.sections[0].metrics[0]).toMatchObject({ metricId: "sites-total", value: 1, unit: "COUNT" });
  });

  it("rejects unsupported versions, malformed classifications, and fabricated unavailable metrics", () => {
    expect(() => parseDashboardCatalog({ ...catalogPayload(), contractVersion: "management-platform-dashboard-reporting:v2" })).toThrow();
    const catalog = catalogPayload();
    catalog.reports[1] = { ...catalog.reports[1], contractVersion: dashboardContractVersion };
    expect(() => parseDashboardCatalog(catalog)).toThrowError(expect.objectContaining({ code: "DASHBOARD_CATALOG_ENTRY_CONTRACT_VERSION_UNSUPPORTED" }));
    expect(() => parseDashboardOperationalOverview({ ...overviewPayload("SITE", siteReference), freshness: "FRESH" })).toThrow();
    const payload = overviewPayload("SITE", siteReference);
    payload.sections[0] = { ...payload.sections[0], availability: "UNAVAILABLE", freshness: "UNAVAILABLE" };
    expect(() => parseDashboardOperationalOverview(payload)).toThrow();
  });

  it("constructs explicit encoded Site and Site Group requests", () => {
    expect(dashboardOverviewRequestPath({ scopeType: "SITE", scopeReference: siteReference }))
      .toBe(`${dashboardOperationalOverviewRoute}?scopeType=SITE&scopeReference=${siteReference}`);
    expect(dashboardOverviewRequestPath({ scopeType: "SITE_GROUP", scopeReference: siteGroupReference }))
      .toBe(`${dashboardOperationalOverviewRoute}?scopeType=SITE_GROUP&scopeReference=${siteGroupReference}`);
  });

  it("requires a supported explicit scope and UUID-shaped reference", () => {
    expect(() => dashboardOverviewRequestPath({ scopeType: "SITE", scopeReference: "" })).toThrow();
    expect(() => dashboardOverviewRequestPath({ scopeType: "GLOBAL" as "SITE", scopeReference: siteReference })).toThrow();
    expect(() => dashboardOverviewRequestPath({ scopeType: "SITE", scopeReference: "not-a-reference" })).toThrow();
  });

  it("uses relative GET requests, same-origin credentials, and no browser-authored authority headers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      const payload = url === dashboardCatalogRoute ? catalogPayload() : overviewPayload("SITE", siteReference);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createDashboardReportingClient(createCentralPmsApiClient({ fetchImpl }));

    await client.getCatalog();
    await client.getOperationalOverview({ scopeType: "SITE", scopeReference: siteReference });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(String(url)).toMatch(/^\/v1\/management-platform\/dashboard\//);
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("same-origin");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("X-ExitPass-User-Id")).toBeNull();
      expect(headers.get("X-Management-Platform-Permissions")).toBeNull();
      expect(headers.get("X-Management-Platform-Site-Id")).toBeNull();
    }
  });

  it("rejects an overview response bound to another requested scope", async () => {
    const apiClient = createCentralPmsApiClient({
      fetchImpl: async () => new Response(JSON.stringify(overviewPayload("SITE_GROUP", siteGroupReference)), { status: 200 })
    });
    await expect(createDashboardReportingClient(apiClient).getOperationalOverview({ scopeType: "SITE", scopeReference: siteReference }))
      .rejects.toMatchObject({ code: "DASHBOARD_SCOPE_RESPONSE_MISMATCH" });
  });
});

function catalogPayload() {
  return {
    contractVersion: dashboardContractVersion,
    generatedAt: "2026-08-21T02:00:00Z",
    reports: [
      catalogEntry("operational-overview", dashboardContractVersion, "Operational overview", "PARTIAL", "dashboard.view"),
      catalogEntry("payment-reconciliation-summary", paymentReconciliationContractVersion, "Payment reconciliation summary", "PARTIAL", "reconciliation.view"),
      catalogEntry("fiscal-exception-summary", fiscalExceptionContractVersion, "Fiscal exception summary", "PARTIAL", "sales-invoice-report.view"),
      catalogEntry("management-activity-summary", dashboardContractVersion, "Management activity summary", "UNAVAILABLE", "reports.view")
    ]
  };
}

function catalogEntry(reportId: string, contractVersion: string, displayTitle: string, availability: string, requiredPermission: string) {
  return {
    reportId,
    contractVersion,
    displayTitle,
    functionalDomain: "Management operations",
    description: "Controlled report capability.",
    supportedScopeTypes: ["SITE", "SITE_GROUP"],
    requiredPermission,
    availability,
    sourceAuthority: "CENTRAL_PMS",
    privacyClassification: "INTERNAL_OPERATIONAL_AGGREGATE",
    supportedFilters: ["scopeType", "scopeReference"],
    freshnessSemantics: "Source-owned timestamps.",
    warnings: availability === "UNAVAILABLE" ? ["Not available in phase 1."] : [],
    limitations: []
  };
}

function overviewPayload(scopeType: "SITE" | "SITE_GROUP", scopeReference: string) {
  return {
    contractVersion: dashboardContractVersion,
    reportId: "operational-overview",
    requestedScope: { scopeType, scopeReference, displayName: "Authorized reporting scope" },
    effectiveScope: { scopeType, scopeReference, displayName: "Authorized reporting scope" },
    generatedAt: "2026-08-21T02:00:00Z",
    dataAsOf: "2026-08-21T01:59:00Z",
    availability: "AVAILABLE",
    freshness: "CURRENT",
    correlationId: "93000000-0000-4000-8000-000000000301",
    sections: [{
      sectionId: "site-operational-status",
      displayTitle: "Site operational status",
      availability: "AVAILABLE",
      freshness: "CURRENT",
      sourceAuthority: "CENTRAL_PMS_SITE_REGISTRY",
      dataAsOf: "2026-08-21T01:59:00Z",
      metrics: [{ metricId: "sites-total", displayLabel: "Sites", value: 1, unit: "COUNT" }],
      warnings: [],
      limitations: []
    }],
    warnings: [],
    limitations: []
  };
}
