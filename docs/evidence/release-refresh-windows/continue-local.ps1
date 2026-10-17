$ErrorActionPreference = 'Stop'
$env:NODE_PATH = 'C:/Users/caosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:AIR_CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$runDirectory = 'output/playwright/release-refresh-windows'
$receipts = @(Get-Content (Join-Path $runDirectory 'receipts.json') -Raw | ConvertFrom-Json)
$checks = @(
    @{ name = 'gallery'; attempt = 2; commandArgs = @('output/playwright/release-refresh-windows/gallery-full.cjs') },
    @{ name = 'browser-matrix'; attempt = 1; commandArgs = @('tools/verify/browser-matrix.cjs') }
)
foreach ($check in $checks) {
    $startedAt = [DateTime]::UtcNow.ToString('o')
    $commandArgs = $check.commandArgs
    & node @commandArgs > (Join-Path $runDirectory ($check.name + '-attempt-' + $check.attempt + '.log')) 2>&1
    $collectorExit = $LASTEXITCODE
    & node (Join-Path $runDirectory 'local-inputs.cjs') > (Join-Path $runDirectory ($check.name + '-attempt-' + $check.attempt + '-input-check.log')) 2>&1
    $guardExit = $LASTEXITCODE
    $receipts += @{ name = $check.name; attempt = $check.attempt; commandArgs = $commandArgs; startedAt = $startedAt; endedAt = [DateTime]::UtcNow.ToString('o'); exitCode = $collectorExit; inputGuardExitCode = $guardExit }
    $receipts | ConvertTo-Json -Depth 5 -AsArray | Set-Content -LiteralPath (Join-Path $runDirectory 'receipts.json') -Encoding utf8NoBOM
    Write-Output ($check.name + ' attempt=' + $check.attempt + ' exit=' + $collectorExit + ' inputGuard=' + $guardExit)
    if ($collectorExit -ne 0 -or $guardExit -ne 0) { exit 1 }
}
