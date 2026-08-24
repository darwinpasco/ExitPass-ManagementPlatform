# ExitPass Management Platform Fiscal Exception Reporting UI v1.0

## Purpose

The route `/management-platform/reports/fiscal-exceptions` presents Sales Invoice issuance lifecycle and supported exception summaries from outcomes already persisted in Central PMS. It consumes `management-platform-fiscal-exception-reporting:v1` through the same-origin H-006 API client. It does not call POS Server, Site POS Server databases, payment providers, APT, WebPay, Operator Console, Vendor PMS, or BIR systems.

## Navigation and authorization

The reporting navigation label is `Sales Invoice Exceptions`. It is presented only when current-session presentation permissions include `sales-invoice-report.view`; direct route access uses the same guard. Central PMS policy `ManagementPlatformFiscalExceptionSummaryRead` remains authoritative for the live human session, active account, authorization epoch, permission, and explicit reporting scope.

The dashboard catalog can open the report only when the catalog entry is `AVAILABLE` or `PARTIAL` and the current session has the dedicated report permission. `UNAVAILABLE` entries have no operational action. The parent `ManagementPlatform:DashboardReporting:Enabled` and report-specific `ManagementPlatform:DashboardReporting:FiscalExceptions:Enabled` controls remain server owned and default disabled.

## Scope, period, cohort, and time basis

The page requests `GET /v1/management-platform/dashboard/fiscal-exception-summary` with explicit `scopeType`, `scopeReference`, `periodStart`, and `periodEnd`. Site and Site Group choices come only from current-session authorized scope. `GLOBAL`, all-sites, empty, inferred, and free-form scope are prohibited.

Period controls are explicitly UTC because the session contract does not provide canonical Site timezone metadata. The period is half-open `[periodStart, periodEnd)`, must be ordered, and cannot exceed 31 days. The client sends deterministic `Z` timestamps and does not claim local business-day semantics.

The cohort is active, non-superseded Sales Invoice issuance references first recorded during the requested period. The required time basis is `FISCAL_ISSUANCE_REFERENCE_FIRST_RECORDED_AT`. Lifecycle values describe the latest persisted state at report generation, not a historical snapshot of state at cohort entry.

Changing scope aborts the previous request and increments a latest-request sequence. A superseded response cannot replace the current scope or period. The strict parser verifies requested scope and period bindings before display.

## Report presentation

The page displays:

- requested and effective scope, requested UTC period, generated time, data-as-of time, time basis, source, availability, freshness, and support reference;
- visible source-coverage cards and the limitation that Central PMS does not query Site POS Servers live;
- every supported lifecycle state, including `OTHER`, with conservative meanings;
- expected issuance counts and amounts in PHP;
- the three implemented exception categories, definitions, affected expected PHP amounts, and resolution boundaries;
- a qualified zero-findings statement under partial source coverage;
- a pending-state notice that pending is not automatically an exception;
- backend warnings, limitations, and unavailable facts in visible page sections.

`ISSUED` means Central PMS persisted an authoritative issuance outcome. It does not prove printing, delivery, or customer receipt. `REQUESTED` does not prove issuance. `OUTCOME_UNAVAILABLE` does not assert failure. Expected amounts come from linked payment confirmations and are not issued revenue, settled amounts, deposited funds, net sales, or BIR-declared sales.

The browser does not aggregate money or convert currency. Backend PHP JSON decimal values are display-only and are formatted with the peso sign.

## Availability and errors

Successful activity is `PARTIAL`; an empty cohort is `NO_ACTIVITY`. `CURRENT` describes current persisted source information, not live POS Server status. `NOT_APPLICABLE` accompanies no activity. Source failure and feature disablement are controlled HTTP errors and are not rendered as successful zero aggregates.

Authentication-required, permission-denied, concealed scope, invalid request, disabled feature, unavailable source, malformed response, network, and unexpected failures have distinct controlled messages. Retry is user initiated and bounded to retryable reads. A failed refresh can retain the previous report only with original timestamps and a visible previously-loaded warning.

The strict parser validates content type, contract and report IDs, scope and period binding, explicit UTC timestamps, time basis, report and source classifications, lifecycle and exception identifiers, UUID-shaped references, PHP currency, counts, money values, arrays, and correlation reference. It rejects unsupported classifications, non-PHP currency, empty or malformed bodies, sensitive transaction-level properties, and `NO_ACTIVITY` responses containing aggregates.

## Security boundary

Report state exists only in component memory and is cleared when the authenticated component unmounts or the session identity changes. No report, identity, permission, scope, timestamp, correlation reference, or aggregate is written to localStorage, sessionStorage, IndexedDB, URL fragments, or frontend cookies. Requests create no browser-authored actor, role, permission, Site, Site Group, or authorization-epoch headers.

Sales Invoice numbers, payment and provider references, ticket numbers, vehicle plates, payer identities, statutory IDs, raw POS Server responses, fiscal document bodies, Electronic Journal content, credentials, tokens, and transaction-level details are not modeled or rendered.

The UI does not prove live POS Server status, printing, delivery, customer receipt, settlement, payout, deposit, remittance, cash custody, or BIR certification.

## Development scenarios

Vite development builds support contract-faithful `mpFiscalScenario` values: `partial`, `site-group`, `no-activity`, `unavailable`, `feature-disabled`, `permission-denied`, `scope-denied`, `malformed`, `mismatched-scope`, `mismatched-period`, `retryable-failure`, and `refresh-failure`.

```text
/management-platform/reports/fiscal-exceptions?mpScenario=authenticated&mpFiscalScenario=partial
```

Scenario resolution is guarded by `import.meta.env.DEV`; production builds contain no activatable fixture fallback.

## Validation

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test -- --run src/fiscalExceptionReporting.test.ts src/FiscalExceptionReportPage.test.tsx src/App.test.tsx src/DashboardPage.test.tsx
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test:e2e -- -TestFile e2e\fiscal-exception-reporting.spec.ts
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
git diff --check
```

Browser coverage includes 1440px desktop, 768px tablet, and 390px mobile layouts; keyboard controls; document overflow; source, lifecycle, exception, no-activity, disabled, failure, and retained-refresh states; console errors; unexpected requests; and browser storage.

## Deferred scope

Exports, schedules, email delivery, transaction drill-down, live POS Server queries, Sales Invoice retrieval, printing, reprinting, adjustments, voids, Electronic Journal, X/Z reports, BIR Sales Summary, Annex reports, exception resolution, manual overrides, BIR certification, overdue detection, retry exhaustion, document amount or currency comparison, duplicate Sales Invoice analysis, GLOBAL scope, and browser-persisted reports remain out of scope.
