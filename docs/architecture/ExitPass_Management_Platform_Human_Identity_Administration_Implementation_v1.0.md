# ExitPass Management Platform User Administration

## Purpose

H-007 adds one governed User Administration workspace at `/management-platform/identity-administration`. It consumes Central PMS I-021 under `/v1/management-platform/identity`; Central PMS remains authoritative for actors, permissions, scope, transitions, concurrency, privilege ceilings, and audit.

## H-006 integration

The workspace uses the merged H-006 human session. `HumanAuthenticationClient.authorizeUnsafeRequest` decorates unsafe requests from the existing private runtime CSRF token. `createCentralPmsApiClient` invokes that decorator only for POST, PATCH, PUT, and DELETE requests. No second token cache, auth context, current-session cache, logout flow, or session-loss handler exists.

A 401 invokes the H-006 authentication-loss callback, unmounting the workspace and clearing form state without replay. A 403 remains a scoped capability denial. I-021 uses the normal active H-006 session for reads and mutations; privileged-account TOTP is enforced at login and User Administration adds no step-up or separate freshness flow.

## Workspace

The User Administration workspace presents:

- server-driven user search and authorized detail;
- offset-based user-directory continuation in bounded pages of 50, with stale-response protection;
- Add User with an eight-character minimum username, no client-generated password, one required initial role, and its required authoritative scope assignment;
- profile and access-date updates with row-version checks;
- server-validated Account Status changes;
- Roles & Permissions catalog and assignment controls;
- role-bound Site Access for a Site or Site Group;
- Elevated Access requests, request-reference rediscovery, and decisions;
- Two-Factor Authentication status and administrator setup/reset/remove, with one-time replacement provisioning;
- privacy-safe Active Sessions and sign-out controls;
- Access Review and a privacy-safe Activity Log.

Organization-wide access controls are absent. The technical backend classification `GLOBAL_SCOPE_POLICY_NOT_APPROVED` remains fail-closed. Elevated Access approval records a decision and is never presented as active authority unless an active assignment is returned later.

Successful empty role, permission, session, MFA, and Activity Log responses remain distinct from request failure. Secondary-section denial or unavailability is shown within the affected section, preserves successfully loaded user detail, and offers only a bounded retry of that request. A server-returned GLOBAL grant is visible for transparency but is read-only and cannot invoke scope revocation. Elevated Access request references remain in runtime memory only; an administrator can re-enter a reference after refresh and load the authoritative request through the existing I-021 read operation.

Add User requires a username of at least eight characters because Central PMS uses the exact stored, case-sensitive username as the temporary password. The browser never generates or submits a password. It submits the approved role and authoritative scope selection, and Central PMS independently validates the role, scope, privilege, and delegation ceilings before persistence. Central PMS commits the user, credential verifier, TOTP authenticator, role assignment, scope grant, and audit evidence together; a failure creates nothing. The one-time panel displays the returned username, temporary password, 72-hour expiry, TOTP secret, and locally rendered QR code exactly as returned, then destroys them when closed.

An unsafe transport or 5xx result is treated as uncertain. Previously loaded information remains visible but is marked stale, and Add User plus profile, Account Status, role, scope, MFA, session, and access-review mutations remain disabled until the directory and selected-user authority reload successfully. The browser never replays the failed command.

The root route opens the first module present in the current-session permission presentation while preserving every destination guard. An authenticated principal with no available module receives an explicit no-authorized-modules state. Direct Site and Site Group grants remain distinct; a Site Group-only principal sees that indirect posture instead of the misleading zero-access message.

At desktop width the directory and detail remain side by side. At tablet and narrow widths, selecting a user moves and focuses the selected-user detail before the potentially 50-row directory, while pagination and keyboard access remain available.

## Security and privacy

Requests are same-origin and cookie-backed. The browser does not send actor, permission, Site, Site Group, service-identity, or authorization authority headers. Ordinary MFA status, user detail, and session reads never request or render TOTP provisioning material. Successful Add User bootstrap and administrator TOTP setup/reset responses are the only one-time views of a shared secret and provisioning URI. A local `qrcode` renderer converts the exact URI to an SVG data URI; no external QR service is contacted. The secret, URI, and QR exist only in component state and the current DOM, are removed when the panel closes, and are never written to localStorage, sessionStorage, IndexedDB, Cache Storage, URL/history state, logs, or analytics.

## Validation

Focused Vitest coverage verifies route composition, shared CSRF decoration, user states, Add User QR rendering, active and absent authenticator controls, one-time setup/reset display and destruction, remove without provisioning, section-level failures, two-factor/session privacy, safe errors, and storage non-authority. Playwright covers the integrated workspace, local QR rendering, one-time reset cleanup, remove-to-setup transition, state variants, keyboard operation, compact layout, and browser storage.

The deterministic browser fixture is development-only: ?mpScenario=authenticated&mpIdentityScenario=populated. Other states are empty, permission-denied, conflict, unavailable, partial-failure, global-readonly, paginated, elevated-rediscovery, and mutation-uncertain.

## Limitations

- DR-05 credential-delivery policy is unresolved; the UI does not promise email or SMS delivery.
- DR-10/DR-11 remain unresolved; approval does not activate authority and organization-wide access remains unavailable.
- Darwin completed the direct headed walkthrough. The subsequent terminology cleanup changes visible copy only and is covered by focused Chromium validation.
- Controlled UAT and production rollout are not authorized by this implementation.
