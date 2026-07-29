# ExitPass Management Platform Standalone Repository Handoff v1.0

## Repository State

The local standalone repository is initialized on branch `develop` with no commits and no configured remote. The GitHub CLI was not available in this session, so remote existence was not confirmed by Codex H. Darwin should verify before remote creation.

## Validation Commands

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
$env:MANAGEMENT_PLATFORM_E2E_PORT = "5179"
$env:MANAGEMENT_PLATFORM_E2E_PRODUCTION_PORT = "5180"
npm.cmd run test:e2e
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformUiFoundationProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileReadUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileManageUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceProfileApproveRetireUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiProof.ps1
powershell -ExecutionPolicy Bypass -File scripts\Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiE2eProof.ps1
```

## Manual Walkthrough

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
$env:MANAGEMENT_PLATFORM_DEV_PORT = "5178"
npm.cmd run dev
```

Open `http://127.0.0.1:5178/management-platform/?mpProfileScenario=new-version-success` and verify the shell, Site selector, Registered Business, Sales Invoice Setup, Create New Setup Version flow, responsive layout, keyboard navigation, externally configured Central PMS base path, and browser storage posture.

## Darwin Git Commands When Remote Does Not Exist

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
git status --short --branch --untracked-files=all
git add .env.example .github/workflows/ci.yml .gitignore README.md contracts/management-platform/management-platform-ui-foundation.v1.json contracts/management-platform/sales-invoice-profile-api.v1.json contracts/management-platform/sales-invoice-profile-approve-retire-ui.v1.json contracts/management-platform/sales-invoice-profile-manage-ui.v1.json contracts/management-platform/sales-invoice-profile-read-ui.v1.json contracts/management-platform/sales-invoice-setup-new-version-ui.v1.json docs/architecture/ExitPass_Management_Platform_Standalone_Architecture_v1.0.md docs/migration/ExitPass_Management_Platform_Source_Extraction_Manifest_v1.0.md docs/migration/ExitPass_Management_Platform_Standalone_Repository_Handoff_v1.0.md docs/rbac/reviews/ExitPass_Management_Platform_RBAC_Current_Implementation_Audit_v1.0.md docs/rbac/reviews/ExitPass_Management_Platform_RBAC_Current_Implementation_Audit_Handoff_v1.0.md e2e/sales-invoice-profile-manage.spec.ts e2e/sales-invoice-setup-new-version.spec.ts index.html package-lock.json package.json playwright.config.ts scripts/Invoke-ManagementPlatformSalesInvoiceProfileApproveRetireUiProof.ps1 scripts/Invoke-ManagementPlatformSalesInvoiceProfileManageUiProof.ps1 scripts/Invoke-ManagementPlatformSalesInvoiceProfileReadUiProof.ps1 scripts/Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiE2eProof.ps1 scripts/Invoke-ManagementPlatformSalesInvoiceSetupNewVersionUiProof.ps1 scripts/Invoke-ManagementPlatformUiFoundationProof.ps1 scripts/Invoke-ManagementPlatformUiPlaywrightE2e.ps1 src/App.test.tsx src/App.tsx src/SalesInvoiceProfilesPage.test.tsx src/SalesInvoiceProfilesPage.tsx src/apiClient.test.ts src/apiClient.ts src/auth.ts src/config.ts src/main.tsx src/manualScenarios.ts src/permissions.ts src/salesInvoiceProfiles.ts src/siteContext.ts src/styles.css src/test/setup.ts src/types.ts src/vite-env.d.ts tsconfig.app.json tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "feat: initialize standalone Management Platform" -m "Extract the Management Platform frontend into a standalone repository.\n\nIncludes React, TypeScript, Vite, Vitest, Playwright, UI contracts, proof scripts, standalone documentation, and RBAC readiness audit.\n\nNo statutory RBAC behavior is implemented in this baseline."
gh repo create darwinpasco/ExitPass-ManagementPlatform --private --source . --remote origin
git push -u origin develop
```

## If The Remote Already Exists

```powershell
cd D:\SourceCodes\ExitPass-ManagementPlatform
git remote add origin https://github.com/darwinpasco/ExitPass-ManagementPlatform.git
git fetch origin
git push -u origin develop
```

Do not remove the embedded source module until this standalone baseline is accepted, committed, pushed, and approved by Darwin.
