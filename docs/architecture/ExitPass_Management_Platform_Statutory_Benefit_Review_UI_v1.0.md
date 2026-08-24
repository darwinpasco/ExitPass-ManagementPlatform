# ExitPass Management Platform Statutory Benefit Review UI v1.0

## Route And Authority

- Route: `/management-platform/statutory-benefit-requests`
- Contract: `management-platform-statutory-benefit-review:v1`
- API owner: Central PMS
- Originating channels: WebPay and APT through Central PMS service channels

The browser calls only `/v1/management-platform/statutory-benefit-requests`. It has no WebPay, APT, Operator Console, provider, or client-database integration.

## Permission Presentation

Navigation requires `statutory-discounts.review.queue.read`. Detail, evidence, approval, and rejection controls separately use the matching Central PMS permissions. Presentation checks never replace server authorization. Head Office authority is assigned in Central PMS and is not inferred from an administrator label.

## User Experience

The queue defaults to pending and uses server-side pages. Filters cover status, authorized Site, channel, benefit type, submission time, and exact safe reference search. Opening a row shows request, Site, source, parking-session or ticket reference, benefit type, evidence metadata, and prior decision. Approval and rejection require confirmation; rejection also requires a reason. A version and idempotency key protect terminal decisions and conflict readback refreshes the authoritative detail.

At tablet and mobile widths the selected detail appears before the directory. Filters collapse without page-level horizontal overflow. All controls have labels, keyboard focus remains visible, status text is explicit, and loading, empty, denied, conflict, unavailable, success, and failure states have semantic announcements.

## Privacy And State

The page displays a visible privacy notice. It does not render plate numbers, raw evidence, object-storage references, credentials, tokens, or private authority mappings. Runtime data remains in React memory only; it is not written to localStorage, sessionStorage, IndexedDB, URL fragments, or frontend cookies. The authenticated shell unmounts and clears the page on logout or session expiry.

## PHP Only

The strict parser accepts monetary facts only with `currency: PHP`. Amounts are display-only server aggregates formatted with the peso symbol using integer minor units. There is no currency selection, conversion, grouping, or multi-currency presentation.

## Validation

Focused tests cover contract parsing, PHP rejection, permission navigation, server pagination, detail and evidence presentation, mandatory rejection reason, decision confirmation, stale-request suppression, safe failures, and responsive layout. Existing authentication, dashboard, User Administration, payment, and fiscal suites remain required regressions. Runtime acceptance must use actual H-006 login, an isolated PostgreSQL database, WebPay and APT-originated Central PMS facts, and the same-origin proxy before the feature is called accepted.
