# ExitPass Management Platform Statutory Evidence Governance Capability Audit and I-014 Handoff v1.0

## Decision

The original H-004 capability audit was `BLOCKED_BY_MISSING_CENTRAL_PMS_EVIDENCE_GOVERNANCE_READ_API`.

That historical decision was correct for Central PMS commit `f7342172353d182b68cec676cae4fa179f469bcc`. I-014 is now merged at Central PMS commit `c793ce1c6abb52b391603959153e6f53a66cb75c`, and the dependency is resolved.

The resumed H-004 implementation consumes only:

- `GET /v1/ops/management-platform/statutory-discounts/evidence-governance`
- `GET /v1/ops/management-platform/statutory-discounts/evidence-governance/sites/{siteReference}`
- `GET /v1/ops/management-platform/statutory-discounts/evidence-governance/site-groups/{siteGroupReference}`
- named policy `StatutoryEvidenceGovernanceView`
- permission `statutory-discounts.evidence-governance.view`
- contract `management-platform-statutory-evidence-governance:v1`

The workspace is implemented as a read-only configuration and readiness view. It has no customer evidence access and no evidence, storage, retention, policy, or business-state mutation authority.

## Baselines Inspected

- Management Platform repository: `D:\SourceCodes\ExitPass-ManagementPlatform`
- Management Platform worktree: `D:\SourceCodes\ExitPass-ManagementPlatform-H-StatutoryEvidenceGovernance`
- Management Platform base commit: `b6f4b2f60c75dd2f3ed97f72dc54db52b84d81a3`
- Management Platform base posture: H-001 standalone foundation, H-002 statutory RBAC read-only catalog, and H-003 statutory policy coverage workspace are merged.
- Central PMS comparison repository: `D:\SourceCodes\ExitPass-Discounts`
- Central PMS historical commit inspected by the original blocker audit: `f7342172353d182b68cec676cae4fa179f469bcc`
- Central PMS resumed implementation commit inspected: `c793ce1c6abb52b391603959153e6f53a66cb75c`
- Central PMS resumed baseline posture: I-014 is merged; its dedicated configuration-level read API, permission, named policy, server-owned Site/Site Group scope, anti-enumeration behavior, and browser-safe DTO are present.

## Existing Management Platform Capabilities

The standalone frontend already provides reusable implementation patterns for a future H-004 slice:

- React, TypeScript, Vite, Vitest, and Playwright application foundation
- route registration and permission-gated navigation in `src/App.tsx`
- same-origin Central PMS API client in `src/apiClient.ts`
- rejection of absolute API paths and privileged browser headers
- authenticated principal and authorized Site context
- read-only workspace layouts, status cards, tables, filters, loading, empty, denied, malformed, unavailable, retry, and support-reference states
- H-002 Site and Site Group scope posture display
- H-003 server-authoritative Site and Site Group policy-coverage selection patterns
- responsive layouts, semantic headings, keyboard controls, and visible focus styling
- deterministic local-development fixtures that remain separate from production data
- full Vitest, Chromium Playwright, and PowerShell proof conventions
- scans for privileged headers, mutation methods, browser-storage writes, raw error leakage, secrets, and privacy-sensitive fields

These frontend capabilities were reused to implement H-004 after I-014 supplied the governed contract. They do not replace Central PMS authority.

## Central PMS Capability Audit

Searches of the current Central PMS production source found no:

- Management Platform statutory-evidence governance endpoint
- evidence-governance request or response DTO
- evidence-governance application service or repository
- configuration/readiness classifications for Management Platform display
- dedicated `statutory-discounts.evidence-governance.view` permission
- named RBAC policy for evidence-governance read access
- server-owned Site and Site Group governance inventory query

The Management Platform RBAC inventory includes evidence workflow permissions such as `statutory-discounts.evidence.view` and `statutory-discounts.evidence.capture`. Those permissions do not authorize configuration-level governance inventory and must not be reused for H-004.

## Why Existing Evidence APIs Cannot Be Reused

I-012 exposes metadata lifecycle operations under:

- `POST /v1/internal/statutory-discounts/evidence/sets`
- `POST /v1/internal/statutory-discounts/evidence/sets/{evidenceSetReference}/items`
- `GET /v1/internal/statutory-discounts/evidence/sets/{evidenceSetReference}`
- review-lock, hold, hold-release, and deletion-request mutation routes for an evidence set

The read route is not a Management Platform governance route. It requires an individual evidence-set reference and returns customer/workflow-linked fields, including:

- evidence-set and evidence-item references
- statutory decision and validation references
- parking-session reference
- Site and Site Group identifiers bound to that request
- entitlement and source channel
- required profile codes and versions for that evidence set
- item document type and role
- upload, validation, scan, reviewability, binding, retention, deletion, and hold state
- declared content type and timestamps

Reusing this route would violate H-004 privacy and authority boundaries. It would expose individual evidence workflow metadata, require possession of customer-level references, provide no configuration-level scope inventory, and still omit the authoritative provider/readiness posture H-004 must display. Aggregating or interpreting these records in the browser would fabricate governance authority and could leak customer-linked data.

The H-003 policy-coverage route also cannot be reused. It describes statutory parking policy coverage, not evidence capture profiles, retention configuration, protected-storage readiness, scanning, preview, or lifecycle-worker readiness.

## Missing Permission

I-014 must add the dedicated permission:

`statutory-discounts.evidence-governance.view`

The permission must remain separate from:

- `statutory-discounts.evidence.capture`
- `statutory-discounts.evidence.view`
- evidence review-lock, hold, and deletion-request permissions
- statutory policy mutation and eligibility review
- payable-basis application permissions
- `statutory-discount-policy.view`

Central PMS must map the permission to a named policy and enforce it independently of browser navigation visibility.

## Minimum I-014 Contract

Title: Central PMS Management Platform Statutory Evidence Governance Read API

At minimum, I-014 must provide:

1. A read-only Management Platform endpoint, for example:
   - `GET /v1/ops/management-platform/statutory-discounts/evidence-governance`
   - an optional Site-specific route only when needed by the established server-owned scope model
2. A named Central PMS RBAC policy mapped only to `statutory-discounts.evidence-governance.view`.
3. Server-authenticated, server-owned Site and Site Group scope resolution that fails closed for missing, malformed, unauthorized, or unresolved scope.
4. Browser-safe request and response DTOs containing configuration-level data only.
5. Controlled, documented classifications for:
   - configured and ready
   - configured but partially ready
   - configuration incomplete
   - capture disabled
   - retention policy unavailable
   - upload profile unavailable
   - protected storage unavailable
   - scanning, preview, retention-worker, and deletion-worker readiness
   - stale, unavailable, malformed, transient, denied, empty-scope, and unknown states
6. Authoritative retryability and safe support-reference fields.
7. Safe last-updated/freshness data so the UI never presents stale information without a stale indicator.
8. Tests proving permission denial, Site denial, Site Group denial, safe empty scope, malformed/provider-failure mapping, and DTO privacy.

The DTO may expose only authoritative fields actually supported by Central PMS, such as safe Site/Site Group display references, entitlement support, capture posture, required document-profile display data, allowed media types, maximum size, upload-authorization expiry, retention-policy posture, provider classification, privacy/encryption/checksum posture, lifecycle readiness, warnings, blockers, freshness, retryability, and support reference.

I-014 must not expose:

- customer identity or statutory identifiers
- evidence-set or evidence-item references
- evidence bytes or individual evidence records
- signed upload, preview, or download URLs
- object keys, bucket/container names, checksums, or evidence hashes
- provider credentials, connection strings, storage account details, or raw provider diagnostics
- reviewer notes or policy-engine internals
- mutation operations

## Preserved H-004 Implementation Plan

After I-014 is merged and its exact route, DTO, permission, scope semantics, and classifications are verified, H-004 can proceed with this bounded sequence:

1. Add browser contract types that mirror the approved I-014 response without extending it.
2. Add one relative same-origin GET client with no privileged browser headers.
3. Register one permission-gated read-only route and navigation entry.
4. Reuse the existing Site and Site Group context without treating browser selection as authorization.
5. Add filters only for fields returned by I-014.
6. Render authoritative ready, partial, incomplete, disabled, unavailable, stale, denied, empty, malformed, transient, and unknown states without synthesizing readiness.
7. Add no evidence upload, preview, download, review, hold, deletion, policy mutation, or provider-operation controls.
8. Add deterministic non-production fixtures, focused unit tests, Chromium E2E coverage, proof automation, security/privacy scans, and a significant browser walkthrough.

## Readiness Posture

- Backend dependency: present through merged I-014
- Workspace: implemented against the exact I-014 contract
- Navigation: added with dedicated permission visibility
- Customer evidence access: none
- Evidence upload: not implemented
- Evidence preview: not implemented
- Evidence review: not implemented
- Evidence hold management: not implemented
- Evidence deletion request: not implemented
- Policy mutation: not implemented
- Controlled UAT: not authorized
- Production rollout: not authorized
