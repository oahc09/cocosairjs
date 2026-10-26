$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskAssets=@(
 @{name='SDL3-devel-3.2.8-android.zip';url='https://github.com/libsdl-org/SDL/releases/download/release-3.2.8/SDL3-devel-3.2.8-android.zip';expected=$null},
 @{name='Skia-m144-e2e6623374-4-android-Release-x64.zip';url='https://github.com/JetBrains/skia-pack/releases/download/m144-e2e6623374-4/Skia-m144-e2e6623374-4-android-Release-x64.zip';expected='391263f0e864fef5ba4463bccb2fb280e3a73b9f2d913dc93e88deea45dcc353'},
 @{name='gradlew.bat';url='https://raw.githubusercontent.com/gradle/gradle/v8.11.1/gradlew.bat';expected=$null},
 @{name='gradle-wrapper.jar';url='https://raw.githubusercontent.com/gradle/gradle/v8.11.1/gradle/wrapper/gradle-wrapper.jar';expected=$null},
 @{name='gradle-8.11.1-bin.zip.sha256';url='https://services.gradle.org/distributions/gradle-8.11.1-bin.zip.sha256';expected=$null}
)
$taskResults=$taskAssets|ForEach-Object -Parallel {
 $taskAsset=$_
 $taskFile=Join-Path (Join-Path $using:taskDeps 'downloads') $taskAsset.name
 $taskResult=[ordered]@{name=$taskAsset.name;url=$taskAsset.url;expectedSha256=$taskAsset.expected;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false}
 try {
  if(Test-Path -LiteralPath $taskFile){throw 'Refusing to replace download'}
  Invoke-WebRequest -Uri $taskAsset.url -OutFile $taskFile -TimeoutSec 180 -MaximumRetryCount 2 -RetryIntervalSec 2
  $taskResult.sha256=(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $taskResult.bytes=(Get-Item -LiteralPath $taskFile).Length
  if($taskAsset.expected -and $taskResult.sha256 -ne $taskAsset.expected){throw 'Published checksum mismatch'}
  $taskResult.pass=$true
 }catch{$taskResult.error=$_.Exception.Message}
 $taskResult.finishedAt=[DateTime]::UtcNow.ToString('o')
 $taskResult|ConvertTo-Json|Set-Content -LiteralPath ($taskFile+'.receipt.json') -Encoding utf8
 [pscustomobject]$taskResult
} -ThrottleLimit 4
$taskResults|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskDeps 'downloads.json') -Encoding utf8
$taskResults|Select-Object name,pass,bytes,error|Format-Table -AutoSize
if($taskResults|Where-Object{-not $_.pass}){exit 1}
