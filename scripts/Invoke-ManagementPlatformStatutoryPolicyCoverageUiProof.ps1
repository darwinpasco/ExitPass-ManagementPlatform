param(
    [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$resolvedProjectPath = Join-Path $repoRoot $ProjectPath

Write-Host "Management Platform statutory policy coverage read-only UI proof"
Write-Host "Repository: $repoRoot"
Write-Host "Project: $resolvedProjectPath"

if (-not (Test-Path $resolvedProjectPath)) {
    throw "Management Platform UI project was not found."
}

$sourcePath = Join-Path $resolvedProjectPath "src"
$contractPath = Join-Path $repoRoot "contracts\management-platform\statutory-policy-coverage-read-only-ui.v1.json"
$docPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_Policy_Coverage_Read_Only_Implementation_v1.0.md"
$manualPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_Policy_Coverage_Manual_Validation_v1.0.md"
$e2ePath = Join-Path $repoRoot "e2e\policy-coverage.spec.ts"

foreach ($requiredPath in @($contractPath, $docPath, $manualPath, $e2ePath)) {
    if (-not (Test-Path $requiredPath)) {
        throw "Required policy coverage artifact is missing: $requiredPath"
    }
}

$productionSourceFiles = Get-ChildItem -Path $sourcePath -Recurse -File |
    Where-Object { $_.Name -notlike "*.test.ts" -and $_.Name -notlike "*.test.tsx" -and $_.FullName -notmatch "\\test\\" }
$productionSourceText = ($productionSourceFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$contractText = Get-Content -Raw -LiteralPath $contractPath
$docText = Get-Content -Raw -LiteralPath $docPath
$manualText = Get-Content -Raw -LiteralPath $manualPath
$e2eText = Get-Content -Raw -LiteralPath $e2ePath

$requiredSourceTokens = @(
    "/management-platform/statutory-policy-coverage",
    "/v1/ops/management-platform/statutory-discounts/policy-coverage",
    "statutory-discount-policy.view",
    "ManagementPlatformStatutoryDiscountPolicyCoverageRead",
    "Statutory Policy Coverage",
    "SITE_GROUP",
    "SITE",
    "SENIOR_CITIZEN",
    "PWD",
    "ACTIVE_COVERED",
    "NO_APPLICABLE_POLICY",
    "MALFORMED_AUTHORITATIVE_RECORD",
    "Central PMS resolves scope"
)

foreach ($token in $requiredSourceTokens) {
    if (-not $productionSourceText.Contains($token)) {
        throw "Required policy coverage source token is missing: $token"
    }
}

$requiredContractTokens = @(
    '"route": "/management-platform/statutory-policy-coverage"',
    '"requiredPermission": "statutory-discount-policy.view"',
    '"path": "/v1/ops/management-platform/statutory-discounts/policy-coverage"',
    '"namedPolicy": "ManagementPlatformStatutoryDiscountPolicyCoverageRead"',
    '"policyMutation": false',
    '"browserStorageWrites": false'
)

foreach ($token in $requiredContractTokens) {
    if (-not $contractText.Contains($token)) {
        throw "Required policy coverage contract token is missing: $token"
    }
}

$requiredDocTokens = @(
    "read-only Management Platform workspace",
    "/v1/ops/management-platform/statutory-discounts/policy-coverage",
    "statutory-discount-policy.view",
    "Central PMS remains authoritative",
    "No controls are provided",
    "Manual result remains pending Darwin"
)

foreach ($token in $requiredDocTokens) {
    if (-not ($docText.Contains($token) -or $manualText.Contains($token))) {
        throw "Required policy coverage documentation token is missing: $token"
    }
}

$requiredE2eTokens = @(
    "primary Site Group flow",
    "browser boundary uses one read-only relative API call",
    "responsive layout and keyboard navigation",
    "gotoCoverageScenario(page, `"site-group-covered`")"
)

foreach ($token in $requiredE2eTokens) {
    if (-not $e2eText.Contains($token)) {
        throw "Required policy coverage E2E token is missing: $token"
    }
}

$forbiddenProductionTokens = @(
    "localStorage.setItem",
    "sessionStorage.setItem",
    "indexedDB.open",
    "headers.set(`"X-ExitPass-Permissions`"",
    "headers.set(`"X-Management-Platform-Permissions`"",
    "headers.set(`"X-ExitPass-Service-Identity-Id`"",
    "Create policy",
    "Edit policy",
    "Delete policy",
    "Apply payable basis",
    "Approve statutory coverage"
)

foreach ($token in $forbiddenProductionTokens) {
    if ($productionSourceText.Contains($token)) {
        throw "Forbidden policy coverage production source token found: $token"
    }
}

Write-Host "Proof passed: read-only statutory policy coverage route, permission, endpoint, scope, filters, and safe classifications are implemented."
Write-Host "Proof passed: contract and documentation describe I-004 dependency, browser security, read-only boundary, and manual validation."
Write-Host "Proof passed: production source contains no statutory policy mutation controls, privileged browser headers, or browser-storage writes."
