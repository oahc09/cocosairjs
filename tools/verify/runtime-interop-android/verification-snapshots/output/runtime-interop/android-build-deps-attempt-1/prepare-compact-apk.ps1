param([Parameter(Mandatory=$true)][string]$Ops)
$ErrorActionPreference='Stop'
$taskBase=Split-Path $PSScriptRoot -Parent
$taskExpected=[IO.Path]::GetFullPath((Join-Path $taskBase 'mystral-source/android/app/build/outputs/apk/debug/app-debug.apk'))
$taskResolved=(Resolve-Path -LiteralPath $taskExpected -ErrorAction Stop).Path
if(-not [StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($taskResolved),$taskExpected)){
 throw 'Unsafe APK deletion target'
}
$taskBackup=Join-Path $taskBase 'android-build-attempt-8/app-debug.apk'
$taskReport=Get-Content -LiteralPath (Join-Path $taskBase 'android-build-attempt-8/build-report.json') -Raw|ConvertFrom-Json
$taskOldHash=(Get-FileHash -LiteralPath $taskResolved -Algorithm SHA256).Hash.ToLowerInvariant()
if(-not (Test-Path -LiteralPath $taskBackup) -or $taskOldHash -ne $taskReport.apk.sha256 -or $taskOldHash -ne (Get-FileHash -LiteralPath $taskBackup -Algorithm SHA256).Hash.ToLowerInvariant()){
 throw 'Generated APK lacks the original byte-identical retained backup'
}
@{operation='Remove-Item -LiteralPath (one generated APK file only)';target='<host-source>/android/app/build/outputs/apk/debug/app-debug.apk';sha256=$taskOldHash;retainedBackup='android-build-attempt-8/app-debug.apk'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Ops 'repackage-input.json') -Encoding utf8
Remove-Item -LiteralPath $taskResolved -ErrorAction Stop
