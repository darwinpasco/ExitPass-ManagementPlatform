import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatutorySalesBooksPage } from "./StatutorySalesBooksPage";
import type { StatutorySalesBookClient, StatutorySalesBookReport } from "./statutorySalesBooks";

const site = { siteId: "77000000-0000-4000-8000-000000000002", displayName: "PITX Level 3" };
const terminal = "b71f74f7-8e56-5fda-b257-5d9823ab8520";

describe("StatutorySalesBooksPage", () => {
  it("shows committed rows and authoritative totals without recalculating them", async () => {
    const client = fixture(report(false));
    render(<StatutorySalesBooksPage client={client} currentSite={site} />);
    fireEvent.change(screen.getByLabelText("Fiscal month"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("POS terminal UUID"), { target: { value: terminal } });
    await userEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => expect(client.read).toHaveBeenCalledWith(site.siteId, "e2", terminal, 2026, 10));
    expect(screen.getByRole("table", { name: "Annex E-2 qualifying Sales Invoices" })).toHaveTextContent("Synthetic Senior");
    expect(screen.getByLabelText("Report totals")).toHaveTextContent("20% discount₱20.00");
    expect(screen.getByText("FINAL")).toBeVisible();
  });

  it("distinguishes a valid empty report from a generation failure", async () => {
    const client = fixture(report(true));
    render(<StatutorySalesBooksPage client={client} currentSite={site} />);
    fireEvent.change(screen.getByLabelText("Fiscal month"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("POS terminal UUID"), { target: { value: terminal } });
    await userEvent.click(screen.getByRole("button", { name: "Generate report" }));

    expect(await screen.findByText(/No qualifying transactions exist/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Report totals")).toHaveTextContent("Net sales₱0.00");
  });
});

function fixture(value: StatutorySalesBookReport): StatutorySalesBookClient {
  return { read: vi.fn(async () => value), download: vi.fn(async () => new Blob()) };
}

function report(empty: boolean): StatutorySalesBookReport {
  const rows = empty ? [] : [{ fiscalDocumentId: "91000000-0000-4000-8000-000000000010", transactionDate: "2026-10-17", beneficiaryFullName: "Synthetic Senior", statutoryIdNumber: "SC-TEST-001", beneficiaryTin: null, salesInvoiceNumber: "SI-00000000000117", salesInclusiveVatMinorUnits: 10000, vatAmountMinorUnits: 1071, vatExemptSalesMinorUnits: 0, discount5MinorUnits: 0, discount20MinorUnits: 2000, netSalesMinorUnits: 8000 }];
  return { summary: { type: "AnnexE2", currencyCode: "PHP", calendarYear: 2026, calendarMonth: 10, posTerminalNumber: "PITX-L3-WEBPAY-01", qualifyingTransactionCount: rows.length, salesInclusiveVatMinorUnits: empty ? 0 : 10000, vatAmountMinorUnits: empty ? 0 : 1071, vatExemptSalesMinorUnits: 0, discount5MinorUnits: 0, discount20MinorUnits: empty ? 0 : 2000, netSalesMinorUnits: empty ? 0 : 8000, reportAsOf: "2026-10-17T08:00:00Z", warnings: [], reportStatus: "FINAL", isEmpty: empty, scopedFiscalPeriodCount: 31, closedFiscalPeriodCount: 31, committedZPeriodCount: 31 }, rows };
}
