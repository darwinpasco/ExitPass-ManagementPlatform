# ExitPass Management Platform RBAC Audit Handoff v1.0

## Executive Handoff

The standalone Management Platform repository is prepared as a frontend baseline, but statutory RBAC implementation is blocked until Central PMS permission semantics, service-only application authority, Site/Site Group enforcement, and separation-of-duties configuration are finalized and proven.

## Readiness Summary

| Item | Result |
| --- | --- |
| Standalone repository | Prepared locally |
| Source extraction | Complete for current frontend |
| Source repository | Unchanged |
| Standalone build/tests | To be validated by current automation run |
| RBAC admin UI | Not implemented |
| Statutory RBAC readiness | Blocked by backend/source-of-truth gaps |
| Controlled UAT | Not authorized |
| Production | Not authorized |

## Immediate Decisions Needed

1. Decide whether the Operator Console payable-basis apply route is removed, made service-only, or retained only behind a transitional flag outside statutory controlled UAT.
2. Freeze the final Central PMS statutory permission catalog and named policy split.
3. Confirm canonical persistence for self-review and separation-of-duties configuration.
4. Publish browser-safe Management Platform admin contracts for catalog, roles, users, assignments, Site/Site Group scope, and service identities.
5. Accept and commit the standalone frontend baseline before removing the embedded source module.

## Controlled UAT Posture

Operator Console statutory RBAC controlled UAT is not authorized. WebPay statutory controlled UAT is not authorized. APT statutory controlled UAT is not authorized. Production rollout is not authorized.
