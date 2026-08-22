# ExitPass Management Platform Dashboard and Reporting UI Foundation v1.0

## Purpose

This implementation replaces the placeholder Overview content at `/management-platform/overview` with the first read-only Management Dashboard. The browser consumes the Central PMS contract `management-platform-dashboard-reporting:v1`; it does not query POS Server, vendor systems, payment providers, or databases.

The route remains `/management-platform/overview` for compatibility. Its navigation label and document title are `Dashboard` and `Dashboard - ExitPass Management Platform`.

## API and permissions

The dashboard uses only same-origin, cookie-authenticated GET requests:

- `GET /v1/management-platform/dashboard/operational-overview` requires `dashboard.view` and explicit `scopeType` plus `scopeReference`.
- `GET /v1/management-platform/dashboard/catalog` requires `reports.view`.

The compatibility permission `management-platform.overview.read` is not reporting authority. Frontend permission checks affect presentation only; Central PMS validates the H-006 human session, permission, authorization epoch, account state, and effective scope for every request.

## Reporting scope

Reporting scope is page-local and does not replace or broaden the shell Site selector. Choices are derived only from current-session `authorizedSites` and `authorizedSiteGroupReferences`. Site Group references are deduplicated and enriched from authorized Site metadata when available. A missing name is presented as a controlled reference suffix, not an invented business name.

The default is the shell's selected authorized Site, then the first authorized Site, then the first authorized Site Group. `GLOBAL` is never offered. If there is no explicit Site or Site Group, the overview request is not sent. A global-authority presentation fact does not remove the explicit-scope requirement.

Scope changes cancel the previous request and use a sequence guard so an earlier response cannot replace the selected scope.

## Availability and freshness

Availability and freshness remain independent server classifications. The UI maps `AVAILABLE`, `PARTIAL`, `UNAVAILABLE`, and `NOT_APPLICABLE` to visible text, and separately maps `CURRENT`, `STALE`, `PARTIAL`, `UNAVAILABLE`, and `NOT_APPLICABLE`.

Stale values remain visible with their original `dataAsOf` timestamp and a Stale label. Unavailable and not-applicable sections render warnings or limitations without fabricated metric cards or zero substitutes. The page displays generated, data-as-of, source-authority, warning, limitation, effective-scope, and support-reference data from the validated response.

The phase-1 operational sections are:

- Site operational status
- Connector health
- Vendor projection freshness

The report catalog identifies operational overview as the only operational capability in this slice. Payment reconciliation, fiscal exceptions, and management activity remain visibly unavailable and have no links, exports, or placeholder results.

## Loading, refresh, and errors

The dashboard loads when opened with a valid scope, reloads on scope change, and supports explicit manual refresh. No automatic polling is introduced because the v1.3 foundation does not approve a refresh interval.

Only one overview request remains active. If refresh fails after a successful load, the previous response may remain for reference, retains its original timestamps and classifications, and is explicitly labeled previously loaded. Feature-disabled, permission-denied, concealed scope, source-unavailable, malformed-response, authentication-required, and unexpected failures have distinct controlled messages. Raw backend messages and response bodies are not rendered.

A 401 continues through the shared H-006 session-loss callback. A 403 remains an authenticated denial. The dashboard does not retry a request automatically.

## Development scenarios

Deterministic scenarios use `mpDashboardScenario` only in Vite development builds:

- `current`
- `partial-connectors`
- `stale-projection`
- `unavailable-projection`
- `not-configured`
- `site`
- `site-group`
- `feature-disabled`
- `permission-denied`
- `scope-denied`
- `malformed`
- `retryable-failure`

Example:

```powershell
$env:MANAGEMENT_PLATFORM_DEV_PORT = "5178"
$env:VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET = "http://127.0.0.1:8080"
npm.cmd run dev
```

Open `http://127.0.0.1:5178/management-platform/overview?mpScenario=authenticated&mpDashboardScenario=current`.

Production builds ignore development scenario query values and must not contain scenario controls or synthetic dashboard payloads.

## Accessibility and responsive behavior

The page uses semantic headings, labeled scope and refresh controls, text-bearing status labels, bounded status announcements, visible focus inherited from the application, and wrapping metric and report layouts. Automated Chromium coverage checks 1440px, 1024px, and 390px widths for keyboard reachability and horizontal overflow.

## Security boundary

Reporting responses and presentation permissions remain in memory only. The implementation writes no reporting payload, permission, scope, correlation, or session authority to localStorage, sessionStorage, IndexedDB, URL fragments, or frontend cookies. It sends no browser-authored actor, role, permission, Site, Site Group, or authorization-epoch headers.

The client validates the contract version, report identifier, scope shape, requested-scope binding, timestamps, classifications, metrics, arrays, and UUID-shaped references before rendering. Unavailable sections containing metrics are rejected instead of rendered as authoritative.

## Validation

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test -- --run src/dashboardReporting.test.ts src/DashboardPage.test.tsx src/App.test.tsx
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test:e2e -- -TestFile e2e\dashboard-reporting.spec.ts
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
git diff --check
```

The local runtime walkthrough additionally requires Central PMS source containing commit `40f8a6cee41d182513d999b691dc4e4e8aeea583`, `ManagementPlatform:DashboardReporting` enabled only in local configuration, an isolated database, and synthetic H-006 session and scope data.

Central PMS must use local HTTPS because the H-006 antiforgery and human-session cookies are Secure. Point `VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET` at that HTTPS origin. When the ASP.NET development certificate is trusted by Windows, start Vite with `NODE_OPTIONS=--use-system-ca` so Node uses the same trust store. Do not disable TLS verification.

## Deferred scope

This foundation does not implement charts, exports, scheduled delivery, report building, financial finality, reconciliation closure, fiscal reporting, management activity results, custom date filters, drill-downs, parking or gate mutation, or frontend calls to another service. Frontend merge does not by itself establish end-to-end acceptance or production rollout.
