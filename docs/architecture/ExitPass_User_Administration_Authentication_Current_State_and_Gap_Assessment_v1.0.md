# ExitPass Management Platform User Administration and Authentication

## Current state and gap assessment

Assessment date: 2026-09-17  
Branch baseline: `origin/develop` at `2016e16`

This assessment was completed before the H3 implementation changes. Central PMS remains the authority for identity, roles, scopes, account state, authentication, password lifecycle, and TOTP state.

| Area | Current state | Gap against the approved model | Required disposition |
| --- | --- | --- | --- |
| Add User | Creates a user with one initial role and one Site or Site Group grant. The form says credentials are handled separately. | Creation does not consume or present the backend-generated temporary password and TOTP provisioning material. It derives legacy user types from role metadata and then filters initial roles by user type. Global scope is unavailable. | Make role the primary choice; show all eight approved assignable roles returned by H1; apply approved role presentation and scope constraints; consume a one-time provisioning result from H1/H2; never persist provisioning secrets. |
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
- H2 must create and validate temporary passwords and TOTP secrets, classify password state, mutate passwords, and issue or refresh the authenticated session.
- The browser keeps passwords, TOTP values, and provisioning material in component memory only and clears them when the flow exits.
- A System Administrator description is limited to Management Platform identity administration. It must not imply operational, cashier, statutory-discount approval, or business-workflow authority.

## Contract gaps to hand off

The implementation contract is recorded in `contracts/management-platform/user-administration-auth-redesign-ui.v1.json`. Until H1/H2 implement it, only the existing development scenario adapter may return synthetic provisioning material. Production requests use the documented routes and fail closed on absent or malformed fields.

## Final authority-boundary verification

Reviewed on 2026-09-17 against the parked H1 worktree `feature/management-platform-role-model-redesign` and H2 worktree `feature/human-authentication-policy-redesign`, both based at `b39d07f9` with their scoped work still present as working-tree changes.

- `src/approvedIdentityRoles.ts` is presentation-only. It contains supported display codes, labels, descriptions, and application label formatting. It contains no application eligibility, allowed-scope, default-scope, permission, or role-to-permission rules.
- Production role options originate at `GET /v1/management-platform/identity/roles`. H3 validates the response contract and then uses its `applicationAccess`, `scopePolicy`, lifecycle, human-assignability, and direct-add fields. Missing metadata, an unsupported role code, or an invalid scope value rejects the complete catalog and disables mutation.
- The synthetic catalog is reachable only through the identity scenario resolver, which requires both `import.meta.env.DEV` and the separately enabled isolated test harness. Normal development and production use the Central PMS client.

### H1 parked-contract mismatch

H1 owns the correct policy in `ApprovedIdentityRoleCatalog` and enforces role/scope combinations in the repository, including Executive / Management Global-only behavior. The current `IdentityRoleDefinition` returned by `/v1/management-platform/identity/roles` does not serialize `AllowedApplicationAudiences` or `AllowedAssignmentScopes`; therefore it cannot satisfy H3's fail-closed consumer contract yet. The create-user request also still requires `UserType` and `ActivationDeliveryMode`, and its admin-issued flow carries `AdminIssuedHandoffAcknowledged`. H3 does not derive user type or silently assert a handoff acknowledgement, so H1/H2 must remove, derive, or authoritatively supply those values before production user creation can integrate.

### H2 parked-contract alignment

H3 now uses H2's implemented routes and shapes: `/login`, restricted-session `/password/change`, and the single `/password-resets` route with optional `expiredTemporaryPassword`. H3 maps `oneTimeBootstrap.temporaryPassword`, `temporaryPasswordExpiresAt`, `totpSharedSecret`, and `totpProvisioningUri` from atomic provisioning. Password mutations accept only H2's `PASSWORD_CHANGED` or `PASSWORD_RESET_COMPLETED` outcomes, clear runtime session state, and return to login because credential-version changes invalidate prior sessions.
