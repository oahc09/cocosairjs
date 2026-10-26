$ErrorActionPreference = 'Stop'
$taskName = 'SDL3-devel-3.2.30-android.zip'
$taskFile = Join-Path $PSScriptRoot $taskName
$taskReceipt = [ordered]@{
    url = 'https://github.com/libsdl-org/SDL/releases/download/release-3.2.30/SDL3-devel-3.2.30-android.zip'
    expectedSha256 = '0525e4bc9cc1370e6d664ec93c927846e311c19a819de05a232bca452b0e3a7a'
    expectedBytes = 15121629
    maximumCandidateBytes = 20 * 1024 * 1024
    startedAt = [DateTime]::UtcNow.ToString('o')
    pass = $false
}
if (Test-Path -LiteralPath $taskFile) { throw 'Refusing to replace candidate' }
try {
    Invoke-WebRequest -Uri $taskReceipt.url -OutFile $taskFile -TimeoutSec 180 -MaximumRetryCount 2 -RetryIntervalSec 2
    $taskReceipt.bytes = (Get-Item -LiteralPath $taskFile).Length
    $taskReceipt.sha256 = (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskReceipt.bytes -ne $taskReceipt.expectedBytes -or $taskReceipt.bytes -gt $taskReceipt.maximumCandidateBytes -or $taskReceipt.sha256 -ne $taskReceipt.expectedSha256) {
        throw 'Official candidate size or published checksum mismatch'
    }
    $taskReceipt.pass = $true
} catch {
    $taskReceipt.error = $_.Exception.Message
    throw
} finally {
    $taskReceipt.finishedAt = [DateTime]::UtcNow.ToString('o')
    $taskReceipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'download-receipt.json') -Encoding utf8
}
$taskReceipt | ConvertTo-Json -Depth 5
