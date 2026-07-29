# ExitPass Management Platform Source Extraction Manifest v1.0

## Source and Target

| Item | Value |
| --- | --- |
| Source repository | `D:\SourceCodes\ExitPass` |
| Source detached worktree | `D:\SourceCodes\ExitPass-H-ManagementPlatformSource` |
| Extraction source commit | `19315cb90442732c13d466bf7897ae59b6df2eea` |
| Current source `origin/dev` after validation | `fb445d5afa79ecb83fb45965afe12f2a45df2bc0` |
| Target repository | `D:\SourceCodes\ExitPass-ManagementPlatform` |
| Embedded source module | `src\Services\ManagementPlatformUi` |
| Target branch | `develop` |

The source worktree was detached at `origin/dev` when extraction began and remained clean. `origin/dev` later advanced to `fb445d5afa79ecb83fb45965afe12f2a45df2bc0`; a targeted diff across the Management Platform module, copied proof scripts, and copied UI contracts showed no changes between the extraction commit and current `origin/dev`.

## Path Mapping

| Source | Target | Notes |
| --- | --- | --- |
| Embedded module root files | Repository root | Standalone frontend layout. |
| Embedded `src` | `src` | Copied as browser source and tests. |
| Embedded `e2e` | `e2e` | Copied Playwright specs. |
| Embedded `scripts` | `scripts` | Copied E2E runner. |
| Source root Management Platform proofs | `scripts` | Copied valid frontend proofs only. |
| Source root UI contracts | `contracts/management-platform` | Copied browser-facing contracts. |

## Copied Files

Copied unchanged initially: package metadata and lock file, TypeScript configs, Playwright config, source files, tests, E2E specs, base README, module E2E runner, UI contracts, and Management Platform proof scripts.

## Transformed Files

| File | Change |
| --- | --- |
| `package.json` | Development script now uses `127.0.0.1` and `--strictPort`. |
| `vite.config.ts` | Development port defaults to 5178 through `MANAGEMENT_PLATFORM_DEV_PORT`; proxy target remains configurable. |
| `scripts/*.ps1` | Project path defaults changed from monorepo subpath to repository root. |
| `scripts/Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiE2eProof.ps1` | Expected branch changed to `develop`; generated-artifact staging scan changed to standalone paths. |
| `README.md` | Rewritten for standalone ownership, commands, limits, and handoff posture. |
| `.env.example` | Added browser-safe placeholder configuration. |
| `.github/workflows/ci.yml` | Added Windows frontend validation workflow. |
| `docs/*` | Added standalone architecture, extraction, handoff, and RBAC audit documentation. |

## Omitted Files

`node_modules`, `dist`, coverage output, Playwright reports, test results, local caches, `.env`, local logs, unrelated Operator Console files, WebPay files, APT files, POS Server files, Central PMS implementation files, database files, and POS Server client proof artifacts were omitted.

## Dependencies

The standalone frontend depends on npm packages declared in `package.json` and browser-facing Central PMS routes. No runtime import leaves the standalone repository. Browser-safe DTOs remain local TypeScript types under `src` and UI contract JSON under `contracts/management-platform` until an approved generator exists.

## Monorepo Assumptions Removed

The build and test scripts now run from the standalone repository root. Proof scripts no longer require a monorepo project subpath. Development and E2E ports use the standalone Codex H allocation.

## Remaining External Assumptions

Central PMS must expose Management Platform browser routes under `/v1/management-platform`. Authenticated production identity, RBAC catalog mutation APIs, role/user assignment APIs, service-identity administration APIs, and statutory RBAC semantics remain outside this repository.

## Source Repository Cleanup Candidates

After Darwin accepts and merges the standalone baseline, the embedded Management Platform module and duplicated proof/contract artifacts in the source repository can be removed in a separate pull request. Source removal is not part of this task.

## Source Modification Proof

The detached source worktree stayed clean. The active source repository was not modified by this extraction task.
