import { type FormEvent, useEffect, useState } from "react";
import type { ManagementPlatformSite } from "./types";
import type { StatutorySalesBookClient, StatutorySalesBookReport, StatutorySalesBookType } from "./statutorySalesBooks";

export function StatutorySalesBooksPage({ client, currentSite }: { client: StatutorySalesBookClient; currentSite?: ManagementPlatformSite }) {
  const [type, setType] = useState<StatutorySalesBookType>("e2");
  const [month, setMonth] = useState("");
  const [terminal, setTerminal] = useState("");
  const [report, setReport] = useState<StatutorySalesBookReport>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReport(undefined); setError(undefined); }, [currentSite?.siteId, type]);

  async function load(event: FormEvent) {
    event.preventDefault();
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!currentSite || !match || !uuid(terminal)) { setError("Select an authorized Site, month, and valid POS terminal UUID."); return; }
    setBusy(true); setError(undefined);
    try { setReport(await client.read(currentSite.siteId, type, terminal.trim(), Number(match[1]), Number(match[2]))); }
    catch (cause) { setReport(undefined); setError(cause instanceof Error ? cause.message : "The statutory sales book is unavailable."); }
    finally { setBusy(false); }
  }

  async function download(format: "xlsx" | "pdf") {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!currentSite || !match || !report) return;
    setBusy(true); setError(undefined);
    try {
      const blob = await client.download(currentSite.siteId, type, terminal.trim(), Number(match[1]), Number(match[2]), format);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `ANNEX-${type.toUpperCase()}_${month}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report export is unavailable."); }
    finally { setBusy(false); }
  }

  const title = type === "e2" ? "Senior Citizen Sales Book/Report" : "Persons with Disability Sales Book/Report";
  return <div className="paymentReportPage fiscalReportPage">
    <section className="panel paymentReportHeader" aria-labelledby="statutory-sales-book-title">
      <div className="paymentReportTitleRow"><div><p className="eyebrow">BIR Annex {type.toUpperCase()}</p><h2 id="statutory-sales-book-title">{title}</h2><p>Committed Sales Invoices with separately proven LGU 5% or 20% statutory parking discounts.</p></div>{report && <span className={`dashboardBadge availability-${report.summary.reportStatus === "FINAL" ? "available" : "partial"}`}>{report.summary.reportStatus}</span>}</div>
      <div className="reportTabs" role="tablist" aria-label="Statutory sales book"><button type="button" role="tab" aria-selected={type === "e2"} onClick={() => setType("e2")}>Annex E-2</button><button type="button" role="tab" aria-selected={type === "e3"} onClick={() => setType("e3")}>Annex E-3</button></div>
      <form className="paymentReportFilters" onSubmit={load}>
        <label><span>Authorized Site</span><input value={currentSite?.displayName ?? "No authorized Site"} readOnly /></label>
        <label><span>Fiscal month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label><span>POS terminal UUID</span><input value={terminal} onChange={(event) => setTerminal(event.target.value)} placeholder="Registered channel terminal UUID" /></label>
        <button className="primaryButton" type="submit" disabled={busy}>{busy ? "Loading" : "Generate report"}</button>
      </form>
      {error && <p className="fieldError" role="alert">{error}</p>}
    </section>
    {report && <section className="panel paymentReportSection" aria-label={`${type.toUpperCase()} report`}>
      <div className="sectionHeader"><div><p className="eyebrow">{report.summary.isEmpty ? "Valid empty report" : "Authoritative fiscal rows"}</p><h3>{report.summary.posTerminalNumber} - {String(report.summary.calendarMonth).padStart(2, "0")}/{report.summary.calendarYear}</h3></div><div><button className="secondaryButton" type="button" disabled={busy} onClick={() => void download("xlsx")}>Download XLSX</button> <button className="secondaryButton" type="button" disabled={busy} onClick={() => void download("pdf")}>Print PDF</button></div></div>
      {report.summary.warnings.map((warning) => <p className="dashboardWarning" key={warning}>{warning}</p>)}
      {report.summary.isEmpty ? <p className="sectionUnavailable">No qualifying transactions exist for this Site, terminal, and fiscal month. Totals are PHP 0.00.</p> : <ReportTable report={report} />}
      <dl className="dashboardTimestamps paymentReportMetadata fiscalReportMetadata" aria-label="Report totals"><Total label="Transactions" value={String(report.summary.qualifyingTransactionCount)} /><Total label="Fiscal periods" value={`${report.summary.committedZPeriodCount}/${report.summary.scopedFiscalPeriodCount} finalized`} /><Total label="Sales inclusive of VAT" value={money(report.summary.salesInclusiveVatMinorUnits)} /><Total label="VAT amount" value={money(report.summary.vatAmountMinorUnits)} /><Total label="VAT exempt sales" value={money(report.summary.vatExemptSalesMinorUnits)} /><Total label="5% discount" value={money(report.summary.discount5MinorUnits)} /><Total label="20% discount" value={money(report.summary.discount20MinorUnits)} /><Total label="Net sales" value={money(report.summary.netSalesMinorUnits)} /></dl>
    </section>}
  </div>;
}

function ReportTable({ report }: { report: StatutorySalesBookReport }) { return <div className="paymentTableScroll"><table className="paymentReportTable"><caption>{report.summary.type === "AnnexE2" ? "Annex E-2 qualifying Sales Invoices" : "Annex E-3 qualifying Sales Invoices"}</caption><thead><tr>{["Date", "Beneficiary", "ID Number", "TIN", "SI Number", "Sales", "VAT", "VAT Exempt", "5%", "20%", "Net Sales"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr key={row.fiscalDocumentId}><td>{row.transactionDate}</td><td>{row.beneficiaryFullName}</td><td>{row.statutoryIdNumber}</td><td>{row.beneficiaryTin || "Not provided"}</td><td>{row.salesInvoiceNumber}</td><td>{money(row.salesInclusiveVatMinorUnits)}</td><td>{money(row.vatAmountMinorUnits)}</td><td>{money(row.vatExemptSalesMinorUnits)}</td><td>{money(row.discount5MinorUnits)}</td><td>{money(row.discount20MinorUnits)}</td><td>{money(row.netSalesMinorUnits)}</td></tr>)}</tbody></table></div>; }
function Total({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100); }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()); }
