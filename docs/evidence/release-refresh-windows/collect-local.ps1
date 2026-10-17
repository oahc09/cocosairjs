$ErrorActionPreference = 'Stop'
$env:NODE_PATH = 'C:/Users/caosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$env:AIR_CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
[Environment]::SetEnvironmentVariable('COCOSAIR_GALLERY_EXAMPLES', $null, 'Process')
[Environment]::SetEnvironmentVariable('COCOSAIR_GALLERY_ARTIFACT', $null, 'Process')
$runDirectory = 'output/playwright/release-refresh-windows'
$checks = @(
    @{ name = 'devtools'; commandArgs = @('tools/verify/devtools-examples.cjs', '--preserve-metadata') },
    @{ name = 'gallery'; commandArgs = @('tools/verify/gallery-artifact.cjs', 'all') },
    @{ name = 'browser-matrix'; commandArgs = @('tools/verify/browser-matrix.cjs') }
)
$receipts = @()
foreach ($check in $checks) {
    $startedAt = [DateTime]::UtcNow.ToString('o')
    $commandArgs = $check.commandArgs
    & node @commandArgs > (Join-Path $runDirectory ($check.name + '.log')) 2>&1
    $collectorExit = $LASTEXITCODE
    & node (Join-Path $runDirectory 'local-inputs.cjs') > (Join-Path $runDirectory ($check.name + '-input-check.log')) 2>&1
    $guardExit = $LASTEXITCODE
    $receipts += @{ name = $check.name; commandArgs = $commandArgs; startedAt = $startedAt; endedAt = [DateTime]::UtcNow.ToString('o'); exitCode = $collectorExit; inputGuardExitCode = $guardExit }
    $receipts | ConvertTo-Json -Depth 5 -AsArray | Set-Content -LiteralPath (Join-Path $runDirectory 'receipts.json') -Encoding utf8NoBOM
    Write-Output ($check.name + ' exit=' + $collectorExit + ' inputGuard=' + $guardExit)
    if ($collectorExit -ne 0 -or $guardExit -ne 0) { exit 1 }
}
