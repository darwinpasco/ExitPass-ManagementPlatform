param([string]$ProjectPath = ".")
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$project = Join-Path $repoRoot $ProjectPath
$required = @(
  "src\identityAdministration.ts", "src\IdentityAdministrationPage.tsx",
  "src\identityAdministration.test.ts", "src\IdentityAdministrationPage.test.tsx",
  "e2e\identity-administration.spec.ts",
  "contracts\management-platform\human-identity-administration-ui.v1.json",
  "docs\architecture\ExitPass_Management_Platform_Human_Identity_Administration_Implementation_v1.0.md",
  "docs\architecture\ExitPass_Management_Platform_Human_Identity_Administration_Manual_Validation_v1.0.md"
)
foreach ($path in $required) { if (-not (Test-Path -LiteralPath (Join-Path $project $path))) { throw "Missing H-007 artifact: $path" } }
$source = (Get-Content -Raw (Join-Path $project "src\identityAdministration.ts")) + (Get-Content -Raw (Join-Path $project "src\IdentityAdministrationPage.tsx"))
$auth = Get-Content -Raw (Join-Path $project "src\humanAuthentication.ts")
$api = Get-Content -Raw (Join-Path $project "src\apiClient.ts")
foreach ($token in @("/v1/management-platform/identity", "GLOBAL_SCOPE_POLICY_NOT_APPROVED", "Approval records the decision but does not activate access", "authorizeUnsafeRequest", "expectedRowVersion")) { if (-not (($source + $auth + $api).Contains($token))) { throw "Missing H-007 proof token: $token" } }
foreach ($forbidden in @("localStorage.setItem", "sessionStorage.setItem", "indexedDB.open", "X-ExitPass-User-Id", "X-Management-Platform-Site-Id")) { if ($source.Contains($forbidden)) { throw "Forbidden H-007 browser authority found: $forbidden" } }
Push-Location $project
try {
  & npx.cmd vitest run src/identityAdministration.test.ts src/IdentityAdministrationPage.test.tsx src/humanAuthentication.test.ts src/apiClient.test.ts src/App.test.tsx
  if ($LASTEXITCODE -ne 0) { throw "Focused H-007 tests failed: $LASTEXITCODE" }
} finally { Pop-Location }
Write-Host "Proof passed: governed I-021 User Administration workspace, shared H-006 CSRF, fail-closed organization-wide access, and browser non-authority are present."
