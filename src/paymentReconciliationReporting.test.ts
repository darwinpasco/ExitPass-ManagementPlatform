import { describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import {
  createPaymentReconciliationReportingClient,
  maximumPaymentReportingPeriodDays,
  parsePaymentReconciliationReport,
  paymentReconciliationApiRoute,
  paymentReconciliationContractVersion,
  paymentReconciliationFixture,
  paymentReconciliationRequestPath,
  validatePaymentReportingPeriod
} from "./paymentReconciliationReporting";

const site = { scopeType: "SITE" as const, scopeReference: "71000000-0000-0000-0000-000000000101" };
const group = { scopeType: "SITE_GROUP" as const, scopeReference: "71000000-0000-0000-0000-000000000900" };
const period = { periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-08-02T00:00:00Z" };

describe("payment reconciliation reporting contract", () => {
  it("constructs explicit encoded SITE and SITE_GROUP requests with half-open UTC bounds", () => {
    const sitePath = paymentReconciliationRequestPath(site, period);
    const groupPath = paymentReconciliationRequestPath(group, period);
    expect(sitePath).toBe(`${paymentReconciliationApiRoute}?scopeType=SITE&scopeReference=71000000-0000-0000-0000-000000000101&periodStart=2026-08-01T00%3A00%3A00Z&periodEnd=2026-08-02T00%3A00%3A00Z`);
    expect(groupPath).toContain("scopeType=SITE_GROUP");
    expect(groupPath).not.toContain("GLOBAL");
  });

  it("requires explicit supported scope", () => {
    expect(() => paymentReconciliationRequestPath({ scopeType: "GLOBAL" as "SITE", scopeReference: "" }, period)).toThrow(/explicit authorized/i);
  });

  it("validates ordered explicit UTC periods bounded to 31 days", () => {
    expect(validatePaymentReportingPeriod(period)).toEqual({ valid: true });
    expect(validatePaymentReportingPeriod({ periodStart: "2026-08-01T00:00:00", periodEnd: period.periodEnd })).toMatchObject({ valid: false, code: "INVALID_PAYMENT_RECONCILIATION_PERIOD_START" });
    expect(validatePaymentReportingPeriod({ periodStart: period.periodEnd, periodEnd: period.periodStart })).toMatchObject({ valid: false, code: "INVALID_PAYMENT_RECONCILIATION_PERIOD_RANGE" });
    expect(maximumPaymentReportingPeriodDays).toBe(31);
    expect(validatePaymentReportingPeriod({ periodStart: period.periodStart, periodEnd: "2026-09-02T00:00:00Z" })).toMatchObject({ valid: false, code: "PAYMENT_RECONCILIATION_PERIOD_TOO_LONG" });
  });

  it("parses the stable PHP-only contract with statuses, channels, providers, and findings", () => {
    const result = parsePaymentReconciliationReport(paymentReconciliationFixture(site, period));
    expect(result.contractVersion).toBe(paymentReconciliationContractVersion);
    expect(result.currencySummaries.map((row) => row.currencyCode)).toEqual(["PHP"]);
    expect(result.paymentAttemptSummaries[0].status).toBe("PENDING");
    expect(result.confirmedPaymentSummaries[0].status).toBe("RECORDED");
    expect(result.paymentAttemptSummaries[1].status).toBe("OTHER");
    expect(result.channelSummaries.map((row) => row.channelType)).toEqual(["DIGITAL", "CASH"]);
    expect(result.internalReconciliationSummaries).toHaveLength(5);
  });

  it("fails closed when a response contains a non-PHP currency", () => {
    const fixture = paymentReconciliationFixture(site, period);
    expect(() => parsePaymentReconciliationReport({
      ...fixture,
      currencySummaries: [{ ...fixture.currencySummaries[0], currencyCode: "USD" }]
    })).toThrow(/unsupported currency/i);
  });

  it.each([
    ["contractVersion", "unsupported"],
    ["reportId", "wrong-report"],
    ["generatedAt", "not-a-date"],
    ["currencySummaries", null]
  ])("fails closed when %s is malformed", (field, value) => {
    expect(() => parsePaymentReconciliationReport({ ...paymentReconciliationFixture(site, period), [field]: value })).toThrow();
  });

  it("rejects values presented under unavailable availability", () => {
    expect(() => parsePaymentReconciliationReport({ ...paymentReconciliationFixture(site, period), availability: "UNAVAILABLE" })).toThrow(/unavailable/i);
  });

  it("uses GET-only same-origin requests without authority headers and validates response binding", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect([...headers.keys()].filter((name) => /permission|user-id|site-id|authorization-epoch/i.test(name))).toEqual([]);
      return new Response(JSON.stringify(paymentReconciliationFixture(group, period, "site-group")), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createPaymentReconciliationReportingClient(createCentralPmsApiClient({ fetchImpl }));
    await expect(client.getSummary(group, period)).resolves.toMatchObject({ requestedScope: group });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects empty, malformed, and wrong-content-type responses", async () => {
    for (const response of [
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify(paymentReconciliationFixture(site, period)), { status: 200, headers: { "Content-Type": "text/html" } })
    ]) {
      const client = createPaymentReconciliationReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => response) }));
      await expect(client.getSummary(site, period)).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });

  it("rejects scope and period responses that do not bind to the request", async () => {
    const wrongScope = createPaymentReconciliationReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => new Response(JSON.stringify(paymentReconciliationFixture(group, period)), { status: 200, headers: { "Content-Type": "application/json" } })) }));
    await expect(wrongScope.getSummary(site, period)).rejects.toMatchObject({ code: "PAYMENT_REPORT_SCOPE_RESPONSE_MISMATCH" });
    const changedPeriod = { ...paymentReconciliationFixture(site, period), periodEnd: "2026-08-03T00:00:00Z" };
    const wrongPeriod = createPaymentReconciliationReportingClient(createCentralPmsApiClient({ fetchImpl: vi.fn(async () => new Response(JSON.stringify(changedPeriod), { status: 200, headers: { "Content-Type": "application/json" } })) }));
    await expect(wrongPeriod.getSummary(site, period)).rejects.toMatchObject({ code: "PAYMENT_REPORT_PERIOD_RESPONSE_MISMATCH" });
  });
});
