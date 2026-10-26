$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskBase=Split-Path $taskDeps -Parent
$taskOld=Join-Path $taskBase 'android-build-deps-attempt-1'
$taskSource=Join-Path $taskBase 'mystral-source'
$taskAndroid=Join-Path $taskSource 'android'
$taskAssets=Join-Path $taskBase 'android-assets-attempt-4'
$taskOps=Join-Path $taskBase 'android-16k-x64-build-attempt-1'
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop|Out-Null
$env:JAVA_HOME='D:/jdk-17'
$env:ANDROID_HOME='D:/Android/Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:GRADLE_USER_HOME=Join-Path $taskOld 'gradle-home'
$env:ANDROID_USER_HOME=Join-Path $taskOld 'android-home'
node (Join-Path $taskOld 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-before.json')
if($LASTEXITCODE -ne 0){throw 'Source fingerprint failed'}
node (Join-Path $taskOld 'fingerprint-assets.cjs') $taskAssets (Join-Path $taskOps 'assets-before.json')
if($LASTEXITCODE -ne 0){throw 'Asset fingerprint failed'}
$taskSources=Get-Content -LiteralPath (Join-Path $taskOps 'source-before.json') -Raw|ConvertFrom-Json -AsHashtable
$taskStage=Get-Content -LiteralPath (Join-Path $taskOps 'assets-before.json') -Raw|ConvertFrom-Json -AsHashtable
if($taskSources.Count -ne 115 -or $taskStage.Count -ne 29){throw 'Unexpected source/asset scope'}
$taskGenerated=[IO.Path]::GetFullPath((Join-Path $taskAndroid 'app/build/outputs/apk/debug/app-debug.apk'))
$taskResolved=(Resolve-Path -LiteralPath $taskGenerated).Path
if(-not [StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($taskResolved),$taskGenerated)){throw 'Unsafe generated APK target'}
$taskBackup=Join-Path $taskBase 'android-16k-arm64-build-attempt-1/app-debug.apk'
$taskExpected='a84ed29a1c5d433e48703647d7e63ce8d853cf836dadd5871b6cba335c984e7a'
if((Get-FileHash -LiteralPath $taskResolved -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpected -or (Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpected){throw 'Original byte-identical retained APK missing'}
@{operation='Remove-Item -LiteralPath (one generated APK file only)';target='<host-source>/android/app/build/outputs/apk/debug/app-debug.apk';sha256=$taskExpected;retainedBackup='../android-16k-arm64-build-attempt-1/app-debug.apk'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskOps 'repackage-input.json') -Encoding utf8
Remove-Item -LiteralPath $taskResolved -ErrorAction Stop
$taskArgs=@(':app:assembleDebug','--no-daemon','--stacktrace','--console=plain','--max-workers=8',
 '--gradle-user-home',$env:GRADLE_USER_HOME,'--project-cache-dir',(Join-Path $taskDeps 'project-cache'),
 '-PinteropAbis=x86_64','-PmystralJsEngine=v8','-PmystralGpuBackend=dawn','-PmystralAndroidStl=c++_static',
 '-PmystralV8LibraryKind=static','-PmystralV8StartupData=embedded','-PmystralSdlVersion=3.2.30',('-PinteropAssetsDir='+$taskAssets.Replace('\','/')),('-PmystralAndroidDeps='+$taskDeps.Replace('\','/')))
$taskCommand=[ordered]@{command='android/gradlew.bat';arguments=$taskArgs;startedAt=[DateTime]::UtcNow.ToString('o');sourceBaseCommit=(& git -C $taskSource rev-parse HEAD).Trim();pass=$false}
Push-Location $taskAndroid
try{& './gradlew.bat' @taskArgs *> (Join-Path $taskOps 'gradle.log');$taskCommand.exitCode=$LASTEXITCODE;$taskCommand.pass=$LASTEXITCODE -eq 0}
finally{Pop-Location;node (Join-Path $taskOld 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-after.json');node (Join-Path $taskOld 'fingerprint-assets.cjs') $taskAssets (Join-Path $taskOps 'assets-after.json');$taskCommand.finishedAt=[DateTime]::UtcNow.ToString('o');$taskCommand|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $taskOps 'command.json') -Encoding utf8}
Get-Content -LiteralPath (Join-Path $taskOps 'gradle.log') -Tail 70
if(-not $taskCommand.pass){exit 1}



