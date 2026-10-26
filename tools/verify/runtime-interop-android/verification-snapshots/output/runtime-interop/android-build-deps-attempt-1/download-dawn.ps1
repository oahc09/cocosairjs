$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskAssets=@(
 @{name='dawn-android-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz';url='https://github.com/google/dawn/releases/download/v20260117.152313/dawn-android-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz';expected='a78795d58cee1757fbeea55c44c3c2f291f034277f5e78d70098eecc197c929d'},
 @{name='dawn-headers-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz';url='https://github.com/google/dawn/releases/download/v20260117.152313/dawn-headers-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz';expected='fa2bcd2031bedecb4a45a0bbdd24f03c12394574c4c1344d63775435166a48c3'}
)
$taskResults=$taskAssets|ForEach-Object -Parallel {
 $taskAsset=$_;$taskFile=Join-Path (Join-Path $using:taskDeps 'downloads') $taskAsset.name
 $taskResult=[ordered]@{name=$taskAsset.name;url=$taskAsset.url;expectedSha256=$taskAsset.expected;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false}
 try{if(Test-Path -LiteralPath $taskFile){throw 'Refusing to replace download'};Invoke-WebRequest -Uri $taskAsset.url -OutFile $taskFile -TimeoutSec 180 -MaximumRetryCount 2 -RetryIntervalSec 2;$taskResult.sha256=(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant();$taskResult.bytes=(Get-Item -LiteralPath $taskFile).Length;if($taskResult.sha256 -ne $taskAsset.expected){throw 'Published checksum mismatch'};$taskResult.pass=$true}catch{$taskResult.error=$_.Exception.Message}
 $taskResult.finishedAt=[DateTime]::UtcNow.ToString('o');$taskResult|ConvertTo-Json|Set-Content -LiteralPath ($taskFile+'.receipt.json') -Encoding utf8;[pscustomobject]$taskResult
} -ThrottleLimit 2
$taskResults|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskDeps 'dawn-downloads.json') -Encoding utf8
$taskResults|Select-Object name,pass,bytes,error|Format-Table -AutoSize
if($taskResults|Where-Object{-not $_.pass}){exit 1}
