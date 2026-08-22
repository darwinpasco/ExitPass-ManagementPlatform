import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUiError } from "./apiClient";
import { DashboardPage, dashboardScopeOptions } from "./DashboardPage";
import { dashboardContractVersion, type DashboardCatalog, type DashboardOperationalOverview, type DashboardReportingClient, type DashboardScopeType } from "./dashboardReporting";

const siteA = { siteId: "71000000-0000-0000-0000-000000000101", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Metro North", displayName: "North Parking" };
const siteB = { siteId: "71000000-0000-0000-0000-000000000102", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Metro North", displayName: "South Parking" };

afterEach(() => vi.restoreAllMocks());

describe("Management Dashboard page", () => {
  it("loads the preferred Site scope and renders current server metrics and metadata", async () => {
    const client = clientFor();
    renderPage(client, true, [siteA, siteB], [siteA.siteGroupId!], siteB);

    expect(await screen.findByText("Active Sites")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getAllByText("Freshness: Current").length).toBeGreaterThan(0);
    expect(screen.getByText(/Source: Central Pms Site Registry/)).toBeVisible();
    expect(screen.getByText(/Support reference:/)).toHaveTextContent("93000000-0000-4000-8000-000000000301");
    expect(client.getOperationalOverview).toHaveBeenCalledWith(expect.objectContaining({ scopeType: "SITE", scopeReference: siteB.siteId }), expect.any(AbortSignal));
  });

  it("deduplicates authorized Site Groups and uses controlled labels", () => {
    expect(dashboardScopeOptions([siteA, siteB], [siteA.siteGroupId!, siteA.siteGroupId!]))
      .toContainEqual({ scopeType: "SITE_GROUP", scopeReference: siteA.siteGroupId, label: "Site Group: Metro North" });
    const unknown = dashboardScopeOptions([], ["71000000-0000-0000-0000-000000000901"]);
    expect(unknown[0].label).toMatch(/^Site Group: Site Group \(reference ending /);
  });

  it("does not request an overview when no explicit authorized scope exists", async () => {
    const client = clientFor();
    renderPage(client, true, [], []);
    expect(screen.getByRole("status", { name: "No authorized reporting scope" })).toBeVisible();
    await waitFor(() => expect(client.getCatalog).toHaveBeenCalledOnce());
    expect(client.getOperationalOverview).not.toHaveBeenCalled();
  });

  it("requests and presents the catalog only with reports.view presentation access", async () => {
    const client = clientFor();
    const { rerender } = renderPage(client, false);
    expect(screen.getByRole("status", { name: "Report catalog not available" })).toBeVisible();
    expect(client.getCatalog).not.toHaveBeenCalled();

    rerender(<DashboardPage client={client} canReadCatalog authorizedSites={[siteA]} authorizedSiteGroupReferences={[]} currentSite={siteA} />);
    expect(await screen.findByText("Payment reconciliation summary")).toBeVisible();
    expect(screen.getByText(/Unavailable in this phase/)).toBeVisible();
  });

  it.each([
    ["PARTIAL", "PARTIAL", "Availability: Partial data", "Freshness: Mixed freshness"],
    ["AVAILABLE", "STALE", "Availability: Available", "Freshness: Stale"]
  ] as const)("renders %s availability and %s freshness without reclassification", async (availability, freshness, availabilityText, freshnessText) => {
    const value = overview();
    value.availability = availability;
    value.freshness = freshness;
    value.warnings = ["Controlled warning."];
    value.limitations = ["Controlled limitation."];
    const client = clientFor(value);
    renderPage(client);
    expect((await screen.findAllByText(new RegExp(availabilityText))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(freshnessText)).length).toBeGreaterThan(0);
    expect(screen.getByText("Controlled warning.")).toBeVisible();
    expect(screen.getByText("Controlled limitation.")).toBeVisible();
  });

  it.each([
    ["UNAVAILABLE", "Freshness unavailable"],
    ["NOT_APPLICABLE", "Not applicable"]
  ] as const)("does not fabricate zero metrics for %s sections", async (availability, freshnessLabel) => {
    const value = overview();
    value.sections[0] = { ...value.sections[0], availability, freshness: availability, metrics: [], warnings: ["No authoritative values."] };
    renderPage(clientFor(value));
    expect(await screen.findByText("No authoritative metric values are available for this section.")).toBeVisible();
    expect(screen.queryByText("Active Sites")).not.toBeInTheDocument();
    expect(screen.getAllByText(`Freshness: ${freshnessLabel}`).length).toBeGreaterThan(0);
  });

  it("refreshes explicitly and retains a clearly labeled prior result on retryable failure", async () => {
    const first = overview();
    const client = clientFor(first);
    vi.mocked(client.getOperationalOverview)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(createUiError("integration-unavailable", "DASHBOARD_SOURCE_UNAVAILABLE", "safe", "refresh-support", 503, true));
    renderPage(client);
    await screen.findByText("Active Sites");
    await userEvent.click(screen.getByRole("button", { name: "Refresh operational dashboard" }));
    expect(await screen.findByRole("alert", { name: "Operational source unavailable" })).toHaveTextContent("Previously loaded information is retained");
    expect(screen.getByText(/Previously loaded information\. Generated/)).toBeVisible();
    expect(screen.getByText("Active Sites")).toBeVisible();
  });

  it("reloads for Site Group scope and prevents an older request from replacing it", async () => {
    let resolveSite!: (value: DashboardOperationalOverview) => void;
    const first = new Promise<DashboardOperationalOverview>((resolve) => { resolveSite = resolve; });
    const groupOverview = overview("SITE_GROUP", siteA.siteGroupId!);
    const client = clientFor();
    vi.mocked(client.getOperationalOverview).mockReturnValueOnce(first).mockResolvedValueOnce(groupOverview);
    renderPage(client, true, [siteA], [siteA.siteGroupId!]);

    fireEvent.change(screen.getByLabelText("Reporting scope"), { target: { value: `SITE_GROUP:${siteA.siteGroupId}` } });
    expect(await screen.findByText("Group active Sites")).toBeVisible();
    await act(async () => resolveSite(overview("SITE", siteA.siteId)));
    expect(screen.getByText("Group active Sites")).toBeVisible();
    expect(screen.queryByText("Active Sites")).not.toBeInTheDocument();
  });

  it.each([
    ["MANAGEMENT_DASHBOARD_REPORTING_DISABLED", "Dashboard unavailable"],
    ["CENTRAL_PMS_RBAC_FORBIDDEN", "Dashboard permission denied"],
    ["DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "Reporting scope unavailable"],
    ["DASHBOARD_SOURCE_UNAVAILABLE", "Operational source unavailable"]
  ] as const)("maps %s to a controlled state", async (code, title) => {
    const kind = code === "CENTRAL_PMS_RBAC_FORBIDDEN" ? "permission-denied" : code === "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED" ? "not-found" : "integration-unavailable";
    const client = clientFor();
    vi.mocked(client.getOperationalOverview).mockRejectedValue(createUiError(kind, code, "raw backend detail", "safe-support", code.includes("FORBIDDEN") ? 403 : 503, true));
    renderPage(client);
    expect(await screen.findByRole("alert", { name: title })).not.toHaveTextContent("raw backend detail");
    expect(screen.getByText(/Support reference:/)).toHaveTextContent("safe-support");
  });

  it("does not write reporting data or authority into browser storage", async () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    renderPage(clientFor());
    await screen.findByText("Active Sites");
    expect(localSet).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});

function renderPage(client: DashboardReportingClient, canReadCatalog = true, sites = [siteA], groups = [siteA.siteGroupId!], currentSite = siteA) {
  return render(<DashboardPage client={client} canReadCatalog={canReadCatalog} authorizedSites={sites} authorizedSiteGroupReferences={groups} currentSite={currentSite} />);
}

function clientFor(value = overview()): DashboardReportingClient {
  return {
    getCatalog: vi.fn(async () => catalog()),
    getOperationalOverview: vi.fn(async () => value)
  };
}

function catalog(): DashboardCatalog {
  return {
    contractVersion: dashboardContractVersion,
    generatedAt: "2026-08-21T02:00:00Z",
    reports: [{ reportId: "operational-overview", contractVersion: dashboardContractVersion, displayTitle: "Operational overview", functionalDomain: "Management operations", description: "Current operating posture.", supportedScopeTypes: ["SITE", "SITE_GROUP"], requiredPermission: "dashboard.view", availability: "AVAILABLE", sourceAuthority: "CENTRAL_PMS", privacyClassification: "INTERNAL_OPERATIONAL_AGGREGATE", supportedFilters: ["scopeType", "scopeReference"], freshnessSemantics: "Source-owned timestamps.", warnings: [], limitations: [] }, { reportId: "payment-reconciliation-summary", contractVersion: dashboardContractVersion, displayTitle: "Payment reconciliation summary", functionalDomain: "Payments", description: "Unavailable in phase 1.", supportedScopeTypes: ["SITE", "SITE_GROUP"], requiredPermission: "reports.view", availability: "UNAVAILABLE", sourceAuthority: "PHASE_1_SOURCE_NOT_APPROVED", privacyClassification: "INTERNAL_OPERATIONAL_AGGREGATE", supportedFilters: [], freshnessSemantics: "Unavailable.", warnings: ["No result is available."], limitations: [] }]
  };
}

function overview(scopeType: DashboardScopeType = "SITE", scopeReference = siteA.siteId): DashboardOperationalOverview {
  const group = scopeType === "SITE_GROUP";
  return {
    contractVersion: dashboardContractVersion,
    reportId: "operational-overview",
    requestedScope: { scopeType, scopeReference, displayName: group ? "Metro North" : "North Parking" },
    effectiveScope: { scopeType, scopeReference, displayName: group ? "Metro North" : "North Parking" },
    generatedAt: "2026-08-21T02:00:00Z",
    dataAsOf: "2026-08-21T01:59:00Z",
    availability: "AVAILABLE",
    freshness: "CURRENT",
    correlationId: "93000000-0000-4000-8000-000000000301",
    sections: [{ sectionId: "site-operational-status", displayTitle: "Site operational status", availability: "AVAILABLE", freshness: "CURRENT", sourceAuthority: "CENTRAL_PMS_SITE_REGISTRY", dataAsOf: "2026-08-21T01:59:00Z", metrics: [{ metricId: "sites-active", displayLabel: group ? "Group active Sites" : "Active Sites", value: group ? 2 : 1, unit: "COUNT" }], warnings: [], limitations: [] }],
    warnings: [],
    limitations: []
  };
}
