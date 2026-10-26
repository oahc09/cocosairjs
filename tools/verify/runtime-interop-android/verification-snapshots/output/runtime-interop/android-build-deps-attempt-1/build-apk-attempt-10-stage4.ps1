$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskBase=Split-Path $taskDeps -Parent
$taskSource=Join-Path $taskBase 'mystral-source/android'
$taskOps=Join-Path $taskBase 'android-build-attempt-10'
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop|Out-Null
$env:JAVA_HOME='D:/jdk-17'
$env:ANDROID_HOME='D:/Android/Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:GRADLE_USER_HOME=Join-Path $taskDeps 'gradle-home'
$env:ANDROID_USER_HOME=Join-Path $taskDeps 'android-home'
node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-before.json')
node (Join-Path $taskDeps 'fingerprint-assets.cjs') (Join-Path $taskBase 'android-assets-attempt-4') (Join-Path $taskOps 'assets-before.json')
& (Join-Path $taskDeps 'prepare-compact-apk10.ps1') -Ops $taskOps
$taskArgs=@(':app:assembleDebug','--no-daemon','--stacktrace','--console=plain','--max-workers=8','--gradle-user-home',$env:GRADLE_USER_HOME,'--project-cache-dir',(Join-Path $taskDeps 'project-cache'),'-PinteropAbis=x86_64','-PmystralJsEngine=v8','-PmystralGpuBackend=dawn',('-PinteropAssetsDir='+((Join-Path $taskBase 'android-assets-attempt-4').Replace('\','/'))),('-PmystralAndroidDeps='+$taskDeps.Replace('\','/')))
$taskRecord=[ordered]@{command='android/gradlew.bat';arguments=$taskArgs;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false;scope='Initial real native APK build; device execution not run by this build operation'}
Push-Location $taskSource
try{ & './gradlew.bat' @taskArgs *> (Join-Path $taskOps 'gradle.log');$taskRecord.exitCode=$LASTEXITCODE;$taskRecord.pass=$LASTEXITCODE -eq 0 }
finally{Pop-Location;node (Join-Path $taskDeps 'fingerprint-assets.cjs') (Join-Path $taskBase 'android-assets-attempt-4') (Join-Path $taskOps 'assets-after.json');node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-after.json');$taskRecord.finishedAt=[DateTime]::UtcNow.ToString('o');$taskRecord|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskOps 'command.json') -Encoding utf8}
Get-Content -LiteralPath (Join-Path $taskOps 'gradle.log') -Tail 70
if(-not $taskRecord.pass){exit 1}










