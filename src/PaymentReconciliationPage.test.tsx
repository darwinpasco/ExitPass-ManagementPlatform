import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createUiError } from "./apiClient";
import { PaymentReconciliationPage } from "./PaymentReconciliationPage";
import { paymentReconciliationFixture, type PaymentReconciliationReportingClient } from "./paymentReconciliationReporting";

const site = { siteId: "71000000-0000-0000-0000-000000000101", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Metro North", displayName: "North Parking" };
const secondSite = { siteId: "71000000-0000-0000-0000-000000000102", siteGroupId: site.siteGroupId, siteGroupDisplayName: "Metro North", displayName: "South Parking" };
const period = { periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-08-02T00:00:00Z" };

function renderPage(client: PaymentReconciliationReportingClient, sites = [site, secondSite], groups = [site.siteGroupId!]) {
  return render(<PaymentReconciliationPage client={client} authorizedSites={sites} authorizedSiteGroupReferences={groups} currentSite={site} initialPeriod={period} />);
}

function clientFor(name: Parameters<typeof paymentReconciliationFixture>[2] = "current"): PaymentReconciliationReportingClient {
  return { getSummary: vi.fn(async (scope, requestedPeriod) => paymentReconciliationFixture(scope, requestedPeriod, name)) };
}

describe("PaymentReconciliationPage", () => {
  it("renders currency-separated attempts and confirmed payments without a mixed-currency total", async () => {
    renderPage(clientFor());
    expect(await screen.findByRole("heading", { name: "PHP" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USD" })).toBeInTheDocument();
    expect(screen.getAllByText("Payment attempts")).toHaveLength(2);
    expect(screen.getAllByText("Confirmed payment amount")).toHaveLength(2);
    expect(screen.queryByText(/grand total/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Currencies are never combined/i)).toBeInTheDocument();
  });

  it("renders attempt and confirmation statuses separately and preserves OTHER", async () => {
    renderPage(clientFor());
    expect(await screen.findByRole("heading", { name: "Payment attempt statuses" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confirmed payment statuses" })).toBeInTheDocument();
    expect(screen.getByText("OTHER")).toBeInTheDocument();
    expect(screen.getByText("Recorded")).toBeInTheDocument();
  });

  it("keeps digital and cash channels distinct without settlement language", async () => {
    renderPage(clientFor());
    expect(await screen.findByText("WebPay")).toBeInTheDocument();
    expect(screen.getByText("APT cash")).toBeInTheDocument();
    expect(screen.getByText("Cash", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/not provider settlement or cash-custody confirmation/i)).toBeInTheDocument();
  });

  it("shows provider absence explicitly", async () => {
    const client: PaymentReconciliationReportingClient = { getSummary: vi.fn(async (scope, requestedPeriod) => ({ ...paymentReconciliationFixture(scope, requestedPeriod), providerSummaries: [] })) };
    renderPage(client);
    expect(await screen.findByText("Provider information is not available for the selected activity.")).toBeInTheDocument();
  });

  it("renders every supported reconciliation category and highlights findings", async () => {
    renderPage(clientFor());
    for (const label of ["Amount mismatch", "Currency mismatch", "Duplicate provider reference", "Confirmed outcome without confirmation", "Confirmation and attempt status inconsistency"]) {
      expect(await screen.findByRole("heading", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("4 findings")).toBeInTheDocument();
  });

  it("uses a qualified zero-findings message for partial source coverage", async () => {
    const client: PaymentReconciliationReportingClient = { getSummary: vi.fn(async (scope, requestedPeriod) => ({ ...paymentReconciliationFixture(scope, requestedPeriod, "partial"), internalReconciliationSummaries: paymentReconciliationFixture(scope, requestedPeriod, "no-activity").internalReconciliationSummaries })) };
    renderPage(client);
    expect(await screen.findByText(/not an all-clear result/i)).toBeInTheDocument();
    expect(screen.queryByText(/^No internal mismatches were detected/)).not.toBeInTheDocument();
  });

  it("distinguishes no activity from unavailable reporting", async () => {
    const { unmount } = renderPage(clientFor("no-activity"));
    expect(await screen.findByRole("status", { name: "No payment activity" })).toHaveTextContent("No payment activity was recorded");
    unmount();
    renderPage(clientFor("unavailable"));
    expect(await screen.findByRole("status", { name: "Report unavailable" })).toHaveTextContent("could not provide authoritative");
    expect(screen.queryByRole("heading", { name: "Payment activity summary" })).not.toBeInTheDocument();
  });

  it.each([
    ["feature-disabled", createUiError("feature-disabled", "MANAGEMENT_PAYMENT_RECONCILIATION_REPORTING_DISABLED", "disabled", "corr", 503), "Report disabled"],
    ["permission-denied", createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "denied", "corr", 403), "Permission denied"],
    ["scope-denied", createUiError("not-found", "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "missing", "corr", 404), "Reporting scope unavailable"],
    ["malformed", createUiError("malformed-response", "PAYMENT_REPORT_RESPONSE_MALFORMED", "bad", "corr"), "Report could not be read"]
  ])("renders a controlled %s state", async (_name, failure, title) => {
    renderPage({ getSummary: vi.fn(async () => { throw failure; }) });
    expect(await screen.findByRole("alert", { name: title })).toHaveTextContent("Support reference: corr");
  });

  it("offers bounded retry for a retryable failure", async () => {
    const getSummary = vi.fn()
      .mockRejectedValueOnce(createUiError("integration-unavailable", "PAYMENT_RECONCILIATION_SOURCE_UNAVAILABLE", "unavailable", "corr", 503, true))
      .mockImplementation(async (scope, requestedPeriod) => paymentReconciliationFixture(scope, requestedPeriod));
    renderPage({ getSummary });
    await userEvent.click(await screen.findByRole("button", { name: "Retry report" }));
    expect(await screen.findByRole("heading", { name: "Payment activity summary" })).toBeInTheDocument();
    expect(getSummary).toHaveBeenCalledTimes(2);
  });

  it("validates period order before issuing another request and focuses the input", async () => {
    const client = clientFor();
    renderPage(client);
    await screen.findByRole("heading", { name: "Payment activity summary" });
    const start = screen.getByLabelText("Period start (UTC)");
    await userEvent.clear(start);
    await userEvent.type(start, "2026-08-03T00:00");
    await userEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Period end must be later");
    expect(start).toHaveFocus();
    expect(client.getSummary).toHaveBeenCalledTimes(1);
  });

  it("does not request the report without an explicit authorized scope", async () => {
    const client = clientFor();
    renderPage(client, [], []);
    expect(screen.getByRole("status", { name: "No authorized reporting scope" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /GLOBAL/i })).not.toBeInTheDocument();
  });

  it("requests SITE_GROUP explicitly when selected", async () => {
    const client = clientFor("site-group");
    renderPage(client);
    await screen.findByRole("heading", { name: "Payment activity summary" });
    await userEvent.selectOptions(screen.getByLabelText("Reporting scope"), `SITE_GROUP:${site.siteGroupId}`);
    await waitFor(() => expect(client.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ scopeType: "SITE_GROUP", scopeReference: site.siteGroupId }), period, expect.any(AbortSignal)));
  });

  it("prevents an older scope response from replacing the selected report", async () => {
    let resolveFirst!: (value: ReturnType<typeof paymentReconciliationFixture>) => void;
    const first = new Promise<ReturnType<typeof paymentReconciliationFixture>>((resolve) => { resolveFirst = resolve; });
    const getSummary = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementation(async (scope, requestedPeriod) => paymentReconciliationFixture(scope, requestedPeriod));
    renderPage({ getSummary });
    await userEvent.selectOptions(screen.getByLabelText("Reporting scope"), `SITE:${secondSite.siteId}`);
    expect(await screen.findByText(/South Parking/)).toBeInTheDocument();
    resolveFirst(paymentReconciliationFixture({ scopeType: "SITE", scopeReference: site.siteId }, period));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/South Parking/)).toBeInTheDocument();
  });

  it("does not persist report data or authority in browser storage", async () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    renderPage(clientFor());
    await screen.findByRole("heading", { name: "Payment activity summary" });
    expect(localSet).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    localSet.mockRestore();
  });

  it("does not render unexpected sensitive transaction fields", async () => {
    const client: PaymentReconciliationReportingClient = {
      getSummary: vi.fn(async (scope, requestedPeriod) => ({
        ...paymentReconciliationFixture(scope, requestedPeriod),
        payerName: "Sensitive Payer",
        vehiclePlate: "TEST-PLATE",
        ticketReference: "raw-ticket-reference",
        providerReference: "raw-provider-reference"
      }) as ReturnType<typeof paymentReconciliationFixture>)
    };

    renderPage(client);
    expect(await screen.findByRole("heading", { name: "Payment activity summary" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Sensitive Payer");
    expect(document.body).not.toHaveTextContent("TEST-PLATE");
    expect(document.body).not.toHaveTextContent("raw-ticket-reference");
    expect(document.body).not.toHaveTextContent("raw-provider-reference");
  });
});
