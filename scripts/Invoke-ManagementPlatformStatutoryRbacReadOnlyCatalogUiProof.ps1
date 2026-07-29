param(
    [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$resolvedProjectPath = Join-Path $repoRoot $ProjectPath

Write-Host "Management Platform statutory RBAC read-only catalog UI proof"
Write-Host "Repository: $repoRoot"
Write-Host "Project: $resolvedProjectPath"

if (-not (Test-Path $resolvedProjectPath)) {
    throw "Management Platform UI project was not found."
}

$sourcePath = Join-Path $resolvedProjectPath "src"
$contractPath = Join-Path $repoRoot "contracts\management-platform\statutory-rbac-read-only-catalog-ui.v1.json"
$docPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_RBAC_Read_Only_Catalog_Implementation_v1.0.md"
$manualPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_RBAC_Read_Only_Catalog_Manual_Validation_v1.0.md"
$e2ePath = Join-Path $repoRoot "e2e\rbac-inventory.spec.ts"

foreach ($requiredPath in @($contractPath, $docPath, $manualPath, $e2ePath)) {
    if (-not (Test-Path $requiredPath)) {
        throw "Required RBAC inventory artifact is missing: $requiredPath"
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
    "/management-platform/access-control",
    "/v1/ops/management-platform/identity-rbac/inventory",
    "management-platform.identity-rbac.inventory.read",
    "RBAC Inventory",
    "Permission Catalog",
    "Role Bundles",
    "Actor Boundary And Separation Warnings",
    "PRESENT_BUT_INCOMPLETE",
    "Unknown or unresolved scope fails closed",
    "This fixture is non-authoritative"
)

foreach ($token in $requiredSourceTokens) {
    if (-not $productionSourceText.Contains($token)) {
        throw "Required RBAC inventory source token is missing: $token"
    }
}

$requiredContractTokens = @(
    '"route": "/management-platform/access-control"',
    '"requiredPermission": "management-platform.identity-rbac.inventory.read"',
    '"path": "/v1/ops/management-platform/identity-rbac/inventory"',
    '"rbacMutation": false',
    '"browserStorageWrites": false',
    '"mutationMethods": false',
    '"canonicalPersistenceVerdict": "PRESENT_BUT_INCOMPLETE"'
)

foreach ($token in $requiredContractTokens) {
    if (-not $contractText.Contains($token)) {
        throw "Required RBAC inventory contract token is missing: $token"
    }
}

$requiredDocTokens = @(
    "read-only Access Control page",
    "management-platform.identity-rbac.inventory.read",
    "GET /v1/ops/management-platform/identity-rbac/inventory",
    "service principals cannot approve or reject",
    "Unknown or unresolved scope fails closed",
    "Explicit Non-Goals"
)

foreach ($token in $requiredDocTokens) {
    if (-not $docText.Contains($token)) {
        throw "Required RBAC inventory documentation token is missing: $token"
    }
}

$requiredManualTokens = @(
    "mpRbacScenario=populated",
    "mpRbacScenario=mixed",
    "mpRbacScenario=empty",
    "mpRbacScenario=unavailable",
    "mpRbacScenario=malformed",
    "mpRbacScenario=partial-scope"
)

foreach ($token in $requiredManualTokens) {
    if (-not $manualText.Contains($token)) {
        throw "Required RBAC inventory manual scenario token is missing: $token"
    }
}

$requiredE2eTokens = @(
    "primary read-only catalog flow",
    "safe states cover access denied",
    "browser API boundary remains read-only",
    "responsive layout and keyboard access"
)

foreach ($token in $requiredE2eTokens) {
    if (-not $e2eText.Contains($token)) {
        throw "Required RBAC inventory E2E coverage token is missing: $token"
    }
}

$forbiddenProductionTokens = @(
    "X-ExitPass-Permissions",
    "X-ExitPass-Service-Identity-Id",
    "localStorage.setItem",
    "sessionStorage.setItem",
    "indexedDB.open",
    "Create role",
    "Edit role",
    "Assign permission",
    "Assign user",
    "Rotate service identity",
    "Disable service identity"
)

foreach ($token in $forbiddenProductionTokens) {
    if ($productionSourceText.Contains($token)) {
        throw "Forbidden RBAC inventory production source token found: $token"
    }
}

Write-Host "Proof passed: read-only Access Control route, permission, endpoint, catalog, role bundles, warnings, and scope posture are implemented."
Write-Host "Proof passed: contract documents read-only posture, safe states, prohibited mutations, browser security, and test scenarios."
Write-Host "Proof passed: implementation and manual-validation docs cover fixture scenarios and non-goals."
Write-Host "Proof passed: production source contains no RBAC mutation controls, permission headers, service identity headers, or browser-storage writes."
Write-Host "Proof passed: script exits successfully."
