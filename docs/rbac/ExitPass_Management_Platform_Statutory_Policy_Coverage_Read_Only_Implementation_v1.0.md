# ExitPass Management Platform Statutory Policy Coverage Read-Only Implementation v1.0

## Purpose

This slice adds a read-only Management Platform workspace for statutory parking policy coverage. It lets authorized Management Platform users inspect the Central PMS authoritative coverage read model for server-resolved Site or Site Group scope.

The workspace does not decide customer eligibility, calculate discounts, calculate free-parking duration, select ordinances, mutate payable basis, initiate payment, fiscalize, contact HikCentral, or open gates.

## Route

- Frontend route: `/management-platform/statutory-policy-coverage`
- Navigation label: `Statutory Policy Coverage`
- Required frontend visibility permission: `statutory-discount-policy.view`

## API Dependency

The UI consumes I-004:

- Method: `GET`
- Path: `/v1/ops/management-platform/statutory-discounts/policy-coverage`
- Named policy: `ManagementPlatformStatutoryDiscountPolicyCoverageRead`
- Permission: `statutory-discount-policy.view`

The browser calls this endpoint only through the existing relative Management Platform API boundary.

## Supported Scope

I-004 supports:

- `SITE_GROUP`
- `SITE`

The UI derives selectable Site and Site Group options from the authenticated Management Platform principal's authorized Site context. These values are request context only. Central PMS remains authoritative for scope resolution and enforcement.

`All authorized scope` is not a separate I-004 query mode, so the UI requires a Site or Site Group selection.

## State Model

The UI displays the I-004 response fields as returned:

- requested and resolved scope
- scope display name
- support reference
- evaluation timestamp
- Site display
- entitlement type
- coverage classification
- policy status classification
- effective period
- authority, jurisdiction, policy version, source, and last authoritative update where supplied

Known classifications are displayed exactly from I-004 and mapped to readable labels. Unknown classifications are displayed as unsupported authoritative classifications and treated as fail-closed.

## Read-Only Boundary

No controls are provided for creating, editing, deleting, activating, deactivating, importing, publishing, approving, applying, overriding, or recalculating statutory policy coverage.

No statutory request, statutory decision, payable-basis, payment, fiscal, Site assignment, Site Group assignment, POS Server, Payment Orchestrator, HikCentral, vendor, or database write is performed.

## Privacy and Security

The browser does not attach:

- `Authorization`
- `X-ExitPass-Permissions`
- `X-Management-Platform-Permissions`
- `X-ExitPass-Service-Identity-Id`
- `X-ExitPass-User-Id`

The browser does not store statutory policy coverage responses in `localStorage`, `sessionStorage`, IndexedDB, service workers, or cookies controlled by this frontend.

User-facing errors are mapped to safe messages and support references. The UI must not render stack traces, SQL, connection strings, internal hostnames, protected evidence data, credentials, raw exception messages, or infrastructure details.

## Validation

Automated validation covers:

- API client route and query shape
- missing permission and access denial
- Site Group and Site coverage
- Senior Citizen and PWD filters
- covered, no coverage, empty, unavailable, timeout, malformed, and unsupported classification states
- retryable and non-retryable errors
- support reference display
- keyboard and responsive behavior
- no mutation controls
- no policy-write requests
- no privileged browser headers
- no durable browser storage writes
- existing Sales Invoice Setup workflow regression guard

## Known Exclusions

This slice does not implement statutory RBAC administration, policy administration writes, ordinance upload, policy import, Site assignment, Site Group assignment, role grants, service identity administration, Operator Console changes, WebPay changes, APT changes, POS Server changes, controlled UAT, or production rollout.
