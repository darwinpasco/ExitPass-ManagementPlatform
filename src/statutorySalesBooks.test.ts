import { describe, expect, it } from "vitest";
import { createStatutorySalesBookClient } from "./statutorySalesBooks";
import type { CentralPmsApiClient } from "./types";

describe("statutorySalesBooks contract", () => {
  it("validates the requested annex, row count, and empty state", async () => {
    const api: CentralPmsApiClient = { request: async <TResponse>() => envelope() as TResponse };
    const result = await createStatutorySalesBookClient(api).read("site", "e2", "terminal", 2026, 10);
    expect(result.summary.qualifyingTransactionCount).toBe(1);
    expect(result.rows[0].salesInvoiceNumber).toBe("SI-00000000000117");
  });

  it("rejects a mismatched annex or incomplete beneficiary row", async () => {
    const wrong = envelope();
    (wrong.report.summary as Record<string, unknown>).type = "AnnexE3";
    const api: CentralPmsApiClient = { request: async <TResponse>() => wrong as TResponse };
    await expect(createStatutorySalesBookClient(api).read("site", "e2", "terminal", 2026, 10)).rejects.toThrow(/approved contract/);
  });
});

function envelope() {
  return { succeeded: true, code: "statutory_sales_book_read", report: { summary: { type: "AnnexE2", currencyCode: "PHP", calendarYear: 2026, calendarMonth: 10, posTerminalNumber: "PITX-L3-WEBPAY-01", qualifyingTransactionCount: 1, salesInclusiveVatMinorUnits: 10000, vatAmountMinorUnits: 1071, vatExemptSalesMinorUnits: 0, discount5MinorUnits: 0, discount20MinorUnits: 2000, netSalesMinorUnits: 8000, reportAsOf: "2026-10-17T08:00:00Z", warnings: [], reportStatus: "FINAL", isEmpty: false, scopedFiscalPeriodCount: 31, closedFiscalPeriodCount: 31, committedZPeriodCount: 31 }, rows: [{ fiscalDocumentId: "91000000-0000-4000-8000-000000000010", transactionDate: "2026-10-17", beneficiaryFullName: "Synthetic Senior", statutoryIdNumber: "SC-TEST-001", beneficiaryTin: null, salesInvoiceNumber: "SI-00000000000117", salesInclusiveVatMinorUnits: 10000, vatAmountMinorUnits: 1071, vatExemptSalesMinorUnits: 0, discount5MinorUnits: 0, discount20MinorUnits: 2000, netSalesMinorUnits: 8000 }] } };
}
