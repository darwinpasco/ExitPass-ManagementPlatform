import type { CentralPmsApiClient } from "./types";

export const statutorySalesBooksRoute = "/management-platform/fiscal-reporting/statutory-sales-books";
export type StatutorySalesBookType = "e2" | "e3";

export interface StatutorySalesBookRow {
  fiscalDocumentId: string;
  transactionDate: string;
  beneficiaryFullName: string;
  statutoryIdNumber: string;
  beneficiaryTin?: string | null;
  salesInvoiceNumber: string;
  salesInclusiveVatMinorUnits: number;
  vatAmountMinorUnits: number;
  vatExemptSalesMinorUnits: number;
  discount5MinorUnits: number;
  discount20MinorUnits: number;
  netSalesMinorUnits: number;
}

export interface StatutorySalesBookReport {
  summary: {
    type: "AnnexE2" | "AnnexE3";
    currencyCode: "PHP";
    calendarYear: number;
    calendarMonth: number;
    posTerminalNumber: string;
    qualifyingTransactionCount: number;
    salesInclusiveVatMinorUnits: number;
    vatAmountMinorUnits: number;
    vatExemptSalesMinorUnits: number;
    discount5MinorUnits: number;
    discount20MinorUnits: number;
    netSalesMinorUnits: number;
    reportAsOf: string;
    warnings: string[];
    reportStatus: "PRELIMINARY" | "FINAL";
    isEmpty: boolean;
    scopedFiscalPeriodCount: number;
    closedFiscalPeriodCount: number;
    committedZPeriodCount: number;
  };
  rows: StatutorySalesBookRow[];
}

export interface StatutorySalesBookClient {
  read(siteId: string, type: StatutorySalesBookType, channelTerminalId: string, year: number, month: number, signal?: AbortSignal): Promise<StatutorySalesBookReport>;
  download(siteId: string, type: StatutorySalesBookType, channelTerminalId: string, year: number, month: number, format: "xlsx" | "pdf", signal?: AbortSignal): Promise<Blob>;
}

export function createStatutorySalesBookClient(api: CentralPmsApiClient): StatutorySalesBookClient {
  const path = (siteId: string, type: StatutorySalesBookType, terminal: string, year: number, month: number, suffix = "") => {
    const query = new URLSearchParams({ channelTerminalId: terminal, calendarYear: String(year), calendarMonth: String(month) });
    return `/v1/management-platform/fiscal-reporting/sites/${encodeURIComponent(siteId)}/annex-e/${type}/statutory-sales-book${suffix}?${query}`;
  };
  return {
    async read(siteId, type, terminal, year, month, signal) {
      const value = await api.request<unknown>(path(siteId, type, terminal, year, month), { signal, requireJsonContentType: true });
      return parseEnvelope(value, type);
    },
    async download(siteId, type, terminal, year, month, format, signal) {
      if (!api.requestBlob) throw new Error("Statutory sales-book downloads are unavailable.");
      return api.requestBlob(`${path(siteId, type, terminal, year, month, "/download")}&format=${format}`, {
        signal,
        allowedBlobContentTypes: format === "pdf"
          ? ["application/pdf"]
          : ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
      });
    }
  };
}

function parseEnvelope(value: unknown, requestedType: StatutorySalesBookType): StatutorySalesBookReport {
  const envelope = record(value);
  if (envelope.succeeded !== true || envelope.code !== "statutory_sales_book_read") throw malformed();
  const report = record(envelope.report);
  const summary = record(report.summary);
  const expectedType = requestedType === "e2" ? "AnnexE2" : "AnnexE3";
  if (summary.type !== expectedType || summary.currencyCode !== "PHP") throw malformed();
  const status = text(summary.reportStatus);
  if (status !== "PRELIMINARY" && status !== "FINAL") throw malformed();
  const warnings = stringArray(summary.warnings);
  if (!Array.isArray(report.rows)) throw malformed();
  const rows = report.rows.map(parseRow);
  const result: StatutorySalesBookReport = {
    summary: {
      type: expectedType,
      currencyCode: "PHP",
      calendarYear: integer(summary.calendarYear),
      calendarMonth: integer(summary.calendarMonth),
      posTerminalNumber: text(summary.posTerminalNumber),
      qualifyingTransactionCount: integer(summary.qualifyingTransactionCount),
      salesInclusiveVatMinorUnits: integer(summary.salesInclusiveVatMinorUnits),
      vatAmountMinorUnits: integer(summary.vatAmountMinorUnits),
      vatExemptSalesMinorUnits: integer(summary.vatExemptSalesMinorUnits),
      discount5MinorUnits: integer(summary.discount5MinorUnits),
      discount20MinorUnits: integer(summary.discount20MinorUnits),
      netSalesMinorUnits: integer(summary.netSalesMinorUnits),
      reportAsOf: text(summary.reportAsOf),
      warnings,
      reportStatus: status,
      isEmpty: summary.isEmpty === true,
      scopedFiscalPeriodCount: integer(summary.scopedFiscalPeriodCount),
      closedFiscalPeriodCount: integer(summary.closedFiscalPeriodCount),
      committedZPeriodCount: integer(summary.committedZPeriodCount)
    },
    rows
  };
  if (result.summary.qualifyingTransactionCount !== rows.length || result.summary.isEmpty !== (rows.length === 0)) throw malformed();
  return result;
}

function parseRow(value: unknown): StatutorySalesBookRow {
  const row = record(value);
  return {
    fiscalDocumentId: text(row.fiscalDocumentId), transactionDate: text(row.transactionDate),
    beneficiaryFullName: text(row.beneficiaryFullName), statutoryIdNumber: text(row.statutoryIdNumber),
    beneficiaryTin: row.beneficiaryTin == null ? null : text(row.beneficiaryTin), salesInvoiceNumber: text(row.salesInvoiceNumber),
    salesInclusiveVatMinorUnits: integer(row.salesInclusiveVatMinorUnits), vatAmountMinorUnits: integer(row.vatAmountMinorUnits),
    vatExemptSalesMinorUnits: integer(row.vatExemptSalesMinorUnits), discount5MinorUnits: integer(row.discount5MinorUnits),
    discount20MinorUnits: integer(row.discount20MinorUnits), netSalesMinorUnits: integer(row.netSalesMinorUnits)
  };
}

function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw malformed(); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string" || value.trim() === "") throw malformed(); return value; }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw malformed(); return value; }
function stringArray(value: unknown): string[] { if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw malformed(); return value as string[]; }
function malformed(): Error { return new Error("The statutory sales-book response did not match the approved contract."); }
