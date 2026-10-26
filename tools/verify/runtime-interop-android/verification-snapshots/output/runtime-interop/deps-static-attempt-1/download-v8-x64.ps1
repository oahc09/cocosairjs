$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'download-manifest-x64.json') -Raw | ConvertFrom-Json
$taskRows = $taskManifest.files | ForEach-Object -Parallel {
    $taskRow = $_
    $taskFile = Join-Path $using:taskRoot $taskRow.destination
    $taskReceipt = [ordered]@{source=$taskRow.path;url=$taskRow.url;expectedBytes=$taskRow.size;expectedGitBlobSha1=$taskRow.sha;destination=$taskRow.destination;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false}
    try {
        if(Test-Path -LiteralPath $taskFile){throw 'Refusing to replace existing fixed input'}
        [IO.Directory]::CreateDirectory((Split-Path $taskFile -Parent)) | Out-Null
        Invoke-WebRequest -Uri $taskRow.url -OutFile $taskFile -TimeoutSec 180 -MaximumRetryCount 2 -RetryIntervalSec 2
        $taskReceipt.bytes = (Get-Item -LiteralPath $taskFile).Length
        $taskReceipt.sha256 = (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
        $taskReceipt.gitBlobSha1 = (& git hash-object --no-filters -- $taskFile).Trim()
        if($LASTEXITCODE -ne 0 -or $taskReceipt.bytes -ne $taskRow.size -or $taskReceipt.gitBlobSha1 -ne $taskRow.sha){throw 'Fixed Git blob content mismatch (including unexpected LFS pointer)'}
        $taskReceipt.gitLfsPointer = $false
        $taskReceipt.pass = $true
    } catch { $taskReceipt.error=$_.Exception.Message }
    $taskReceipt.finishedAt=[DateTime]::UtcNow.ToString('o')
    [pscustomobject]$taskReceipt
} -ThrottleLimit 8
$taskResult=[ordered]@{schema='fixed-cocos-v8-materialization-v1';repository=$taskManifest.repository;ref=$taskManifest.ref;v8Version=$taskManifest.v8Version;startup='embedded';pass=@($taskRows|Where-Object{-not $_.pass}).Count -eq 0;files=$taskRows}
$taskResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskRoot 'v8-download-receipt-x64.json') -Encoding utf8
$taskRows | Where-Object { -not $_.pass -or $_.destination.EndsWith('.a') } | Select-Object destination,bytes,sha256,pass,error | Format-Table -AutoSize
if(-not $taskResult.pass){exit 1}

