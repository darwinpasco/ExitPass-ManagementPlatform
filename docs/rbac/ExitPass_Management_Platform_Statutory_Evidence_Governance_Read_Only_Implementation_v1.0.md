# ExitPass Management Platform Statutory Evidence Governance Read-Only Implementation v1.0

## Purpose

H-004 adds a read-only administrative workspace for Central PMS statutory-evidence governance configuration and readiness. It does not inspect individual evidence, determine eligibility, or administer evidence workflows.

## Route and Navigation

- Frontend route: `/management-platform/statutory-evidence-governance`
- Navigation label: `Evidence Governance`
- Visibility permission: `statutory-discounts.evidence-governance.view`

Frontend permission state controls navigation visibility only. Central PMS independently enforces the named policy, actor identity, Site scope, Site Group scope, and anti-enumeration behavior.

## I-014 Dependency

- Contract: `management-platform-statutory-evidence-governance:v1`
- Named policy: `StatutoryEvidenceGovernanceView`
- Permission: `statutory-discounts.evidence-governance.view`
- All authorized scope: `GET /v1/ops/management-platform/statutory-discounts/evidence-governance`
- Site scope: `GET /v1/ops/management-platform/statutory-discounts/evidence-governance/sites/{siteReference}`
- Site Group scope: `GET /v1/ops/management-platform/statutory-discounts/evidence-governance/site-groups/{siteGroupReference}`

The browser calls only these relative same-origin Management Platform routes. Site and Site Group references are request context, not browser-created authorization grants.

## Classification Rendering

Governance classifications remain distinct:

- `CONFIGURED_READY`
- `CONFIGURED_PARTIALLY_READY`
- `CONFIGURATION_INCOMPLETE`
- `CAPTURE_DISABLED`
- `CONFIGURATION_UNAVAILABLE`
- `UNKNOWN`

Capability classifications remain distinct:

- `READY`
- `PARTIALLY_READY`
- `NOT_CONFIGURED`
- `DISABLED`
- `NOT_IMPLEMENTED`
- `UNAVAILABLE`
- `STALE`
- `UNKNOWN`

The UI does not infer readiness from missing warnings or remap unknown, unavailable, stale, disabled, or not-implemented states into a competing classification.

## Workspace Behavior

Server-supported filters cover scope, entitlement, governance status, readiness status, capture posture, and stale inclusion. Safe text search and stale-only display filtering apply only to rows already returned for the authorized scope.

Each Site summary shows scope, entitlements, governance, readiness, capture, protected-storage readiness, freshness, warnings, and blockers. The read-only detail dialog shows the I-014 contract version, capture/upload posture, required document profiles, protected-storage posture, lifecycle matrix, operational readiness, controlled warning/blocker codes, timestamps, retry recommendation, and safe support reference.

Refresh retains the previous result only while clearly labeling it retained and not current. Initial loading never presents a provisional ready state.

## Safe States

The workspace distinguishes initial loading, refresh, empty authorized scope, filtered empty, permission denial, Site denial, Site Group denial, invalid filter, malformed response, unavailable service, transient failure, stale response, and unknown classification.

Only retryable GET failures expose a retry action. User-facing errors contain safe classifications and support references, not raw backend diagnostics.

## Privacy and Security

The browser does not add service identity, permission, user authority, Site authority, Site Group authority, provider credential, or custom authorization headers. The shared client rejects those headers.

The response validator reconstructs only I-014 fields and rejects forbidden customer, evidence-reference, signed-link, object-key, bucket/container, checksum-value, provider-secret, reviewer, parking, ticket, plate, payment, and payable-basis fields.

Governance responses, permissions, scope authority, and readiness authority are not persisted in localStorage, sessionStorage, IndexedDB, Cache Storage, service workers, or frontend-managed cookies.

## Read-Only Boundary

No controls or requests exist for evidence upload, preview, download, review, lock, hold, deletion request, provider-operation retry, retention mutation, media-policy mutation, storage mutation, entitlement-policy mutation, eligibility decision, payable-basis application, payment, fiscalization, or gate operation.

## Validation

Vitest covers route construction, DTO safety, permission routing, scope and filter behavior, all controlled classifications, safe errors, refresh retention, support-reference copy, mutation absence, privacy exclusions, storage non-authority, keyboard interaction, and H-002/H-003 shell regression.

Playwright Chromium covers deterministic scenarios, all three I-014 routes, same-origin requests, forbidden headers, no mutation requests, storage inspection, detail focus restoration, and responsive layouts at 1366, 768, and 390 pixels wide.

The H-004 proof script runs focused tests and production-source scans for route, permission, mutations, privileged headers, browser-storage writes, sensitive evidence fields, raw errors, and secrets.

## Deployment Posture

The implementation is read-only. Controlled UAT and production rollout remain unauthorized.
