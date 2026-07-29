# ExitPass Management Platform Statutory RBAC Read-Only Catalog Implementation v1.0

## Purpose

This slice adds a read-only Access Control page for the Management Platform. It displays the Central PMS RBAC inventory and known gaps without administering or mutating RBAC state.

## Route And Permission

| Item | Value |
| --- | --- |
| Frontend route | `/management-platform/access-control` |
| Navigation label | Access Control |
| Required frontend permission | `management-platform.identity-rbac.inventory.read` |
| Backend endpoint | `GET /v1/ops/management-platform/identity-rbac/inventory` |
| Backend source | Central PMS `ManagementPlatformIdentityRbacInventoryEndpoints` |

The browser permission check controls navigation and direct-route rendering only. Central PMS remains authoritative.

## Displayed Content

The page displays:

- read-only status and backend source
- inventory timestamp
- current browser Site context when available
- permission catalog grouped by backend category
- role bundles and default restrictions
- named policy/capability mappings
- implementation status labels
- actor boundary warnings
- Site and Site Group scope posture
- separation-of-duties warnings
- backend gaps
- non-authoritative local development scenario labels

## Status Handling

The UI distinguishes implemented and enforced, implemented with limitations, contract-only, target-only, blocked by persistence, blocked by missing API, and deprecated or compatibility-only status values. Target-only values are explicitly shown as not production-ready.

## Actor And Scope Posture

Warnings state that service principals cannot approve or reject, human reviewers cannot invoke service-only payable application, queue access does not imply evidence access, policy administration does not imply review authority, and approval/rejection are independently assignable.

Scope posture states that the browser-selected Site is not an authorization grant, Site and Site Group enforcement is server-owned, durable scoped grants remain limited by the canonical persistence verdict `PRESENT_BUT_INCOMPLETE`, and unresolved scope fails closed. Unknown or unresolved scope fails closed.

## Explicit Non-Goals

This slice does not implement backend APIs, Central PMS changes, database changes, role creation, role editing, role cloning, role retirement, permission assignment, user-role assignment, Site assignment, Site Group assignment, grant revocation, grant effectivity, service-identity administration, grant audit mutation, self-review configuration writes, policy administration, Operator Console changes, WebPay changes, APT changes, POS Server changes, production authentication, controlled UAT, or production rollout.

## Browser Boundary

The browser calls only a relative Central PMS Management Platform inventory route, sends no service identity headers, sends no permission headers, sends no privileged material, and writes no RBAC inventory to localStorage, sessionStorage, IndexedDB, or frontend-managed cookies.

## Local Development Scenarios

Use `mpRbacScenario` values:

- `populated`
- `mixed`
- `empty`
- `unavailable`
- `malformed`
- `partial-scope`

Development fixtures are synthetic and non-authoritative.
