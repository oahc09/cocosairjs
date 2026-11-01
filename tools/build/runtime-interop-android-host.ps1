param(
    [ValidateSet('x86_64', 'arm64-v8a')][string]$Abi = 'x86_64',
    [Parameter(Mandatory = $true)][string]$Out,
    [string]$RuntimeBase
)

# Build the isolated Mystral host with the existing, fixed SDL/static dependencies.
# Writes the named new output directory and the host's ordinary Gradle build directories.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskBase = if ($RuntimeBase) { [IO.Path]::GetFullPath($RuntimeBase) } else {
    [IO.Path]::GetFullPath((Join-Path $taskRoot 'output/runtime-interop'))
}
$taskSource = Join-Path $taskBase 'mystral-source'
$taskAndroid = Join-Path $taskSource 'android'
$taskDeps = Join-Path $taskBase 'deps-16k-attempt-1'
$taskOld = Join-Path $taskBase 'android-build-deps-attempt-1'
$taskAssets = Join-Path $taskBase 'android-assets-attempt-4'
$taskOps = if ([IO.Path]::IsPathRooted($Out)) { [IO.Path]::GetFullPath($Out) } else {
    [IO.Path]::GetFullPath((Join-Path $taskRoot $Out))
}
if (-not $taskOps.StartsWith($taskBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output must be a new directory inside output/runtime-interop/'
}
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop | Out-Null
$env:JAVA_HOME = 'D:/jdk-17'
$env:ANDROID_HOME = 'D:/Android/Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $taskOld 'gradle-home'
$env:ANDROID_USER_HOME = Join-Path $taskOld 'android-home'

& node (Join-Path $taskOld 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-before.json')
if ($LASTEXITCODE -ne 0) { throw 'Source fingerprint failed' }
& node (Join-Path $taskOld 'fingerprint-assets.cjs') $taskAssets (Join-Path $taskOps 'assets-before.json')
if ($LASTEXITCODE -ne 0) { throw 'Asset fingerprint failed' }
$taskSources = Get-Content -LiteralPath (Join-Path $taskOps 'source-before.json') -Raw | ConvertFrom-Json -AsHashtable
$taskStage = Get-Content -LiteralPath (Join-Path $taskOps 'assets-before.json') -Raw | ConvertFrom-Json -AsHashtable
if ($taskSources.Count -lt 115 -or $taskStage.Count -ne 29) { throw 'Incomplete source/asset scope' }
$taskSourceNames = [string[]]@($taskSources.Keys)
[Array]::Sort($taskSourceNames, [StringComparer]::Ordinal)
[IO.File]::WriteAllText((Join-Path $taskOps 'expected-source-files.json'),
    (ConvertTo-Json -InputObject $taskSourceNames -Depth 3) + "`n", [Text.UTF8Encoding]::new($false))

# Zipflinger can retain unused space when replacing a large native entry in place.
# Preserve the one old generated APK before requesting a fresh archive; no recursive cleanup.
$taskGenerated = [IO.Path]::GetFullPath((Join-Path $taskAndroid 'app/build/outputs/apk/debug/app-debug.apk'))
if (Test-Path -LiteralPath $taskGenerated) {
    $taskResolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $taskGenerated).Path)
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals($taskGenerated, $taskResolved)) {
        throw 'Generated APK resolves outside its explicit target'
    }
    $taskPrevious = Join-Path $taskOps 'previous-generated.apk'
    $taskPreviousHash = (Get-FileHash -LiteralPath $taskResolved -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath $taskResolved -Destination $taskPrevious -ErrorAction Stop
    if ((Get-FileHash -LiteralPath $taskPrevious -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPreviousHash) {
        throw 'Generated APK backup differs'
    }
    [ordered]@{ target = $taskGenerated; backup = 'previous-generated.apk'; sha256 = $taskPreviousHash } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOps 'repackage-input.json') -Encoding utf8
    Remove-Item -LiteralPath $taskResolved -ErrorAction Stop
}

$taskArguments = @(':app:assembleDebug', '--no-daemon', '--stacktrace', '--console=plain', '--max-workers=8',
    '--gradle-user-home', $env:GRADLE_USER_HOME,
    '--project-cache-dir', (Join-Path $taskDeps 'project-cache'),
    ('-PinteropAbis=' + $Abi), '-PmystralJsEngine=v8', '-PmystralGpuBackend=dawn',
    '-PmystralAndroidStl=c++_static', '-PmystralV8LibraryKind=static',
    '-PmystralV8StartupData=embedded', '-PmystralSdlVersion=3.2.30',
    ('-PinteropAssetsDir=' + $taskAssets.Replace('\', '/')),
    ('-PmystralAndroidDeps=' + $taskDeps.Replace('\', '/')))
$taskCommand = [ordered]@{
    command = 'android/gradlew.bat'
    arguments = $taskArguments
    startedAt = [DateTime]::UtcNow.ToString('o')
    sourceBaseCommit = (& git -C $taskSource rev-parse HEAD).Trim()
    sourceCount = $taskSources.Count
    pass = $false
}
Push-Location $taskAndroid
try {
    & './gradlew.bat' @taskArguments *> (Join-Path $taskOps 'gradle.log')
    $taskCommand.exitCode = $LASTEXITCODE
    $taskCommand.pass = $LASTEXITCODE -eq 0
} finally {
    Pop-Location
    & node (Join-Path $taskOld 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-after.json')
    & node (Join-Path $taskOld 'fingerprint-assets.cjs') $taskAssets (Join-Path $taskOps 'assets-after.json')
    $taskCommand.finishedAt = [DateTime]::UtcNow.ToString('o')
    $taskCommand | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $taskOps 'command.json') -Encoding utf8
}
Get-Content -LiteralPath (Join-Path $taskOps 'gradle.log') -Tail 45
if (-not $taskCommand.pass) { exit 1 }

