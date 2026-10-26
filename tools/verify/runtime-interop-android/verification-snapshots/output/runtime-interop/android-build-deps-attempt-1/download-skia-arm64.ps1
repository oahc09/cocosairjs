$ErrorActionPreference = 'Stop'
$taskDeps = $PSScriptRoot
$taskName = 'Skia-m144-e2e6623374-4-android-Release-arm64.zip'
$taskFile = Join-Path $taskDeps ('downloads/' + $taskName)
$taskDestination = Join-Path $taskDeps 'skia/arm64-v8a'
$taskReceipt = [ordered]@{
    name = $taskName
    url = 'https://github.com/JetBrains/skia-pack/releases/download/m144-e2e6623374-4/Skia-m144-e2e6623374-4-android-Release-arm64.zip'
    publishedMetadata = 'https://api.github.com/repos/JetBrains/skia-pack/releases/assets/359265125'
    expectedSha256 = 'a34a870d783de80b113c3d7cdc2c03bf4b938c856f4d1e3e5e8eabb5d2b481d3'
    expectedBytes = 41241611
    startedAt = [DateTime]::UtcNow.ToString('o')
    pass = $false
}
if ((Test-Path -LiteralPath $taskFile) -or (Test-Path -LiteralPath $taskDestination)) {
    throw 'Refusing to replace an existing download or dependency directory'
}
try {
    Invoke-WebRequest -Uri $taskReceipt.url -OutFile $taskFile -TimeoutSec 180 -MaximumRetryCount 2 -RetryIntervalSec 2
    $taskReceipt.sha256 = (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskReceipt.bytes = (Get-Item -LiteralPath $taskFile).Length
    if ($taskReceipt.sha256 -ne $taskReceipt.expectedSha256 -or $taskReceipt.bytes -ne $taskReceipt.expectedBytes) {
        throw 'Published Skia ARM64 checksum or size mismatch'
    }
    Expand-Archive -LiteralPath $taskFile -DestinationPath $taskDestination -ErrorAction Stop
    if (-not (Test-Path -LiteralPath (Join-Path $taskDestination 'out/Release-android-arm64/libskia.a'))) {
        throw 'Skia ARM64 archive layout differs from the frozen CMake profile'
    }
    $taskReceipt.pass = $true
} catch {
    $taskReceipt.error = $_.Exception.Message
    throw
} finally {
    $taskReceipt.finishedAt = [DateTime]::UtcNow.ToString('o')
    $taskReceipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($taskFile + '.receipt.json') -Encoding utf8
}
$taskReceipt | ConvertTo-Json -Depth 6
