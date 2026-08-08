# ExitPass Management Platform Human Authentication Consumer Manual Validation v1.0

## Status

Significant headed-browser validation is required before Controlled UAT. Use synthetic fixtures only. Darwin's final walkthrough remains pending until recorded separately.

## Start

```powershell
cd D:\wt\H006
npm.cmd ci
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
$env:MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT = "5180"
npm.cmd run test:e2e:debug -- -TestFile e2e\human-authentication.spec.ts
```

The script validates the file selector and invokes `npx.cmd playwright test e2e/human-authentication.spec.ts --reporter=list --debug=inspector`. The explicit Inspector mode keeps the test file as a positional selector. The focused debug suite starts and stops its own synthetic same-origin fixture servers. Playwright Inspector pauses each deterministic scenario for deliberate browser, Network, and Storage inspection. Do not start another Vite process. The suite uses `http://127.0.0.1:5179/management-platform` and intercepts only the same-origin I-020 routes with synthetic responses. No production credentials are required.

## Walkthrough

1. Ordinary login: use `ordinary.user` / `ordinary-password`; verify no TOTP step appears, the workspace opens, and refresh rediscovers the server session.
2. Privileged login: use `privileged.admin` / `privileged-password`; submit `000000` to verify the safe invalid-code state, then `123456` to complete the synthetic TOTP flow.
3. Invalid credentials: use `unknown.user` / `wrong-password`; verify the message does not reveal account existence.
4. Throttling: use `throttled.user` with any password; verify the retry-safe message.
5. Logout: sign out and verify refresh remains at login.
6. Resize to `390 x 844`; verify fields and actions remain reachable with no horizontal overflow.
7. Use keyboard only; verify initial username focus, tab order, TOTP focus, and visible focus rings.
8. In Network, verify only relative `/v1/human-authentication/*` requests and no Authorization, actor, permission, service-identity, Site, or Site Group authority headers. Confirm logout sends `X-CSRF-Token`.
9. In Application/Storage, verify no auth, permission, scope, session, password, or TOTP data in localStorage, sessionStorage, IndexedDB, or Cache Storage.
10. Verify production preview ignores all `mpScenario` query parameters and still performs session readback.

## Cleanup

The repository E2E script tracks and stops only Vite processes that it starts. After the run, verify ports `5179` and `5180` have no listener. Generated `dist`, `playwright-report`, and `test-results` are ignored and must not be staged.
