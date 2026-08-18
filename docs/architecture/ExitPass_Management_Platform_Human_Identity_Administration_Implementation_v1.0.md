# ExitPass Management Platform User Administration

## Purpose

H-007 adds one governed User Administration workspace at `/management-platform/identity-administration`. It consumes Central PMS I-021 under `/v1/management-platform/identity`; Central PMS remains authoritative for actors, permissions, scope, transitions, concurrency, privilege ceilings, and audit.

## H-006 integration

The workspace uses the merged H-006 human session. `HumanAuthenticationClient.authorizeUnsafeRequest` decorates unsafe requests from the existing private runtime CSRF token. `createCentralPmsApiClient` invokes that decorator only for POST, PATCH, PUT, and DELETE requests. No second token cache, auth context, current-session cache, logout flow, or session-loss handler exists.

A 401 invokes the H-006 authentication-loss callback, unmounting the workspace and clearing form state without replay. A 403 remains a scoped capability denial.

## Workspace

The User Administration workspace presents:

- server-driven user search and authorized detail;
- offset-based user-directory continuation in bounded pages of 50, with stale-response protection;
- Add User without password or invented delivery behavior;
- profile and access-date updates with row-version checks;
- server-validated Account Status changes;
- Roles & Permissions catalog and assignment controls;
- role-bound Site Access for a Site or Site Group;
- Elevated Access requests, request-reference rediscovery, and decisions;
- Two-Factor Authentication status and authenticator reset/remove;
- privacy-safe Active Sessions and sign-out controls;
- Access Review and a privacy-safe Activity Log.

Organization-wide access controls are absent. The technical backend classification `GLOBAL_SCOPE_POLICY_NOT_APPROVED` remains fail-closed. Elevated Access approval records a decision and is never presented as active authority unless an active assignment is returned later.

Successful empty role, permission, session, MFA, and Activity Log responses remain distinct from request failure. Secondary-section denial or unavailability is shown within the affected section, preserves successfully loaded user detail, and offers only a bounded retry of that request. A server-returned GLOBAL grant is visible for transparency but is read-only and cannot invoke scope revocation. Elevated Access request references remain in runtime memory only; an administrator can re-enter a reference after refresh and load the authoritative request through the existing I-021 read operation.

## Security and privacy

Requests are same-origin and cookie-backed. The browser does not send actor, permission, Site, Site Group, service-identity, or authorization authority headers. Passwords, OTP values, TOTP seeds, provisioning payloads, session secrets, cookies, hashes, and refresh tokens are neither requested nor rendered. Administration payloads and permissions are not written to localStorage, sessionStorage, IndexedDB, or Cache Storage.

## Validation

Focused Vitest coverage verifies route composition, shared CSRF decoration, user states, Add User, section-level partial failures and retries, pagination request ordering, read-only GLOBAL grants, Elevated Access rediscovery, two-factor/session privacy, safe errors, and storage non-authority. Playwright covers the integrated workspace, state variants, keyboard operation, compact layout, and browser storage.

The deterministic browser fixture is development-only: `?mpScenario=authenticated&mpIdentityScenario=populated`. Other states are `empty`, `permission-denied`, `conflict`, `unavailable`, `partial-failure`, `global-readonly`, `paginated`, and `elevated-rediscovery`.

## Limitations

- DR-05 credential-delivery policy is unresolved; the UI does not promise email or SMS delivery.
- DR-10/DR-11 remain unresolved; approval does not activate authority and organization-wide access remains unavailable.
- Darwin completed the direct headed walkthrough. The subsequent terminology cleanup changes visible copy only and is covered by focused Chromium validation.
- Controlled UAT and production rollout are not authorized by this implementation.
