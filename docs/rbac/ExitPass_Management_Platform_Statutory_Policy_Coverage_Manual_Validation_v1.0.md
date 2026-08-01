# ExitPass Management Platform Statutory Policy Coverage Manual Validation v1.0

Significant manual testing is required before PR readiness.

## Commands

```powershell
cd D:\SourceCodes\ExitPass-H-StatutoryPolicyCoverage
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
npm.cmd run test:e2e
npm.cmd run dev -- --port 5178
```

Stop the local Vite server with `Ctrl+C` in the same terminal.

## URLs

- Site Group coverage: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=site-group-covered`
- Site coverage: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=site-covered`
- Senior Citizen: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=senior-citizen`
- PWD: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=pwd`
- Covered and mixed states: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=mixed`
- No coverage: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=no-coverage`
- Empty: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=empty`
- Scope denied: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=scope-denied`
- Source unavailable: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=source-unavailable`
- Malformed response: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=malformed-response`
- Malformed authoritative record: `http://127.0.0.1:5178/management-platform/statutory-policy-coverage?mpScenario=authenticated&mpPolicyCoverageScenario=malformed-authoritative`

## Walkthrough

1. Confirm navigation shows `Statutory Policy Coverage` only for the authorized scenario.
2. Confirm the page states it is read-only and Central PMS authoritative.
3. Confirm Site Group scope loads and displays the selected Site Group.
4. Change scope type to `Site`; confirm Site selection is constrained to authorized Sites.
5. Select Senior Citizen and PWD filters; confirm the UI does not invent fields absent from the payload.
6. Confirm covered, not-covered, empty, unavailable, denied, malformed, future-effective, expired, and incomplete states.
7. Resize to narrow desktop and confirm no incoherent overlap.
8. Use keyboard Tab navigation and confirm visible focus on navigation, filters, retry, and table controls.
9. Inspect browser Network; confirm only GET requests to `/v1/ops/management-platform/statutory-discounts/policy-coverage`.
10. Confirm requests do not contain `Authorization`, `X-ExitPass-Permissions`, `X-Management-Platform-Permissions`, `X-ExitPass-Service-Identity-Id`, or `X-ExitPass-User-Id`.
11. Inspect browser Storage; confirm no statutory policy coverage response is persisted in durable browser storage.
12. Confirm there are no mutation controls for create, edit, delete, activate, deactivate, upload, approve, apply, override, recalculate, publish, or import.

Manual result remains pending Darwin.
