$ErrorActionPreference='Stop'
$taskBase=Split-Path $PSScriptRoot -Parent
$taskOps=Join-Path $taskBase 'android-static-build-attempt-1'
$taskAndroid=Join-Path $taskBase 'mystral-source/android'
$taskOld=Join-Path $taskBase 'android-build-deps-attempt-1'
$env:JAVA_HOME='D:/jdk-17'
$env:ANDROID_HOME='D:/Android/Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_USER_HOME=Join-Path $taskOld 'android-home'
$taskArgs=@('help','--no-daemon','--console=plain','--gradle-user-home',(Join-Path $taskOld 'gradle-home'),'--project-cache-dir',(Join-Path $PSScriptRoot 'negative-project-cache'),'-PmystralJsEngine=v8','-PmystralAndroidStl=c++_static','-PmystralV8LibraryKind=shared')
Push-Location $taskAndroid
try{& './gradlew.bat' @taskArgs *> (Join-Path $taskOps 'rejected-mixed-profile.log');$taskExit=$LASTEXITCODE}
finally{Pop-Location}
$taskLog=Get-Content -LiteralPath (Join-Path $taskOps 'rejected-mixed-profile.log') -Raw
$taskPass=$taskExit -ne 0 -and $taskLog.Contains('c++_static requires a matching static V8; the shared V8 depends on libc++_shared.so')
@{schema='android-static-profile-rejection-v1';pass=$taskPass;expectedFailure=$true;actualExitCode=$taskExit;command='android/gradlew.bat';arguments=$taskArgs;log='rejected-mixed-profile.log'}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $taskOps 'rejected-mixed-profile.json') -Encoding utf8
@{pass=$taskPass;actualExitCode=$taskExit}|ConvertTo-Json
if(-not $taskPass){exit 1}
