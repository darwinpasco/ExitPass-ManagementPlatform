# ExitPass Management Platform RBAC Current Implementation Audit v1.0

## Evidence Sources

- Standalone frontend extracted from source commit `19315cb90442732c13d466bf7897ae59b6df2eea`.
- Source module: `src\Services\ManagementPlatformUi` in the detached source worktree.
- Central PMS statutory and RBAC comparison: `D:\SourceCodes\ExitPass-Discounts` read-only inspection.
- Canonical database comparison: `D:\SourceCodes\exitpassdb_v1.2` read-only inspection of generated SQL.

## Verdicts

| Area | Verdict | Evidence |
| --- | --- | --- |
| standalone repository preparation | SUPPORTED_AND_PROVEN | Root-level npm, Vite, Vitest, Playwright, contracts, proofs, docs, and CI prepared. |
| source extraction completeness | SUPPORTED_AND_PROVEN | No runtime import leaves the standalone repo; module files and frontend proof contracts copied. |
| source repository independence | SUPPORTED_AND_PROVEN | App builds/tests from standalone root and uses configurable Central PMS routes. |
| standalone build | SUPPORTED_AND_PROVEN | `npm run build` is part of validation. |
| standalone unit tests | SUPPORTED_AND_PROVEN | Vitest suite covers shell, permissions, Sales Invoice workflows, and storage safety assertions. |
| standalone browser tests | SUPPORTED_AND_PROVEN | Playwright Chromium specs cover manage and create-new-version workflows. |
| authentication | PARTIALLY_SUPPORTED | Frontend supports injected auth state and local development principal; production current-user readback, session expiry, and logout are not implemented in this UI. |
| permission catalog | PARTIALLY_SUPPORTED | Frontend hardcodes current UI permissions; Central PMS has a policy catalog and read-only Management Platform inventory service. |
| role administration | NOT_SUPPORTED | No role create/edit/clone/retire UI or mutation API in the Management Platform frontend. |
| user-role assignment | NOT_SUPPORTED | No user search, invitation, assignment, assignment effectivity, or scope-assignment UI. |
| service-identity administration | NOT_SUPPORTED | Canonical DB has service identity records; Management Platform UI has no administration workflow. |
| Site scope | PARTIALLY_SUPPORTED | Frontend Site selector gates current UI state; complete server-side scope proof is not available from this frontend. |
| Site Group scope | DOCUMENTED_ONLY | Canonical DB and backend contracts reference Site Group context; frontend has no Site Group administration UI. |
| statutory request permission administration | NOT_SUPPORTED | Operator Console/backend permissions exist; Management Platform cannot administer them. |
| statutory review permission administration | NOT_SUPPORTED | Backend policy strings exist; no Management Platform admin UI. |
| approval and rejection separation | PARTIALLY_SUPPORTED | Central PMS has separate approve/reject strings, but the review policy currently bundles review, approve, and reject as alternatives. |
| evidence-view separation | PARTIALLY_SUPPORTED | Evidence view/capture policies exist; no Management Platform admin UI and no protected evidence retrieval proof here. |
| audit-view administration | PARTIALLY_SUPPORTED | Audit-read strings and canonical audit tables exist; no role assignment UI. |
| policy-administration separation | PARTIALLY_SUPPORTED | Policy import and statutory policy strings exist; no Management Platform admin UI. |
| self-review configuration | NOT_SUPPORTED | No confirmed configuration model or Management Platform UI for allow self-review or require different reviewer. |
| backend route enforcement | PARTIALLY_SUPPORTED | Routes attach named policy metadata, but full fail-closed and scope enforcement proof is incomplete. |
| human-versus-service separation | CONTRADICTED_BY_CURRENT_BEHAVIOR | Operator Console exposes an apply-payable-basis endpoint/policy under human operational routes. |
| canonical persistence | PARTIALLY_SUPPORTED | Canonical SQL has users, roles, permissions, user-role, role-permission, service identity, audit, Site and Site Group fields; full statutory SOD lifecycle is not proven. |
| browser security | SUPPORTED_AND_PROVEN | Standalone source uses relative Management Platform routes, rejects privileged headers, and has no production browser storage writes. |
| automated RBAC proof | PARTIALLY_SUPPORTED | Sales Invoice permission tests exist; statutory RBAC proof matrix is missing. |
| readiness for statutory RBAC implementation | BLOCKED_BY_MISSING_SOURCE_OF_TRUTH | Permission semantics, service-only application authority, SOD config, and complete backend enforcement must be settled first. |

Overall verdict: STANDALONE_REPOSITORY_READY_RBAC_IMPLEMENTATION_BLOCKED.

## Current Feature Inventory

| Feature | Route | Component/file | API methods | Permissions checked | Backend endpoint | Tests | Status | Migration result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shell/overview | `/management-platform/`, `/management-platform/overview` | `src/App.tsx` | none | `management-platform.overview.read` | none | `src/App.test.tsx` | Implemented | Migrated |
| Navigation | shell | `src/App.tsx`, `src/permissions.ts` | none | overview/read/manage/approve | none | `src/App.test.tsx` | Implemented | Migrated |
| Site selection | shell | `src/App.tsx`, `src/siteContext.ts` | none | authorized Sites from principal | none | App and E2E tests | Implemented client-side | Migrated |
| Authentication posture | shell | `src/auth.ts` | injected/local state | principal permissions | hosting integration future | App tests | Partial | Migrated |
| Registered Business | Sales Invoice page | `src/SalesInvoiceProfilesPage.tsx` | get/create/update fiscal identity | read/manage | `/v1/management-platform/fiscal-identities` | Vitest/E2E/proofs | Implemented | Migrated |
| Sales Invoice Setup read | Sales Invoice page | same | list/get setup | read | `/v1/management-platform/sales-invoice-header-profiles` | Vitest/E2E/proofs | Implemented | Migrated |
| Sales Invoice Setup manage | Sales Invoice page | same | create/update Draft | manage | same | Vitest/E2E/proofs | Implemented | Migrated |
| Create New Setup Version | Sales Invoice page | same | one create POST | manage | same | Vitest/E2E/proofs | Implemented | Migrated |
| Validation workflow | Sales Invoice page | same | POST validate | read action | `/{id}/validate` | Vitest/proofs | Implemented | Migrated |
| Activation workflow | Sales Invoice page | same | POST approve | approve | `/{id}/approve` | Vitest/proofs | Implemented | Migrated |
| Retirement workflow | Sales Invoice page | same | POST retire | approve | `/{id}/retire` | Vitest/proofs | Implemented | Migrated |
| Issuance history | Sales Invoice page | same | get usage | read | `/{id}/usage` | Vitest/proofs | Implemented | Migrated |
| Readiness | Sales Invoice page | same | get readiness | read | `/effective-readiness` | Vitest/proofs | Implemented | Migrated |
| Policy/config pages | none | none | none | none | Central PMS future | none | Not supported | Not migrated |
| Audit/report pages | none | none | none | none | Central PMS future | none | Not supported | Not migrated |
| RBAC inventory UI | none | none | none | none | Backend read service exists | none | Not supported in UI | Not migrated |

## Permission Inventory Found

Current Management Platform frontend uses: `management-platform.overview.read`, `sales-invoice-profile.read`, `sales-invoice-profile.manage`, `sales-invoice-profile.approve`.

Central PMS comparison exposed policy/catalog strings including: `management-platform.identity-rbac.inventory.read`, `statutory-discounts.session.lookup`, `statutory-discounts.draft.view`, `statutory-discounts.draft.create`, `statutory-discounts.evidence.view`, `statutory-discounts.evidence.capture`, `statutory-discounts.decision.review`, `statutory-discounts.decision.approve`, `statutory-discounts.decision.reject`, `statutory-discounts.payable-basis.apply`, `statutory-discounts.policy.resolve`, `statutory-discounts.audit.read`, `statutory-discounts.decision.submit.operator-console`, `statutory-discounts.decision.submit.webpay`, `statutory-discounts.decision.submit.assisted-payment-terminal`, `statutory-discounts.decision.read`, fiscal issuance, reconciliation, report, dashboard, Site, Site Group, role, permission, assignment, user, and policy import permissions.

Do not freeze final statutory permission names from this audit alone. Codex I must own the final semantics.

## Gap Matrix

| Gap ID | Severity | Layer | Nature | Description | Owner | Prerequisite | Blocking effect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MP-RBAC-001 | CRITICAL | Central PMS | contradictory behavior | Operator Console has an apply-payable-basis route/policy, contradicting the clarified service-channel-only application authority. | Codex I | Frozen statutory authority model | implementation, controlled UAT, production |
| MP-RBAC-002 | CRITICAL | Management Platform | missing UI | No role, permission, user-role, scope, or service-identity administration UI exists. | Codex H | Browser-safe Central PMS contracts | implementation, merge |
| MP-RBAC-003 | HIGH | Central PMS | missing enforcement | Complete named-policy, human/service, Site, and Site Group enforcement is not proven for all statutory routes. | Codex I | Final permission catalog | controlled UAT, production |
| MP-RBAC-004 | HIGH | Canonical database | missing model | Canonical SQL supports core RBAC objects, but self-review and separation-of-duties configuration lifecycle is not proven. | Canonical database owner | Final policy requirements | implementation, controlled UAT |
| MP-RBAC-005 | HIGH | Security | missing scope | Management Platform frontend Site scope is client-side only; stale state and cross-site denial require backend proof for future admin flows. | Codex I/Codex H | Scope contracts | controlled UAT, production |
| MP-RBAC-006 | HIGH | Testing | missing test | Statutory RBAC proof matrix is missing across attendant, reviewer, auditor, policy admin, WebPay service, and APT service identities. | Codex I/G/J/H | Implemented backend policies | merge, controlled UAT |
| MP-RBAC-007 | MEDIUM | Management Platform | missing API | Management Platform can only consume local hardcoded permissions in the shell; it does not read an authoritative permission catalog. | Codex H | Central PMS catalog read contract | implementation |
| MP-RBAC-008 | MEDIUM | Central PMS | ambiguous ownership | Approval and rejection strings exist but the current review policy allows review, approve, or reject permissions to satisfy one policy. | Codex I | Final decision-policy split | implementation |
| MP-RBAC-009 | MEDIUM | Repository | repository extraction gap | Embedded Management Platform module remains in the source repository until standalone baseline is accepted. | Darwin/Codex H | Accepted standalone baseline | merge |
| MP-RBAC-010 | MEDIUM | Deployment | security risk | Local development identity fallback must be disabled or replaced by trusted production identity integration during deployment. | Codex H/Central PMS | Production hosting contract | production |
| MP-RBAC-011 | LOW | Testing | missing test | CI workflow added but not yet proven in GitHub because no remote exists. | Darwin | Remote creation | merge |

## Ownership Matrix

| Owner | Owns | Does not own |
| --- | --- | --- |
| Codex H | standalone Management Platform repository, frontend, RBAC/admin UI when contracts exist, permission-aware navigation, Vitest, Playwright, frontend docs | Central PMS permission semantics, backend enforcement, canonical RBAC persistence |
| Codex I | statutory privilege permission semantics, Central PMS named policies, request/review/decision/evidence/audit enforcement, service separation, SOD rules | frontend repository ownership |
| Codex G | WebPay service authorization and privilege application consumption | Management Platform UI |
| Codex J | APT service authorization, terminal integration, APT privilege application consumption | Management Platform UI |
| Canonical database owner | RBAC persistence, Site/Site Group schema, service identity persistence, effectivity/status/audit schema | frontend implementation |
| Darwin | staging, commits, remotes, pushes, PRs, merges, approvals | automated implementation by Codex personas |

## Minimum Target Architecture

Central PMS must publish browser-safe catalog, role, assignment, scope, and service-identity administration contracts. Central PMS must independently enforce every protected route. The canonical database must persist assignment effectivity, status, audit, scope, service identity lifecycle, and SOD configuration. Management Platform must then render administration workflows without accepting raw privileged material or treating browser permission state as authoritative.

## Recommended Implementation Sequence

1. Prepare standalone Management Platform repository.
2. Validate standalone build and automated tests.
3. Create and connect remote repository.
4. Commit and merge standalone baseline.
5. Freeze statutory privilege permission semantics in Central PMS.
6. Audit or promote canonical RBAC persistence.
7. Implement Central PMS named policies.
8. Implement Site and Site Group enforcement.
9. Implement human-versus-service identity separation.
10. Implement self-review and separation-of-duties configuration.
11. Implement Management Platform permission-catalog read.
12. Implement role administration.
13. Implement user-role and scope assignment.
14. Implement service-identity administration.
15. Remove embedded Management Platform module from source repository in a separate task.
16. Implement Operator Console permission-aware Ticket Lookup request UI.
17. Implement Operator Console permission-aware review UI.
18. Implement protected evidence enforcement.
19. Implement WebPay application permission.
20. Implement APT application permission.
21. Perform integrated RBAC walkthrough.
22. Perform controlled UAT.

Parallel work: Codex I can freeze Central PMS semantics while Codex H prepares read-only catalog UI contracts. Codex G and Codex J can prepare service-channel consumption after Codex I defines service-only application policies. Source removal must wait for accepted standalone baseline.

## Recommended First RBAC Implementation Task

Persona: Codex I.

Repository: `D:\SourceCodes\ExitPass-Discounts`.

Base branch: `dev`.

Proposed branch: `feature/statutory-privilege-permission-catalog-freeze`.

Bounded scope: define the Central PMS statutory privilege permission catalog and named policy split for request creation, queue access, detail access, evidence metadata/read, approve, reject, audit read, policy administration, service-only application request, Site scope, Site Group scope, and self-review/separation settings.

Prerequisites: accept the frozen statutory authority decisions and inspect current policy catalog plus route metadata.

Explicit non-goals: no Management Platform UI, no WebPay UI, no APT UI, no embedded source removal, no payment calculation changes.

Required tests: policy mapping tests, missing/unknown permission denial, wrong-Site denial, wrong-Site-Group denial, attendant request allowed without approve/reject, reviewer decision allowed without request creation, evidence permission separated, auditor read-only, human denied service-only application, WebPay/APT service principals allowed only on application request route, stale permission claims denied by server state.

Significant manual-testing requirement: Yes, run a synthetic-principal statutory flow walkthrough across Operator Console, WebPay service, and APT service paths before controlled UAT.
