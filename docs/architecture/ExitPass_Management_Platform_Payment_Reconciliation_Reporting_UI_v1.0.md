# ExitPass Management Platform Payment and Reconciliation Reporting UI v1.0

## Purpose

The route `/management-platform/reports/payment-reconciliation` presents internal Central PMS payment activity and consistency reporting. It consumes contract `management-platform-payment-reconciliation-reporting:v1` through the same-origin H-006 API client. It does not call a payment provider, POS Server, APT, WebPay, Operator Console, or a database.

## Navigation and authorization

The navigation entry is `Payment and Reconciliation` and is presented only when the current-session presentation permissions include `reconciliation.view`. Direct route access uses the same guard. This is presentation behavior only: Central PMS policy `ManagementPlatformPaymentReconciliationSummaryRead` validates the live human session, account, authorization epoch, permission, and requested scope.

The dashboard catalog identifies the report as `PARTIAL`. When catalog access is available, an operational `AVAILABLE` or `PARTIAL` entry can open the report for a user who also has `reconciliation.view`. An unavailable catalog entry has no operational action.

## Scope and period

The request is `GET /v1/management-platform/dashboard/payment-reconciliation-summary` with explicit `scopeType`, `scopeReference`, `periodStart`, and `periodEnd`. Site and Site Group choices come only from current-session authorized scope. `GLOBAL`, all-sites, empty, free-form, and inferred scope are prohibited.

Controls are explicitly labeled UTC because the current session contract does not provide canonical Site timezone metadata. The interval is half-open `[periodStart, periodEnd)`, must be ordered, and cannot exceed 31 days. Input values are deterministically serialized with `Z`; the page does not claim local business-day semantics.

Changing scope aborts the previous request and increments a latest-request sequence. A prior scope or period response cannot replace the active request. Response scope and period bindings are validated before display.

## Report presentation

The page displays:

- selected and effective scope, requested UTC period, generated time, data-as-of time, source, availability, freshness, and support reference;
- separate ISO-currency summaries for attempts, attempted amounts, confirmed payments, and confirmed payment amounts;
- separate payment-attempt and confirmed-payment statuses, including `OTHER` or `UNKNOWN`;
- canonical channel summaries that preserve digital and cash distinctions;
- provider summaries only when returned by Central PMS;
- five stable internal reconciliation categories with definitions, currency-separated amounts, monetary treatment, and limitations;
- backend warnings and limitations in visible panels.

The browser does not recompute financial totals or combine currencies. JSON decimal values are used only for display. Confirmed values are not labeled settled, deposited, paid out, net proceeds, cash custody, or revenue.

An available empty result says no payment activity was recorded. A zero-finding message is unconditional only when the report and every reconciliation category are available. Partial coverage produces a qualified message and never an all-clear statement.

## Availability and errors

`AVAILABLE`, `PARTIAL`, `UNAVAILABLE`, and `NOT_APPLICABLE` remain distinct from freshness. Disabled, authentication-required, permission-denied, concealed scope, source-unavailable, invalid request, malformed response, network, and unexpected failures have controlled messages. A retry is user initiated and only offered for retryable reads. A failed refresh may retain the prior report with its original timestamps and an explicit previously-loaded label.

The dedicated client validates JSON content type, contract and report IDs, UTC timestamps, UUID-shaped references, scope and period binding, classifications, arrays, counts, currencies, money values, and reconciliation category IDs. Empty, malformed, wrong-content-type, unsupported, or mismatched responses fail closed.

## Security boundary

The report is memory-only and is cleared when its authenticated component unmounts or session identity changes. No report, identity, permission, scope, cookie, token, correlation reference, or financial aggregate is written to localStorage, sessionStorage, IndexedDB, URL fragments, or a frontend cookie. Requests send no browser-authored actor, role, permission, Site, Site Group, or authorization-epoch headers.

Raw provider payloads and references, credentials, tokens, payer data, plates, tickets, and transaction-level identifiers are neither modeled nor rendered.

## Development scenarios

Vite development builds support contract-faithful `mpPaymentScenario` values: `current`, `site-group`, `partial`, `unavailable`, `no-activity`, `feature-disabled`, `permission-denied`, `scope-denied`, `malformed`, and `retryable-failure`. Example:

```text
/management-platform/reports/payment-reconciliation?mpScenario=authenticated&mpPaymentScenario=current
```

Production builds cannot activate these scenarios. No production mock fallback exists.

## Validation

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test -- --run src/paymentReconciliationReporting.test.ts src/PaymentReconciliationPage.test.tsx src/App.test.tsx
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test:e2e -- -TestFile e2e\payment-reconciliation.spec.ts
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
git diff --check
```

Browser coverage exercises 1440px, 768px, and 390px layouts, keyboard controls, horizontal overflow, report classifications, navigation regression, console errors, and browser storage.

## Deferred scope

Exports, schedules, email delivery, transaction drill-down, provider settlement, merchant payout, bank reconciliation, cash custody, MDR or fees, refunds, chargebacks, disputes, fiscal reports, report annotations, correction workflows, provider calls, POS Server calls, GLOBAL scope, and browser-persisted reports remain out of scope.
