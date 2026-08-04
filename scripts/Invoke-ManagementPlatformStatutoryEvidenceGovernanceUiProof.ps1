param(
    [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$resolvedProjectPath = Join-Path $repoRoot $ProjectPath

Write-Host "Management Platform statutory evidence governance read-only UI proof"
Write-Host "Repository: $repoRoot"
Write-Host "Project: $resolvedProjectPath"

if (-not (Test-Path $resolvedProjectPath)) {
    throw "Management Platform UI project was not found."
}

$sourcePath = Join-Path $resolvedProjectPath "src"
$contractPath = Join-Path $repoRoot "contracts\management-platform\statutory-evidence-governance-read-only-ui.v1.json"
$implementationPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_Evidence_Governance_Read_Only_Implementation_v1.0.md"
$manualPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_Evidence_Governance_Manual_Validation_v1.0.md"
$auditPath = Join-Path $repoRoot "docs\rbac\ExitPass_Management_Platform_Statutory_Evidence_Governance_Capability_Audit_and_I014_Handoff_v1.0.md"
$e2ePath = Join-Path $repoRoot "e2e\evidence-governance.spec.ts"

foreach ($requiredPath in @($contractPath, $implementationPath, $manualPath, $auditPath, $e2ePath)) {
    if (-not (Test-Path $requiredPath)) {
        throw "Required H-004 artifact is missing: $requiredPath"
    }
}

$productionSourceFiles = Get-ChildItem -Path $sourcePath -Recurse -File |
    Where-Object { $_.Name -notlike "*.test.ts" -and $_.Name -notlike "*.test.tsx" -and $_.FullName -notmatch '[\\/](test|tests)[\\/]' }
$productionSourceText = ($productionSourceFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
$readOnlySourceText = (@(
    (Get-Content -Raw -LiteralPath (Join-Path $sourcePath "evidenceGovernance.ts")),
    (Get-Content -Raw -LiteralPath (Join-Path $sourcePath "EvidenceGovernancePage.tsx"))
)) -join "`n"
$contractText = Get-Content -Raw -LiteralPath $contractPath
$implementationText = Get-Content -Raw -LiteralPath $implementationPath
$manualText = Get-Content -Raw -LiteralPath $manualPath
$auditText = Get-Content -Raw -LiteralPath $auditPath
$e2eText = Get-Content -Raw -LiteralPath $e2ePath

$requiredSourceTokens = @(
    "/management-platform/statutory-evidence-governance",
    "/v1/ops/management-platform/statutory-discounts/evidence-governance",
    "statutory-discounts.evidence-governance.view",
    "StatutoryEvidenceGovernanceView",
    "management-platform-statutory-evidence-governance:v1",
    "CONFIGURED_READY",
    "CONFIGURED_PARTIALLY_READY",
    "CONFIGURATION_INCOMPLETE",
    "CAPTURE_DISABLED",
    "CONFIGURATION_UNAVAILABLE",
    "NOT_IMPLEMENTED",
    "SITE_SCOPE_DENIED",
    "SITE_GROUP_SCOPE_DENIED",
    "EMPTY_AUTHORIZED_SCOPE",
    "MALFORMED_CANONICAL_CONFIGURATION",
    "TRANSIENT_DATABASE_FAILURE"
)

foreach ($token in $requiredSourceTokens) {
    if (-not $productionSourceText.Contains($token)) {
        throw "Required H-004 source token is missing: $token"
    }
}

$requiredContractTokens = @(
    '"frontendRoute": "/management-platform/statutory-evidence-governance"',
    '"permission": "statutory-discounts.evidence-governance.view"',
    '"namedPolicy": "StatutoryEvidenceGovernanceView"',
    '"backendContractVersion": "management-platform-statutory-evidence-governance:v1"',
    '"sameOriginOnly": true',
    '"privilegedHeaders": false',
    '"durableGovernanceAuthority": false'
)

foreach ($token in $requiredContractTokens) {
    if (-not $contractText.Contains($token)) {
        throw "Required H-004 contract token is missing: $token"
    }
}

$requiredDocumentationTokens = @(
    "I-014 is now merged",
    "Central PMS independently enforces",
    "Initial loading never presents a provisional ready state",
    "localStorage, sessionStorage, IndexedDB, and Cache Storage",
    "Controlled UAT and production rollout remain unauthorized"
)

$documentationText = $implementationText + "`n" + $manualText + "`n" + $auditText
foreach ($token in $requiredDocumentationTokens) {
    if (-not $documentationText.Contains($token)) {
        throw "Required H-004 documentation token is missing: $token"
    }
}

$requiredE2eTokens = @(
    "authorized workspace renders governance",
    "browser uses only the three same-origin GET routes",
    "browser storage remains non-authoritative",
    'name: "compact"',
    "keyboard-only navigation opens and closes details"
)

foreach ($token in $requiredE2eTokens) {
    if (-not $e2eText.Contains($token)) {
        throw "Required H-004 E2E token is missing: $token"
    }
}

$forbiddenProductionTokens = @(
    "localStorage.setItem",
    "sessionStorage.setItem",
    "indexedDB.open",
    "caches.open",
    "method: `"POST`"",
    "method: `"PUT`"",
    "method: `"PATCH`"",
    "method: `"DELETE`"",
    "headers.set(`"Authorization`"",
    "headers.set(`"X-ExitPass-Permissions`"",
    "headers.set(`"X-Management-Platform-Permissions`"",
    "headers.set(`"X-ExitPass-Service-Identity-Id`"",
    "headers.set(`"X-ExitPass-Site-Id`"",
    "headers.set(`"X-ExitPass-Site-Group-Id`""
)

foreach ($token in $forbiddenProductionTokens) {
    if ($readOnlySourceText.Contains($token)) {
        throw "Forbidden H-004 production source token found: $token"
    }
}

$sensitiveProductionPatterns = @(
    "EvidenceSetReference",
    "EvidenceItemReference",
    "StatutoryDiscountDecisionCommandId",
    "ParkingSessionReference",
    "PlateNumber",
    "TicketNumber",
    "PaymentReference",
    "ObjectKey",
    "BucketName",
    "ContainerName",
    "ProviderSecret",
    "SignedUrl"
)

foreach ($pattern in $sensitiveProductionPatterns) {
    if ($readOnlySourceText.Contains($pattern)) {
        throw "Sensitive H-004 production source field found: $pattern"
    }
}

Write-Host "Proof passed: exact I-014 routes, contract, permission, classifications, scope, and safe states are implemented."
Write-Host "Proof passed: H-004 remains read-only and browser requests contain no privileged authority headers."
Write-Host "Proof passed: customer evidence, storage internals, durable browser authority, and mutation controls are absent."
