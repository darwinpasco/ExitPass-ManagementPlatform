# ExitPass Management Platform User Administration and Authentication

## Current state and gap assessment

Assessment date: 2026-09-17  
Branch baseline: `origin/develop` at `2016e16`

This assessment was completed before the H3 implementation changes. Central PMS remains the authority for identity, roles, scopes, account state, authentication, password lifecycle, and TOTP state.

| Area | Current state | Gap against the approved model | Required disposition |
| --- | --- | --- | --- |
| Add User | Creates a user with one initial role and governed scope, then consumes Central PMS one-time password and TOTP provisioning material. | The username must satisfy the bootstrap password minimum because Central PMS uses the exact stored username as the temporary password. | Require at least eight username characters with the approved explanation; send no client-generated password; render the authoritative temporary password exactly as returned; never persist provisioning secrets. |
| Edit User | Profile and dates can be edited. Role additions are filtered by `allowedUserTypes`. | A user's legacy type can hide otherwise approved roles and creates a browser-side compatibility rule. The selected user's type is displayed as though it governs role eligibility. | Stop filtering roles by user type. Submit role references/codes and let H1 validate assignments. Keep user type, if returned, as informational legacy data only. |
| Role selector | Uses the Central PMS catalog, but requires `directAddUserEligible`, rejects privileged roles from Add User, and filters on `allowedUserTypes`. Synthetic fixtures include unapproved Support and Merchant roles and an old System/RBAC Administrator label. | The visible catalog does not match the eight approved assignable roles. System Administrator can be presented as privileged operational authority. | Allow only H1 catalog entries carrying the eight approved role codes. Display approved application access and administrative limitations. Never infer permissions from the selected role. |
| Scope selector | Offers Site and Site Group only. Returned Global grants are read-only and described as unavailable. | Executive / Management must always use Global scope. Operations Supervisor must support assigned operational Sites while its statutory supervisory permission is all-sites authority resolved by H1, not a browser grant. Several roles are application-only and do not need a Site selection in this Management Platform flow. | Use H1 role assignment policy metadata. Enforce Executive Global-only presentation. Submit `GLOBAL` only when H1 marks it required and delegable. Do not translate Global into a null scope. Do not manufacture statutory permissions. |
| User type and initial role | User type is selected before role and controls the available role list. | This is hard-coded user-type-to-role behavior and conflicts with the approved role model. | Remove user type from role selection and creation authority. H1 may continue returning a legacy classification for read-only display during migration. |
| TOTP administration | Security view displays enrollment status and supports reset/remove. It intentionally never displays a seed, provisioning URI, or QR code. | Add User has no approved one-time authenticator provisioning flow. Status wording says TOTP is required only for elevated access. | Show secret/QR material only from the create-user provisioning response and only while that in-memory panel remains open. Thereafter show status only. Update wording for Management Platform sign-in. |
| Management Platform login | Ordinary accounts use username and password. TOTP appears only after a `TOTP_REQUIRED` response. | Approved login always requires username, password, and TOTP. | Render and submit all three fields together. H2 validates all credentials and remains the only authentication authority. |
| Forced password change | A `passwordChangeRequired` session is blocked by a generic message that directs the user elsewhere. | There is no first-password-change UI or routing. | Route directly to first password change. Require temporary/current password, TOTP, and new password, then rediscover/authenticate the server session. |
| Forgot password | No UI or client contract exists. | Active-account recovery and expired-temporary-password recovery are missing. | Add two explicit flows: username + TOTP + new password; and username + expired temporary password + TOTP + new password. Do not add email, SMS, or out-of-band OTP flows. |
| Password mutation | No password mutation client methods exist. | The UI cannot guarantee that every password mutation sends a TOTP. | Define separate typed H2 requests whose required fields always include `totpCode`; do not provide a TOTP-free adapter method. |
| Tests | Existing tests prove challenge-based TOTP, ordinary password-only login, Global fail-closed behavior, legacy type filtering, and absence of provisioning secrets. | Several assertions encode the superseded behavior. | Replace them with coverage for approved role display, Executive Global-only scope, three-field login, one-time provisioning, forced change routing, and both recovery variants. |

## Authority boundaries

- The UI may constrain and explain choices from the approved product model, but it does not grant authority.
- H1 must return the assignable role catalog, role assignment policy, delegable scope choices, and effective readback. H1 validates every role/scope combination atomically.
- H2 must validate the username, use the exact stored username as the temporary password, create and validate TOTP secrets, classify password state, mutate passwords, and issue or refresh the authenticated session.
- The browser keeps passwords, TOTP values, and provisioning material in component memory only and clears them when the flow exits.
- A System Administrator description is limited to Management Platform identity administration. It must not imply operational, cashier, statutory-discount approval, or business-workflow authority.

## Integrated contract closure

The consumer contract is recorded in `contracts/management-platform/user-administration-auth-redesign-ui.v1.json` and is aligned to `integration/codex-h-identity-auth-v13` at backend closure commit `7667a9ce6bb5c3599bb883bd7eeb9904efb6f995`. Production uses only the documented Central PMS routes and rejects absent or malformed policy or provisioning fields.

## Final authority-boundary verification

Reviewed on 2026-09-17 against the completed Central PMS integration contract on `integration/codex-h-identity-auth-v13`, closure commit `7667a9ce6bb5c3599bb883bd7eeb9904efb6f995`.

- `src/approvedIdentityRoles.ts` is presentation-only. It contains supported display codes, labels, descriptions, and application label formatting. It contains no application eligibility, allowed-scope, default-scope, permission, or role-to-permission rules.
- Production role options originate at `GET /v1/management-platform/identity/roles`. H3 validates and consumes `applicationAccess`, `scopePolicy.allowedScopeTypes`, `scopePolicy.assignmentRequired`, and optional `scopePolicy.defaultScope`. A non-null default outside the allowed set rejects the catalog.
- Null or absent `defaultScope` never selects the first allowed scope. An administrator must select explicitly when an assignment is required.
- Create User accepts only the closed response state: ACTIVE account, PASSWORD_CHANGE_REQUIRED invitation, null activation delivery mode, ONE_TIME_BOOTSTRAP classification, null one-time activation, and `oneTimeBootstrap.passwordChangeRequired=true`.
- ACTIVE describes account state. Normal application access remains blocked until H2 completes the required password change.
- H3 uses H2's `/login`, restricted-session `/password/change`, and `/password-resets` routes. Every password mutation includes TOTP. Credential mutation revokes prior session authority, and H3 clears runtime state and returns to login.
- The synthetic catalog and provisioning adapter are reachable only when both `import.meta.env.DEV` and the isolated test harness are enabled. Production has no synthetic identity or authentication fallback.
- Native Parking device ownership and native application authorization remain outside H3. APT terminal ownership, enrollment, and device-bound authorization also remain outside H3.
