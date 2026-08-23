import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createUiError } from "./apiClient";
import { FiscalExceptionReportPage } from "./FiscalExceptionReportPage";
import { fiscalExceptionFixture, type FiscalExceptionReportingClient } from "./fiscalExceptionReporting";

const site = { siteId: "71000000-0000-0000-0000-000000000101", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Metro North", displayName: "North Parking" };
const secondSite = { siteId: "71000000-0000-0000-0000-000000000102", siteGroupId: site.siteGroupId, siteGroupDisplayName: "Metro North", displayName: "South Parking" };
const period = { periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-08-02T00:00:00Z" };

function clientFor(name: "partial" | "site-group" | "no-activity" = "partial"): FiscalExceptionReportingClient {
  return { getSummary: vi.fn(async (scope, requestedPeriod) => fiscalExceptionFixture(scope, requestedPeriod, name)) };
}

function renderPage(client: FiscalExceptionReportingClient, sites = [site, secondSite], groups = [site.siteGroupId!]) {
  return render(<FiscalExceptionReportPage client={client} authorizedSites={sites} authorizedSiteGroupReferences={groups} currentSite={site} initialPeriod={period} />);
}

describe("FiscalExceptionReportPage", () => {
  it("renders visible PARTIAL source coverage, cohort, and time-basis semantics", async () => {
    renderPage(clientFor());
    expect((await screen.findAllByText("Availability: Partial")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Partial Central PMS view" })).toBeVisible();
    expect(screen.getByText(/active Sales Invoice issuance references first recorded/i)).toBeVisible();
    expect(screen.getByText("Issuance reference first recorded at")).toBeVisible();
    expect(screen.getByText(/does not query Site POS Servers live/i)).toBeVisible();
  });

  it("renders every lifecycle state with qualified meanings", async () => {
    renderPage(clientFor());
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    for (const label of ["Not required", "Pending", "Requested", "Issued", "Failed", "Reference conflict", "Outcome unavailable", "Manual review", "Exception released", "Other"]) {
      expect(screen.getByText(label, { selector: "th" })).toBeVisible();
    }
    expect(screen.getByText(/does not prove printing, delivery, or customer receipt/i)).toBeVisible();
    expect(screen.getByText(/Pending issuance references aren’t classified as exceptions/i)).toBeVisible();
  });

  it("renders currency-separated expected amounts without a mixed-currency total", async () => {
    renderPage(clientFor());
    expect(await screen.findByRole("heading", { name: "PHP" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "USD" })).toBeVisible();
    expect(screen.getAllByText("Expected issuance amount")).toHaveLength(2);
    expect(screen.queryByText(/grand total/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Currencies are never combined or converted/i)).toBeVisible();
  });

  it("renders every implemented exception category and affected expected amounts", async () => {
    renderPage(clientFor());
    for (const label of ["Sales Invoice issuance failed", "Sales Invoice reference conflict", "Sales Invoice outcome unavailable"]) {
      expect(await screen.findByRole("heading", { name: label })).toBeVisible();
    }
    expect(screen.getAllByText(/Affected expected amount/)).toHaveLength(3);
    expect(screen.getByText(/do not certify BIR compliance/i)).toBeVisible();
  });

  it("qualifies zero implemented findings under partial coverage", async () => {
    const client: FiscalExceptionReportingClient = { getSummary: vi.fn(async (scope, requestedPeriod) => ({ ...fiscalExceptionFixture(scope, requestedPeriod), exceptionSummaries: fiscalExceptionFixture(scope, requestedPeriod, "no-activity").exceptionSummaries })) };
    renderPage(client);
    expect(await screen.findByText(/No implemented Central PMS exception condition was detected/i)).toHaveTextContent("Some POS Server facts remain unavailable");
    expect(screen.queryByText(/^No fiscal exceptions/i)).not.toBeInTheDocument();
  });

  it("renders unavailable facts as not available rather than zero", async () => {
    renderPage(clientFor());
    expect(await screen.findByRole("heading", { name: "Not available in this report" })).toBeVisible();
    for (const value of ["Sales Invoice printing", "Digital-copy availability", "Overdue detection without an approved deadline", "BIR compliance certification"]) {
      expect(screen.getByText(value)).toBeVisible();
    }
  });

  it("distinguishes a successful no-activity cohort", async () => {
    renderPage(clientFor("no-activity"));
    expect(await screen.findByRole("status", { name: "No Sales Invoice issuance activity" })).toHaveTextContent("first recorded for the selected scope and period");
    expect(screen.queryByRole("heading", { name: "Expected issuance amounts" })).not.toBeInTheDocument();
    expect(screen.getByText("Availability: No activity")).toBeVisible();
  });

  it.each([
    [createUiError("authentication-required", "DASHBOARD_SESSION_INVALID", "expired", "corr", 401), "Authentication required"],
    [createUiError("permission-denied", "CENTRAL_PMS_RBAC_FORBIDDEN", "denied", "corr", 403), "Permission denied"],
    [createUiError("not-found", "DASHBOARD_SCOPE_NOT_FOUND_OR_DENIED", "missing", "corr", 404), "Reporting scope unavailable"],
    [createUiError("integration-unavailable", "MANAGEMENT_FISCAL_EXCEPTION_REPORTING_DISABLED", "disabled", "corr", 503), "Report disabled"],
    [createUiError("integration-unavailable", "FISCAL_EXCEPTION_SOURCE_UNAVAILABLE", "unavailable", "corr", 503, true), "Report unavailable"],
    [createUiError("malformed-response", "FISCAL_REPORT_RESPONSE_MALFORMED", "bad", "corr"), "Report could not be read"]
  ])("renders controlled error state %#", async (failure, title) => {
    renderPage({ getSummary: vi.fn(async () => { throw failure; }) });
    expect(await screen.findByRole("alert", { name: title })).toHaveTextContent("Support reference: corr");
  });

  it("offers a bounded retry for source failure", async () => {
    const getSummary = vi.fn().mockRejectedValueOnce(createUiError("integration-unavailable", "FISCAL_EXCEPTION_SOURCE_UNAVAILABLE", "unavailable", "corr", 503, true)).mockImplementation(async (scope, requestedPeriod) => fiscalExceptionFixture(scope, requestedPeriod));
    renderPage({ getSummary });
    await userEvent.click(await screen.findByRole("button", { name: "Retry report" }));
    expect(await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" })).toBeVisible();
    expect(getSummary).toHaveBeenCalledTimes(2);
  });

  it("retains prior values with original timestamps after a failed refresh", async () => {
    const getSummary = vi.fn().mockImplementationOnce(async (scope, requestedPeriod) => fiscalExceptionFixture(scope, requestedPeriod)).mockRejectedValueOnce(createUiError("integration-unavailable", "FISCAL_EXCEPTION_SOURCE_UNAVAILABLE", "unavailable", "corr", 503, true));
    renderPage({ getSummary });
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    expect(await screen.findByRole("status", { name: /Previously loaded report/i })).toHaveTextContent("not represented as freshly loaded");
    expect(screen.getByRole("heading", { name: "Sales Invoice issuance lifecycle" })).toBeVisible();
    expect(screen.getAllByText(/Aug 23, 2026/).length).toBeGreaterThan(0);
  });

  it("validates the UTC period before another request and focuses the first control", async () => {
    const client = clientFor();
    renderPage(client);
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    const start = screen.getByLabelText("Period start (UTC)");
    await userEvent.clear(start);
    await userEvent.type(start, "2026-08-03T00:00");
    await userEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Period end must be later");
    expect(start).toHaveFocus();
    expect(client.getSummary).toHaveBeenCalledTimes(1);
  });

  it("does not request without an explicit authorized scope and exposes no GLOBAL choice", async () => {
    const client = clientFor();
    renderPage(client, [], []);
    expect(screen.getByRole("status", { name: "No authorized reporting scope" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /GLOBAL/i })).not.toBeInTheDocument();
  });

  it("requests Site Group scope explicitly", async () => {
    const client = clientFor("site-group");
    renderPage(client);
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    await userEvent.selectOptions(screen.getByLabelText("Reporting scope"), `SITE_GROUP:${site.siteGroupId}`);
    await waitFor(() => expect(client.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ scopeType: "SITE_GROUP", scopeReference: site.siteGroupId }), period, expect.any(AbortSignal)));
  });

  it("suppresses an older scope response", async () => {
    let resolveFirst!: (value: ReturnType<typeof fiscalExceptionFixture>) => void;
    const first = new Promise<ReturnType<typeof fiscalExceptionFixture>>((resolve) => { resolveFirst = resolve; });
    const getSummary = vi.fn().mockImplementationOnce(() => first).mockImplementation(async (scope, requestedPeriod) => fiscalExceptionFixture(scope, requestedPeriod));
    renderPage({ getSummary });
    await userEvent.selectOptions(screen.getByLabelText("Reporting scope"), `SITE:${secondSite.siteId}`);
    expect(await screen.findByText(/South Parking/)).toBeVisible();
    resolveFirst(fiscalExceptionFixture({ scopeType: "SITE", scopeReference: site.siteId }, period));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/South Parking/)).toBeVisible();
  });

  it("writes no report or authority state to browser storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    renderPage(clientFor());
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    expect(storageWrite).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    storageWrite.mockRestore();
  });

  it("does not render unexpected transaction-level fields", async () => {
    const client: FiscalExceptionReportingClient = { getSummary: vi.fn(async (scope, requestedPeriod) => ({ ...fiscalExceptionFixture(scope, requestedPeriod), salesInvoiceNumber: "SI-SECRET", payerIdentity: "Sensitive Person", vehiclePlate: "TEST-PLATE", providerReference: "raw-provider" }) as ReturnType<typeof fiscalExceptionFixture>) };
    renderPage(client);
    await screen.findByRole("heading", { name: "Sales Invoice issuance lifecycle" });
    expect(document.body).not.toHaveTextContent("SI-SECRET");
    expect(document.body).not.toHaveTextContent("Sensitive Person");
    expect(document.body).not.toHaveTextContent("TEST-PLATE");
    expect(document.body).not.toHaveTextContent("raw-provider");
  });
});
