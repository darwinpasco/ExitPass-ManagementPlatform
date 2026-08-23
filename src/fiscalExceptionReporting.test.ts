import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import {
  createFiscalExceptionReportingClient,
  fiscalExceptionApiRoute,
  fiscalExceptionContractVersion,
  fiscalExceptionFixture,
  fiscalExceptionRequestPath,
  fiscalExceptionTimeBasis,
  defaultFiscalReportingPeriod,
  maximumFiscalReportingPeriodDays,
  parseFiscalExceptionReport,
  validateFiscalReportingPeriod
} from "./fiscalExceptionReporting";

const site = { scopeType: "SITE" as const, scopeReference: "71000000-0000-0000-0000-000000000101" };
const group = { scopeType: "SITE_GROUP" as const, scopeReference: "71000000-0000-0000-0000-000000000900" };
const period = { periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-08-02T00:00:00Z" };

describe("fiscal exception reporting contract", () => {
  it("constructs explicit encoded SITE and SITE_GROUP GET paths with half-open UTC bounds", () => {
    expect(fiscalExceptionRequestPath(site, period)).toBe(`${fiscalExceptionApiRoute}?scopeType=SITE&scopeReference=71000000-0000-0000-0000-000000000101&periodStart=2026-08-01T00%3A00%3A00Z&periodEnd=2026-08-02T00%3A00%3A00Z`);
    expect(fiscalExceptionRequestPath(group, period)).toContain("scopeType=SITE_GROUP");
    expect(fiscalExceptionRequestPath(group, period)).not.toContain("GLOBAL");
  });

  it("requires explicit supported scope", () => {
    expect(() => fiscalExceptionRequestPath({ scopeType: "GLOBAL" as "SITE", scopeReference: "" }, period)).toThrow(/explicit authorized/i);
  });

  it("validates required ordered UTC periods bounded to 31 days", () => {
    expect(validateFiscalReportingPeriod(period)).toEqual({ valid: true });
    expect(validateFiscalReportingPeriod({ periodStart: "", periodEnd: period.periodEnd })).toMatchObject({ code: "INVALID_FISCAL_EXCEPTION_PERIOD_START" });
    expect(validateFiscalReportingPeriod({ periodStart: period.periodStart, periodEnd: "" })).toMatchObject({ code: "INVALID_FISCAL_EXCEPTION_PERIOD_END" });
    expect(validateFiscalReportingPeriod({ periodStart: "2026-08-01T00:00:00", periodEnd: period.periodEnd })).toMatchObject({ code: "INVALID_FISCAL_EXCEPTION_PERIOD_START" });
    expect(validateFiscalReportingPeriod({ periodStart: period.periodEnd, periodEnd: period.periodEnd })).toMatchObject({ code: "INVALID_FISCAL_EXCEPTION_PERIOD_RANGE" });
    expect(validateFiscalReportingPeriod({ periodStart: period.periodEnd, periodEnd: period.periodStart })).toMatchObject({ code: "INVALID_FISCAL_EXCEPTION_PERIOD_RANGE" });
    expect(maximumFiscalReportingPeriodDays).toBe(31);
    expect(validateFiscalReportingPeriod({ periodStart: period.periodStart, periodEnd: "2026-09-02T00:00:00Z" })).toMatchObject({ code: "FISCAL_EXCEPTION_PERIOD_TOO_LONG" });
  });

  it("normalizes the default period to the same UTC precision used by the controls", () => {
    expect(defaultFiscalReportingPeriod(new Date("2026-08-23T03:00:42.321Z"))).toEqual({ periodStart: "2026-08-22T03:00:00Z", periodEnd: "2026-08-23T03:00:00Z" });
  });

  it("parses the stable contract, time basis, lifecycle states, exceptions, and separated currencies", () => {
    const report = parseFiscalExceptionReport(fiscalExceptionFixture(site, period));
    expect(report.contractVersion).toBe(fiscalExceptionContractVersion);
    expect(report.timeBasis).toBe(fiscalExceptionTimeBasis);
    expect(report.lifecycleSummaries.map((row) => row.lifecycleState)).toEqual(["NOT_REQUIRED", "PENDING", "REQUESTED", "ISSUED", "FAILED", "CONFLICT", "OUTCOME_UNAVAILABLE", "MANUAL_REVIEW", "EXCEPTION_RELEASED", "OTHER"]);
    expect(report.exceptionSummaries.map((row) => row.categoryId)).toEqual(["SALES_INVOICE_ISSUANCE_FAILED", "SALES_INVOICE_REFERENCE_CONFLICT", "SALES_INVOICE_OUTCOME_UNAVAILABLE"]);
    expect(report.currencySummaries.map((row) => row.currencyCode)).toEqual(["PHP", "USD"]);
  });

  it.each([
    ["contractVersion", "unsupported"], ["reportId", "wrong"], ["timeBasis", "wrong"], ["generatedAt", "not-a-date"], ["currencySummaries", null]
  ])("fails closed when %s is malformed", (field, value) => {
    expect(() => parseFiscalExceptionReport({ ...fiscalExceptionFixture(site, period), [field]: value })).toThrow();
  });

  it("rejects unsupported availability, freshness, lifecycle, exception, currency, and amounts", () => {
    const fixture = fiscalExceptionFixture(site, period);
    expect(() => parseFiscalExceptionReport({ ...fixture, availability: "UNAVAILABLE" })).toThrow(/availability/i);
    expect(() => parseFiscalExceptionReport({ ...fixture, freshness: "STALE" })).toThrow(/freshness/i);
    expect(() => parseFiscalExceptionReport({ ...fixture, lifecycleSummaries: [{ lifecycleState: "FUTURE", count: 1 }] })).toThrow(/lifecycle/i);
    expect(() => parseFiscalExceptionReport({ ...fixture, exceptionSummaries: [{ ...fixture.exceptionSummaries[0], categoryId: "UNKNOWN_CATEGORY" }] })).toThrow(/category/i);
    expect(() => parseFiscalExceptionReport({ ...fixture, currencySummaries: [{ ...fixture.currencySummaries[0], currencyCode: "PESO" }] })).toThrow(/currency/i);
    expect(() => parseFiscalExceptionReport({ ...fixture, currencySummaries: [{ ...fixture.currencySummaries[0], expectedIssuanceAmount: "12.00" }] })).toThrow(/amount/i);
  });

  it("requires no-activity responses to contain no aggregates and use not-applicable freshness", () => {
    const empty = fiscalExceptionFixture(site, period, "no-activity");
    expect(parseFiscalExceptionReport(empty).availability).toBe("NO_ACTIVITY");
    expect(() => parseFiscalExceptionReport({ ...empty, lifecycleSummaries: [{ lifecycleState: "PENDING", count: 1 }] })).toThrow(/no-activity/i);
    expect(() => parseFiscalExceptionReport({ ...empty, freshness: "CURRENT" })).toThrow(/not-applicable/i);
  });

  it("rejects transaction-level sensitive response fields", () => {
    for (const key of ["salesInvoiceNumber", "providerReference", "payerIdentity", "vehiclePlate", "ticketNumber", "rawPosServerResponse", "token"]) {
      expect(() => parseFiscalExceptionReport({ ...fiscalExceptionFixture(site, period), [key]: "secret" })).toThrow(/sensitive field/i);
    }
  });

  it("uses GET-only same-origin requests without client authority headers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toMatch(/^\/v1\/management-platform\/dashboard\/fiscal-exception-summary/);
      expect(init?.method).toBe("GET");
      expect([...new Headers(init?.headers).keys()].filter((name) => /permission|user-id|site-id|site-group|authorization-epoch/i.test(name))).toEqual([]);
      return new Response(JSON.stringify(fiscalExceptionFixture(group, period, "site-group")), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createFiscalExceptionReportingClient(createCentralPmsApiClient({ fetchImpl }));
    await expect(client.getSummary(group, period)).resolves.toMatchObject({ requestedScope: group });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects empty, malformed, and wrong-content-type responses", async () => {
    for (const response of [
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify(fiscalExceptionFixture(site, period)), { status: 200, headers: { "Content-Type": "text/html" } })
    ]) {
      const client = createFiscalExceptionReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => response) }));
      await expect(client.getSummary(site, period)).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });

  it("rejects responses bound to a different scope or period", async () => {
    const wrongScope = createFiscalExceptionReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => new Response(JSON.stringify(fiscalExceptionFixture(group, period)), { status: 200, headers: { "Content-Type": "application/json" } })) }));
    await expect(wrongScope.getSummary(site, period)).rejects.toMatchObject({ code: "FISCAL_REPORT_SCOPE_RESPONSE_MISMATCH" });
    const changed = { ...fiscalExceptionFixture(site, period), periodEnd: "2026-08-03T00:00:00Z" };
    const wrongPeriod = createFiscalExceptionReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => new Response(JSON.stringify(changed), { status: 200, headers: { "Content-Type": "application/json" } })) }));
    await expect(wrongPeriod.getSummary(site, period)).rejects.toMatchObject({ code: "FISCAL_REPORT_PERIOD_RESPONSE_MISMATCH" });
  });
});
