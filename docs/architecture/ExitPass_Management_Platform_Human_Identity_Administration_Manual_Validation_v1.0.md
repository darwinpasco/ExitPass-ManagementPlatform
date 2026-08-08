# H-007 User Administration Manual Validation

## Start

```powershell
cd D:\wt\H007
npm.cmd ci
npx.cmd playwright install chromium
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
npm.cmd run test:e2e -- -TestFile e2e\identity-administration.spec.ts
npm.cmd run dev -- --port 5178
```

Open:

`http://127.0.0.1:5178/management-platform/identity-administration?mpScenario=authenticated&mpIdentityScenario=populated`

State URLs replace `populated` with `empty`, `permission-denied`, `conflict`, or `unavailable`.

## Walkthrough

1. Verify Users, user detail, Profile and Access Dates, and Account Status confirmation.
2. Open Add User and confirm there is no password or delivery-channel control.
3. Inspect Roles & Permissions and Site Access for Site and Site Group. Confirm organization-wide access is unavailable.
4. Create an Elevated Access request and confirm approval does not activate access.
5. Inspect Two-Factor Authentication and Active Sessions, then exercise authenticator and session confirmations.
6. Record an Access Review and inspect the Activity Log.
7. Verify permission denial, conflict, unavailable, and session-loss states are safe.
8. Use keyboard-only navigation at 1366x768 and 390x844. Confirm visible focus and no horizontal overflow.
9. Inspect Network: requests stay same-origin, unsafe calls contain `X-CSRF-Token`, and no actor/permission/scope authority headers appear.
10. Inspect localStorage, sessionStorage, IndexedDB, and Cache Storage. Confirm no auth, permission, scope, MFA, session, or draft authority is persisted.

Stop the Vite process with `Ctrl+C`. Remove generated `dist`, `test-results`, and `playwright-report` after evidence review. Darwin completed and passed the direct headed walkthrough before the bounded terminology cleanup.
