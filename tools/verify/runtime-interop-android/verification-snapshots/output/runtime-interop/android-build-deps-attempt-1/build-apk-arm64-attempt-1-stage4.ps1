$ErrorActionPreference = 'Stop'
$taskDeps = $PSScriptRoot
$taskBase = Split-Path $taskDeps -Parent
$taskSource = Join-Path $taskBase 'mystral-source'
$taskAndroid = Join-Path $taskSource 'android'
$taskStage = Join-Path $taskBase 'android-assets-attempt-4'
$taskOps = Join-Path $taskBase 'android-arm64-build-attempt-1'
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop | Out-Null
$taskHead = (& git -C $taskSource rev-parse HEAD).Trim()
$taskStatus = @(& git -C $taskSource status --porcelain)
if ($taskHead -ne '3cea6b450b71661e114a04b8bde777ff6d29f67f' -or $taskStatus.Count -ne 0) {
    throw 'The requested host commit must be clean before building'
}
$env:JAVA_HOME = 'D:/jdk-17'
$env:ANDROID_HOME = 'D:/Android/Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $taskDeps 'gradle-home'
$env:ANDROID_USER_HOME = Join-Path $taskDeps 'android-home'
node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-before.json')
if ($LASTEXITCODE -ne 0) { throw 'Source fingerprint failed' }
node (Join-Path $taskDeps 'fingerprint-assets.cjs') $taskStage (Join-Path $taskOps 'assets-before.json')
if ($LASTEXITCODE -ne 0) { throw 'Asset fingerprint failed' }
$taskInputs = Get-Content -LiteralPath (Join-Path $taskOps 'source-before.json') -Raw | ConvertFrom-Json -AsHashtable
$taskAssets = Get-Content -LiteralPath (Join-Path $taskOps 'assets-before.json') -Raw | ConvertFrom-Json -AsHashtable
if ($taskInputs.Count -ne 115 -or $taskAssets.Count -ne 29) { throw 'Unexpected frozen source or asset count' }
$taskGenerated = [IO.Path]::GetFullPath((Join-Path $taskAndroid 'app/build/outputs/apk/debug/app-debug.apk'))
$taskResolved = (Resolve-Path -LiteralPath $taskGenerated -ErrorAction Stop).Path
if (-not [StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($taskResolved), $taskGenerated)) {
    throw 'Unsafe generated APK target'
}
$taskBackup = Join-Path $taskBase 'android-build-attempt-10/app-debug.apk'
$taskOldReport = Get-Content -LiteralPath (Join-Path $taskBase 'android-build-attempt-10/build-report.json') -Raw | ConvertFrom-Json
$taskHash = (Get-FileHash -LiteralPath $taskResolved -Algorithm SHA256).Hash.ToLowerInvariant()
if ($taskHash -ne $taskOldReport.apk.sha256 -or $taskHash -ne (Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash.ToLowerInvariant()) {
    throw 'Generated APK lacks its retained byte-identical APK10 backup'
}
@{operation='Remove-Item -LiteralPath (one generated APK file only)'; target='<host-source>/android/app/build/outputs/apk/debug/app-debug.apk'; sha256=$taskHash; retainedBackup='android-build-attempt-10/app-debug.apk'} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOps 'repackage-input.json') -Encoding utf8
Remove-Item -LiteralPath $taskResolved -ErrorAction Stop
$taskArgs = @(':app:assembleDebug', '--no-daemon', '--stacktrace', '--console=plain', '--max-workers=8',
    '--gradle-user-home', $env:GRADLE_USER_HOME, '--project-cache-dir', (Join-Path $taskDeps 'project-cache'),
    '-PinteropAbis=arm64-v8a', '-PmystralJsEngine=v8', '-PmystralGpuBackend=dawn',
    ('-PinteropAssetsDir=' + $taskStage.Replace('\','/')), ('-PmystralAndroidDeps=' + $taskDeps.Replace('\','/')))
$taskRecord = [ordered]@{command='android/gradlew.bat'; arguments=$taskArgs; sourceCommit=$taskHead; sourceCleanBefore=$true;
    startedAt=[DateTime]::UtcNow.ToString('o'); pass=$false; scope='Native ARM64 APK build; device execution belongs to the parent collector'}
Push-Location $taskAndroid
try {
    & './gradlew.bat' @taskArgs *> (Join-Path $taskOps 'gradle.log')
    $taskRecord.exitCode = $LASTEXITCODE
    $taskRecord.pass = $LASTEXITCODE -eq 0
} finally {
    Pop-Location
    node (Join-Path $taskDeps 'fingerprint-assets.cjs') $taskStage (Join-Path $taskOps 'assets-after.json')
    node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-after.json')
    $taskRecord.finishedAt = [DateTime]::UtcNow.ToString('o')
    $taskRecord | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskOps 'command.json') -Encoding utf8
}
Get-Content -LiteralPath (Join-Path $taskOps 'gradle.log') -Tail 70
if (-not $taskRecord.pass) { exit 1 }
