# ExitPass Management Platform Standalone Architecture v1.0

## Purpose

The standalone Management Platform repository contains the browser frontend for ExitPass administrative workflows. It is a React/TypeScript/Vite application with Vitest component coverage, Playwright Chromium E2E coverage, browser-safe Central PMS API integration, UI contracts, and proof automation.

## Runtime Boundary

Management Platform browser -> Central PMS Management Platform APIs -> authoritative backend services and canonical database.

The browser does not directly integrate with POS Server, Operator Console backend internals, WebPay internals, APT internals, HikCentral, vendor PMS adapters, payment providers, storage services with privileged material, or database endpoints.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src` | React app, UI components, API client, browser DTOs, local development fixtures, tests. |
| `e2e` | Playwright Chromium scenarios. |
| `scripts` | Local proof and E2E orchestration scripts. |
| `contracts/management-platform` | Browser-facing UI contract artifacts copied from the embedded module and source root. |
| `docs/architecture` | Standalone architecture. |
| `docs/migration` | Extraction manifest and handoff. |
| `docs/rbac/reviews` | Current RBAC readiness audit. |
| `.github/workflows` | Windows CI validation for the frontend. |

## Configuration

Browser configuration is limited to `VITE_MANAGEMENT_PLATFORM_BASE_PATH`, `VITE_MANAGEMENT_PLATFORM_CENTRAL_PMS_API_BASE_PATH`, `VITE_MANAGEMENT_PLATFORM_ENVIRONMENT_NAME`, and local-development fixture values. The Central PMS API base path must remain relative and under `/v1/management-platform`.

Local development ports are isolated by environment variables:

| Purpose | Default |
| --- | --- |
| Development server | 5178 |
| Playwright E2E | 5179 |
| Production preview for E2E | 5180 |

Vite uses `--strictPort` for local development.

## Current Application Surface

| Feature | Route | Primary file | Permission | Backend route family | Status |
| --- | --- | --- | --- | --- | --- |
| Shell and overview | `/management-platform/`, `/management-platform/overview` | `src/App.tsx` | `management-platform.overview.read` | None | Implemented |
| Site selection | Shell | `src/App.tsx`, `src/siteContext.ts` | Principal authorized Sites | None | Implemented client-side |
| Sales Invoice Setup read | `/management-platform/sales-invoice-profiles` | `src/SalesInvoiceProfilesPage.tsx`, `src/salesInvoiceProfiles.ts` | `sales-invoice-profile.read` | `/v1/management-platform/sales-invoice-header-profiles` | Implemented |
| Registered Business read/manage | Same | `src/SalesInvoiceProfilesPage.tsx`, `src/salesInvoiceProfiles.ts` | read/manage | `/v1/management-platform/fiscal-identities` | Implemented |
| Draft Sales Invoice Setup create/edit | Same | Same | `sales-invoice-profile.manage` | `/v1/management-platform/sales-invoice-header-profiles` | Implemented |
| Create New Setup Version | Same | Same | `sales-invoice-profile.manage` | one POST to `/v1/management-platform/sales-invoice-header-profiles` | Implemented |
| Validate configuration | Same | Same | read-authorized view action | POST validate route | Implemented |
| Activate Sales Invoice Setup | Same | Same | `sales-invoice-profile.approve` | POST approve route | Implemented |
| Retire Sales Invoice Setup | Same | Same | `sales-invoice-profile.approve` | POST retire route | Implemented |
| Issuance history | Same | Same | read | usage route | Implemented |
| Sales Invoice readiness | Same | Same | read | effective-readiness route | Implemented |

## Create New Setup Version Posture

Create New Setup Version appears only for an Active source setup in the current authorized Site and requires `sales-invoice-profile.manage`. It creates a separate Draft Sales Invoice Setup, requires an explicit New setup version, requires explicit effective period input, and copies only permitted Sales Invoice Configuration fields. It excludes profile IDs, lifecycle state, actor fields, timestamps, usage, readiness, validation, and fiscal-document references. It sends one POST to the Central PMS Management Platform create route and sends no PATCH to the source setup. It does not validate, activate, retire, or alter source Issuance history.

## Browser Security Posture

The API client rejects absolute URLs, accepts only `/v1/management-platform` paths, rejects privileged browser headers, attaches correlation IDs, maps server errors to business-safe messages, and avoids browser storage for profile, statutory, credential, role, permission, and unsaved-form data.

## Production Integration Needs

Production still requires a real authenticated principal, current-user readback or equivalent hosting integration, session-expiry handling, logout behavior, and Central PMS backend enforcement for every protected operation. The frontend permission state is not authoritative.
