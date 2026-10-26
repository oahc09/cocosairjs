$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskBase=Split-Path $taskDeps -Parent
$taskSource=Join-Path $taskBase 'mystral-source/android'
$taskOps=Join-Path $taskBase 'android-wrapper-attempt-1'
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop|Out-Null
$env:JAVA_HOME='D:/jdk-17'
$env:ANDROID_HOME='D:/Android/Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:GRADLE_USER_HOME=Join-Path $taskDeps 'gradle-home'
$env:ANDROID_USER_HOME=Join-Path $taskDeps 'android-home'
$taskWrapperCache=Join-Path $env:GRADLE_USER_HOME 'wrapper/dists/gradle-8.11.1-bin/bpt9gzteqjrbo1mjrsomdt32c'
New-Item -ItemType Directory -Path $taskWrapperCache -Force|Out-Null
$taskZip=Join-Path $taskDeps 'downloads/gradle-8.11.1-bin.zip'
if((Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6'){throw 'Gradle seed checksum mismatch'}
Copy-Item -LiteralPath $taskZip -Destination (Join-Path $taskWrapperCache 'gradle-8.11.1-bin.zip') -ErrorAction Stop
$taskArgs=@('--version','--no-daemon','--gradle-user-home',$env:GRADLE_USER_HOME)
$taskRecord=[ordered]@{command='android/gradlew.bat';arguments=$taskArgs;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false}
Push-Location $taskSource
try{ & './gradlew.bat' @taskArgs *> (Join-Path $taskOps 'wrapper.log');$taskRecord.exitCode=$LASTEXITCODE;$taskRecord.pass=$LASTEXITCODE -eq 0 }
finally{Pop-Location;$taskRecord.finishedAt=[DateTime]::UtcNow.ToString('o');$taskRecord|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $taskOps 'command.json') -Encoding utf8}
Get-Content -LiteralPath (Join-Path $taskOps 'wrapper.log') -Tail 30
if(-not $taskRecord.pass){exit 1}
