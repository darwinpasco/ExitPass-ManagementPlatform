# ExitPass Management Platform Statutory Evidence Governance Manual Validation v1.0

## Start

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform-H-StatutoryEvidenceGovernance
npm.cmd ci
$env:MANAGEMENT_PLATFORM_DEV_PORT = "5178"
npm.cmd run dev
```

Base route:

`http://127.0.0.1:5178/management-platform/statutory-evidence-governance?mpScenario=authenticated&mpEvidenceGovernanceScenario=ready`

## Deterministic Scenarios

Use `mpEvidenceGovernanceScenario` with:

- `ready`
- `partially-ready`
- `incomplete`
- `capture-disabled`
- `configuration-unavailable`
- `stale`
- `unknown`
- `empty-scope`
- `permission-denied`
- `site-denied`
- `site-group-denied`
- `malformed`
- `unavailable`
- `transient-failure`

All fixture names, identifiers, timestamps, and support references are synthetic and non-authoritative.

## Walkthrough

1. Confirm the Evidence Governance navigation appears only with the dedicated fixture permission.
2. Verify ready, partial, incomplete, disabled, stale, unknown, empty, denied, malformed, unavailable, and transient states remain distinct.
3. Exercise All authorized scope, Site Group, Site, entitlement, governance, readiness, capture, freshness, and safe text filters.
4. Open the detail dialog and inspect contract, scope, capture/upload, document profile, protected-storage posture, lifecycle, worker readiness, warning/blocker, freshness, and support sections.
5. Copy the safe support reference and confirm an accessible status message.
6. Use keyboard-only navigation, Enter to open details, Escape to close, and confirm focus returns to the trigger.
7. Validate desktop 1366x768, narrow 768x900, and compact 390x844 layouts without document-level horizontal overflow.
8. Confirm no create, edit, enable, disable, upload, preview, download, approve, reject, lock, hold, delete, retention, media, storage, or policy mutation control exists.

## Network Proof

In browser developer tools, confirm statutory evidence governance uses only same-origin GET requests to:

- `/v1/ops/management-platform/statutory-discounts/evidence-governance`
- `/v1/ops/management-platform/statutory-discounts/evidence-governance/sites/{siteReference}`
- `/v1/ops/management-platform/statutory-discounts/evidence-governance/site-groups/{siteGroupReference}`

Confirm requests contain no Authorization, permission, service identity, user authority, Site authority, Site Group authority, provider credential, or signed-link material.

## Storage Proof

Inspect localStorage, sessionStorage, IndexedDB, and Cache Storage. Confirm none contains governance payloads, permissions, Site/Site Group authority, readiness classifications, support references, customer evidence, or storage internals.

## Automated Browser Validation

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform-H-StatutoryEvidenceGovernance
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
npm.cmd run test:e2e
```

## Stop and Cleanup

Stop only the development process started from this worktree with `Ctrl+C`. Verify ports:

```powershell
Get-NetTCPConnection -LocalPort 5178,5179 -ErrorAction SilentlyContinue
```

Generated `dist`, `test-results`, and `playwright-report` output remains ignored and must not be staged.

## Approval

Codex H significant walkthrough result: **PASSED on 2026-08-04**.

- The 40-test Chromium suite passed the ready, partial, incomplete, capture-disabled, configuration-unavailable, stale, unknown, empty-scope, permission-denied, Site-denied, Site-Group-denied, malformed, unavailable, and transient fixtures.
- The suite exercised Site, Site Group, entitlement, governance, readiness, capture, freshness, and safe text filtering; detail open/close; support-reference copy; keyboard-only interaction; and focus restoration.
- Visual captures at 1366x768 and 390x844 confirmed readable desktop and compact layouts without overlapping controls or false-ready presentation. The 768x900 layout also passed the automated overflow assertion.
- Network assertions proved only the three same-origin I-014 GET routes were used, with no mutation requests or privileged browser headers.
- Storage assertions proved localStorage, sessionStorage, IndexedDB, and Cache Storage contained no governance, permission, scope, readiness, customer-evidence, or storage-internal authority.
- No customer evidence data, storage internals, mutation controls, or provider-operation controls were present.

Controlled UAT and production rollout remain unauthorized.
