param(
    [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$resolvedProjectPath = Join-Path $repoRoot $ProjectPath

Write-Host "Management Platform I-020 human authentication consumer proof"
Write-Host "Repository: $repoRoot"

$requiredFiles = @(
    "src\humanAuthentication.ts",
    "src\HumanAuthenticationShell.tsx",
    "src\humanAuthentication.test.ts",
    "src\HumanAuthenticationShell.test.tsx",
    "src\runtimeMode.ts",
    "e2e\human-authentication.spec.ts",
    "contracts\management-platform\human-authentication-consumer-ui.v1.json",
    "docs\architecture\ExitPass_Management_Platform_Human_Authentication_Consumer_Implementation_v1.0.md",
    "docs\architecture\ExitPass_Management_Platform_Human_Authentication_Consumer_Manual_Validation_v1.0.md"
)

foreach ($relativePath in $requiredFiles) {
    $fullPath = Join-Path $resolvedProjectPath $relativePath
    if (-not (Test-Path -LiteralPath $fullPath)) {
        throw "Required H-006 artifact is missing: $relativePath"
    }
}

$authSource = (Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "src\humanAuthentication.ts")) + "`n" +
    (Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "src\HumanAuthenticationShell.tsx")) + "`n" +
    (Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "src\runtimeMode.ts"))
$mainSource = Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "src\main.tsx")
$contract = Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "contracts\management-platform\human-authentication-consumer-ui.v1.json")
$e2e = Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "e2e\human-authentication.spec.ts")
$playwrightRunner = Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "scripts\Invoke-ManagementPlatformUiPlaywrightE2e.ps1")
$manualValidation = Get-Content -Raw -LiteralPath (Join-Path $resolvedProjectPath "docs\architecture\ExitPass_Management_Platform_Human_Authentication_Consumer_Manual_Validation_v1.0.md")

foreach ($token in @(
    "/v1/human-authentication",
    "humanLoginRoute",
    "humanSessionRoute",
    "humanSessionContinueRoute",
    "humanLogoutRoute",
    "MANAGEMENT_PLATFORM",
    "X-CSRF-Token",
    'credentials: "same-origin"',
    'cache: "no-store"',
    "TOTP_REQUIRED",
    "SESSION_EXPIRED",
    "SESSION_REVOKED"
)) {
    if (-not $authSource.Contains($token)) {
        throw "Required H-006 implementation token is missing: $token"
    }
}

foreach ($token in @(
    '"browserReadableSecret": false',
    '"browserAuthStorage": false',
    '"totpPersistence": false',
    '"developmentPrincipalInProduction": false'
)) {
    if (-not $contract.Contains($token)) {
        throw "Required H-006 contract posture is missing: $token"
    }
}

foreach ($forbidden in @(
    "localStorage.setItem",
    "sessionStorage.setItem",
    "indexedDB.open",
    "caches.open",
    "Bearer ",
    "VITE_MANAGEMENT_PLATFORM_SUBJECT_REF"
)) {
    if ($authSource.Contains($forbidden)) {
        throw "Forbidden H-006 production authentication token found: $forbidden"
    }
}

if (-not $mainSource.Contains("shouldUseDevelopmentScenario(import.meta.env.DEV")) {
    throw "Production development-scenario isolation is missing from main.tsx."
}

foreach ($token in @(
    "ordinary login skips TOTP",
    "privileged login presents TOTP only when required",
    "expired or revoked protected requests",
    "assertStorageHasNoAuthenticationAuthority",
    "assertNoPrivilegedIdentityHeaders"
)) {
    if (-not $e2e.Contains($token)) {
        throw "Required H-006 browser proof is missing: $token"
    }
}

$selectorArgument = '$playwrightArguments += $TestFile.Replace("\", "/")'
$debugArgument = '$playwrightArguments += "--debug=inspector"'
$selectorIndex = $playwrightRunner.IndexOf($selectorArgument, [StringComparison]::Ordinal)
$debugIndex = $playwrightRunner.IndexOf($debugArgument, [StringComparison]::Ordinal)
if ($selectorIndex -lt 0 -or $debugIndex -lt 0 -or $selectorIndex -ge $debugIndex) {
    throw "The Playwright debug harness must pass the validated test selector before explicit --debug=inspector mode."
}
if ($playwrightRunner.Contains('$playwrightArguments += "--debug"')) {
    throw "The Playwright debug harness must not use bare --debug because it can consume the test selector."
}
if (-not $manualValidation.Contains('npm.cmd run test:e2e:debug -- -TestFile e2e\human-authentication.spec.ts') -or
    -not $manualValidation.Contains('npx.cmd playwright test e2e/human-authentication.spec.ts --reporter=list --debug=inspector')) {
    throw "The H-006 manual validation guide does not document the corrected focused Inspector command."
}

Push-Location $resolvedProjectPath
try {
    & npx.cmd vitest run src/humanAuthentication.test.ts src/HumanAuthenticationShell.test.tsx src/runtimeMode.test.ts src/apiClient.test.ts src/App.test.tsx
    if ($LASTEXITCODE -ne 0) {
        throw "Focused H-006 Vitest proof failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "Proof passed: I-020 login, TOTP, current-session, CSRF, logout, and session-loss integration are present."
Write-Host "Proof passed: browser authentication authority, TOTP persistence, privileged identity headers, and production development-principal fallback are absent."
Write-Host "Proof passed: focused debug runs keep the test selector positional and use explicit Playwright Inspector mode."
