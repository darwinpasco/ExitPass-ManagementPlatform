# ExitPass Management Platform Statutory RBAC Read-Only Catalog Manual Validation v1.0

## Setup

```powershell
cd D:\SourceCodes\ExitPass-H-StatutoryRbacReadOnly
npm.cmd ci
```

## Start Local Scenario Server

```powershell
cd D:\SourceCodes\ExitPass-H-StatutoryRbacReadOnly
$env:MANAGEMENT_PLATFORM_DEV_PORT = "5178"
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=populated
```

## Fixture URLs

| Scenario | URL |
| --- | --- |
| Fully populated inventory | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=populated` |
| Implemented and target-only mix | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=mixed` |
| Access denied | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=permission-denied&mpRbacScenario=populated` |
| Empty inventory | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=empty` |
| Backend unavailable | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=unavailable` |
| Malformed response | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=malformed` |
| Partial scope support | `http://127.0.0.1:5178/management-platform/access-control?mpScenario=authenticated&mpRbacScenario=partial-scope` |

## Visual Checklist

Verify:

- Access Control navigation appears for authorized users
- navigation is hidden or direct route is denied without permission
- permission grouping is readable
- role-bundle grouping is readable
- implementation status is not color-only
- target-only values are not presented as production-ready
- human/service actor warnings are visible
- Site and Site Group scope posture is visible
- browser-selected Site is not presented as a grant
- access denied, empty, unavailable, malformed, and partial-scope states are safe
- filter and reset do not mutate backend state
- no role, permission, assignment, Site, Site Group, grant, service-identity, or policy write controls appear
- 768x900 and 1024x768 layouts remain usable
- keyboard focus reaches navigation and filter controls

## Run Playwright

```powershell
cd D:\SourceCodes\ExitPass-H-StatutoryRbacReadOnly
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
$env:MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT = "5180"
npm.cmd run test:e2e
```

If another worktree owns those ports, choose unused overrides and record them:

```powershell
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5279"
$env:MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT = "5280"
npm.cmd run test:e2e
```

## Stop Local Server

Stop only the terminal session that started `npm.cmd run dev` for this worktree.

## Clean Generated Artifacts

Generated folders are ignored by Git. Darwin may remove them after review:

```powershell
cd D:\SourceCodes\ExitPass-H-StatutoryRbacReadOnly
Remove-Item -Recurse -Force dist, node_modules, playwright-report, test-results -ErrorAction SilentlyContinue
```
