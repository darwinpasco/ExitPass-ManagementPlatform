# ExitPass Management Platform

ExitPass Management Platform is the browser-facing administration surface for ExitPass operational configuration. This standalone repository owns the React, TypeScript, Vite, Vitest, and Playwright frontend that calls Central PMS Management Platform APIs.

The browser boundary is intentionally narrow:

Management Platform browser -> Central PMS APIs -> authoritative backend services and database

The browser must not call POS Server, WebPay internals, APT internals, HikCentral, vendor adapters, payment providers, object storage with privileged material, or PostgreSQL directly. It must not carry Central PMS administrative material, downstream service material, committed auth payloads, raw certificate material, or database DSNs.

## Ownership

Codex H owns this frontend repository, UI contracts, permission-aware navigation, tests, proof automation, and frontend deployment documentation. Central PMS policy semantics, server enforcement, and canonical RBAC persistence are owned outside this repository.

Related products remain separate: Operator Console performs operational workflows, WebPay performs customer payment-channel workflows, APT performs assisted terminal workflows, POS Server fiscalizes paid amounts, and Central PMS remains authoritative.

## Stack

- React 19
- TypeScript 5
- Vite 7
- Vitest 3
- Playwright Chromium

## Setup

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
npm.cmd ci
```

## Configuration

Use `.env.example` as the placeholder template. Runtime browser calls use a relative Central PMS base path, defaulting to `/v1/management-platform`. Local Vite proxying is configured with `VITE_MANAGEMENT_PLATFORM_API_PROXY_TARGET` and defaults to a local Central PMS instance.

Production must supply an authenticated Central PMS principal through the hosting integration. The local development principal is for local UI fixtures only and must not be treated as authoritative.

## Local Development

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
$env:MANAGEMENT_PLATFORM_DEV_PORT = "5178"
npm.cmd run dev
```

Open `http://127.0.0.1:5178/management-platform/`.

Codex H parallel-work isolation uses development port 5178, Playwright E2E port 5179, and production preview port 5180. The Vite dev server uses `--strictPort` and supports environment-variable overrides.

## Validation

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
$env:MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT = "5180"
npm.cmd run test:e2e
```

Proof scripts:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformUiFoundationProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileReadUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileManageUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileApproveRetireUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiE2eProof.ps1
```

## Current Features

- Application shell at `/management-platform/` and `/management-platform/overview`.
- Site selector driven by the current authenticated principal's authorized Sites.
- Permission-aware navigation and route denial.
- Sales Invoice Setup route at `/management-platform/sales-invoice-profiles`.
- Registered Business read/create/edit workflows.
- Sales Invoice Configuration read, Draft create/edit, validation, activation, retirement, Sales Invoice readiness, Effective period and status history, and Issuance history.
- Development scenarios through `mpProfileScenario` in local development only.

## Sales Invoice Setup Controls

Read-only users can view Registered Business, Sales Invoice Setup, Sales Invoice Configuration, readiness, validation, and Issuance history. Manage users with `sales-invoice-profile.manage` can create or edit Draft Sales Invoice Setup records and Registered Business records. Approve users with `sales-invoice-profile.approve` can Activate Sales Invoice Setup and Retire Sales Invoice Setup when backend state permits.

Create New Setup Version is available only for an Active source setup in the current authorized Site. The workflow displays Active source setup details, requires New setup version input, requires explicit effective-period input, uses controlled template and presentation versions, submits one Central PMS Management Platform POST to create a separate Draft, and reports Draft Sales Invoice Setup created. It does not validate, activate, approve, retire, patch the source setup, retire the source, retry automatically, or alter source Issuance history.

The create-new-version flow uses business-facing terminology: Registered Business, Sales Invoice Setup, Sales Invoice Configuration, Create New Setup Version, Create New Sales Invoice Setup Version, New setup version, Source setup, Effective period and status history, Issuance history, and Sales Invoice readiness.

## Browser Safety

Unsaved form state remains in component memory only. Site switching with unsaved form state requires confirmation; Site switching while a mutation is pending is blocked. Current production source does not implement localStorage, sessionStorage, or IndexedDB writes for profile, statutory, credential, role, permission, or unsaved-form data.

The API client accepts only relative Central PMS Management Platform routes under `/v1/management-platform`, attaches a correlation id, maps errors to browser-safe messages, and rejects privileged browser headers.

## Current Limitations

The standalone baseline does not implement role administration, permission administration, user-role assignment, Site Group assignment administration, service-identity administration, statutory policy administration, or statutory RBAC behavior. Those features require approved Central PMS contracts and backend enforcement first.

Operator Console statutory controlled UAT, WebPay statutory controlled UAT, APT statutory controlled UAT, and production rollout are not authorized by this repository baseline.

## Git Workflow

Darwin owns staging, commits, remote creation, pushes, pull requests, merges, and final approval. The embedded Management Platform module in the primary ExitPass repository must remain until this standalone baseline is accepted and merged separately.

## Development Scenarios

The local development harness supports `mpScenario` and `mpProfileScenario` query values for repeatable manual and E2E checks. Use `mpProfileScenario=read-only` to verify read-only permission posture, `mpProfileScenario=manage` for `sales-invoice-profile.manage`, and the new-version scenarios for Create New Setup Version coverage. Timeout and conflict scenarios display `Result uncertain` guidance when the authoritative mutation result must be refreshed before another attempt.

Required Create New Setup Version scenarios include `new-version-manage`, `new-version-read-only`, `new-version-approve-only`, `new-version-success`, `new-version-duplicate-conflict`, `new-version-overlap-conflict`, `new-version-timeout`, `new-version-site-mismatch`, `new-version-source-not-active`, `new-version-source-not-found`, `new-version-cancel`, `new-version-unsaved-site-switch`, `new-version-pending-site-switch`, `new-version-double-submit`, and `new-version-source-preserved`.

## Activation And Retirement Scenarios

Users with `sales-invoice-profile.approve` can reach Activate Sales Invoice Setup and Retire Sales Invoice Setup controls when backend state and validation posture permit. Retirement copy explicitly preserves Historical Sales Invoices and Issuance history; the UI does not delete historical records or expose actor controls.
