# ExitPass Management Platform Human Authentication Consumer Implementation v1.0

## Purpose

H-006 replaces production development-principal composition with the Central PMS I-020 human session runtime. The Management Platform consumes authentication; it does not validate credentials, issue sessions, determine privileged status, calculate permissions, or calculate Site and Site Group authority.

## Authoritative contract

The implementation uses the merged I-020 browser routes:

- `POST /v1/human-authentication/login`
- `GET /v1/human-authentication/session`
- `POST /v1/human-authentication/session/continue`
- `POST /v1/human-authentication/logout`

The login audience is fixed to `MANAGEMENT_PLATFORM`. Central PMS decides whether the submitted account requires TOTP. The browser never derives privileged status from role names or local permission data.

## Runtime architecture

`HumanAuthenticationShell` owns bounded in-memory presentation state. On startup and browser refresh it calls current-session readback before rendering protected content. A valid response is mapped into display name, username, effective permission codes, Site references, Site Group references, global-scope posture, MFA posture, and the earliest server session expiry. I-020 does not return Site display names, so this slice labels returned references by ordinal scope without inventing names or Site Group relationships. These facts drive presentation only; every protected API remains server-authorized.

Ordinary users submit username and password and proceed directly to current-session readback. Privileged users see the TOTP field only after Central PMS returns `TOTP_REQUIRED`. Password and TOTP input remain component memory only and are cleared after success, cancellation, session loss, or unmount.

I-020 may return a restricted authenticated session when password change or authenticator enrollment is required. H-006 does not implement those governed account workflows. The shell blocks the workspace, explains that account action is required, and permits server-backed logout.

## Cookie and CSRF boundary

The browser uses `credentials: same-origin` and does not read the secure HttpOnly session cookie. It creates no bearer token, refresh token, or session-secret state. The `X-CSRF-Token` response value is retained only inside the authentication client instance and is sent on session continuation and logout. It is cleared on logout, session failure, or component unmount.

Login is sent without a client-authored CSRF value because I-020 uses its origin-validated login contract. Missing runtime CSRF blocks protected session mutation before fetch; server `CSRF_VALIDATION_FAILED` is mapped to a controlled response.

## Development composition

Synthetic development principals remain available only when a development build receives an explicit `mp*Scenario` query parameter. Production builds ignore those parameters and always compose the I-020 session shell. Direct `App` composition without an injected principal also fails unauthenticated when development scenarios are disabled.

## Session loss and authorization

A protected API `401` notifies the session shell, removes protected content, clears sensitive in-memory state, and returns to login without replaying the operation. A `403` remains an authenticated authorization denial and does not create a fake logout. Client-known idle or absolute expiry also locks the workspace at the earlier server timestamp.

Logout completes the Central PMS request before clearing the workspace. An unavailable logout does not falsely claim that the server session was revoked.

## Security and privacy

Production browser code does not persist session data, permissions, scope, passwords, or TOTP values in localStorage, sessionStorage, IndexedDB, Cache Storage, cookies managed by the frontend, URLs, or logs. Authentication requests contain no client-authored actor, role, permission, Site, Site Group, service-identity, or Authorization headers. Authentication errors use controlled classifications and never render raw backend details.

## Validation

Vitest covers the exact routes, request shape, same-origin credentials, CSRF lifecycle, error mapping, ordinary login, privileged TOTP, current-session bootstrap, logout confirmation, restricted sessions, storage non-authority, and production development-principal prohibition. Chromium covers login, TOTP, refresh rediscovery, logout, throttling, expiry/revocation, `403` retention, unavailable/malformed responses, responsive layout, keyboard focus, network headers, and browser storage.

## Exclusions and follow-on work

H-006 does not implement user, role, scope, MFA, session, or privileged-access administration. Those remain H-007 work after I-021. Controlled UAT and production rollout remain unauthorized.
