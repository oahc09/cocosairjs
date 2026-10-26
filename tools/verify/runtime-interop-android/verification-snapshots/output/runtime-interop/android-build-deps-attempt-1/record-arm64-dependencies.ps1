$ErrorActionPreference = 'Stop'
$taskDeps = $PSScriptRoot
$taskBase = Split-Path $taskDeps -Parent
$taskOps = Join-Path $taskBase 'android-arm64-build-attempt-1'
$taskRaw = Join-Path $taskOps 'dependency-raw'
New-Item -ItemType Directory -Path $taskRaw -ErrorAction Stop | Out-Null
$taskSources = @(
    'downloads/Skia-m144-e2e6623374-4-android-Release-arm64.zip.published.json',
    'downloads/Skia-m144-e2e6623374-4-android-Release-arm64.zip.receipt.json',
    'downloads/SDL3-devel-3.2.8-android.zip.receipt.json',
    'downloads/dawn-android-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz.receipt.json',
    'downloads/dawn-headers-d14ae3d97ad74100e9f382efef5e9c0872ddbeb2.tar.gz.receipt.json',
    'v8/receipt.json'
)
$taskReceipts = @()
foreach ($taskRelative in $taskSources) {
    $taskOriginal = Join-Path $taskDeps $taskRelative
    $taskName = if ($taskRelative -eq 'v8/receipt.json') { 'v8-receipt.json' } else { Split-Path $taskRelative -Leaf }
    $taskCopy = Join-Path $taskRaw $taskName
    Copy-Item -LiteralPath $taskOriginal -Destination $taskCopy -ErrorAction Stop
    $taskHash = (Get-FileHash -LiteralPath $taskOriginal -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskHash -ne (Get-FileHash -LiteralPath $taskCopy -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Receipt copy mismatch' }
    $taskReceipts += @{file=('dependency-raw/' + $taskName); sha256=$taskHash; original=('<android-deps>/' + $taskRelative)}
}
node (Join-Path $taskDeps 'fingerprint-assets.cjs') (Join-Path $taskDeps 'skia/arm64-v8a') (Join-Path $taskOps 'skia-arm64-files.json')
if ($LASTEXITCODE -ne 0) { throw 'Skia full materialization fingerprint failed' }
$taskSelected = @(
    'dawn/arm64-v8a/libwebgpu_dawn.a',
    'dawn/include/dawn/webgpu.h',
    'v8/arm64-v8a/libv8android.so',
    'v8/arm64-v8a/snapshot_blob.bin',
    'v8/include/v8.h',
    'sdl3/SDL3-3.2.8.aar',
    'sdl3/extracted/prefab/modules/SDL3-shared/libs/android.arm64-v8a/libSDL3.so'
)
$taskMaterialized = @()
foreach ($taskRelative in $taskSelected) {
    $taskFile = Join-Path $taskDeps $taskRelative
    $taskMaterialized += @{file=('<android-deps>/' + $taskRelative); bytes=(Get-Item -LiteralPath $taskFile).Length; sha256=(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskProfile = Join-Path $taskBase 'android-build-profile-attempt-1/build-profile.json'
$taskReport = [ordered]@{
    schema='mystral-android-arm64-dependencies-v1'
    createdAt=[DateTime]::UtcNow.ToString('o')
    profileSupplement=@{file='../android-build-profile-attempt-1/build-profile.json';sha256=(Get-FileHash -LiteralPath $taskProfile -Algorithm SHA256).Hash.ToLowerInvariant();changedProperties=@{'interopAbis'='arm64-v8a'};note='The historical profile arm64-not-fetched state is superseded only for this new ARM64 build; earlier receipts remain immutable.'}
    receipts=$taskReceipts
    selectedMaterializedInputs=$taskMaterialized
    skia=@{version='m144-e2e6623374-4';abi='arm64-v8a';fullFileInventory='skia-arm64-files.json';inventorySha256=(Get-FileHash -LiteralPath (Join-Path $taskOps 'skia-arm64-files.json') -Algorithm SHA256).Hash.ToLowerInvariant();staticLibraryCount=@(Get-ChildItem -LiteralPath (Join-Path $taskDeps 'skia/arm64-v8a/out/Release-android-arm64') -Filter '*.a' -File).Count}
    v8=@{provider='Third-party Kudo v8-android-jit';npmVersion='11.1000.4';engineVersion='10.0.139.9';compressPointers=$true;platform='Unchanged NewDefaultPlatform';snapshot='assets/v8/arm64-v8a/snapshot_blob.bin'}
    toolchain=@{ndk='29.0.14206865';androidPlatform=26;stl='c++_shared';gradle='8.11.1';agp='8.10.1';jdk='17+35-2724';cmake='3.22.1';compileSdk=36;buildTools='36.0.0';targetSdk=34}
    deviceExecution='NOT_RUN_BY_BUILD_OPERATION'
}
$taskReport | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskOps 'dependency-receipt.json') -Encoding utf8
@{receipts=$taskReceipts.Count;materialized=$taskMaterialized.Count;skiaStaticLibraries=$taskReport.skia.staticLibraryCount;inventory=(Get-Content -LiteralPath (Join-Path $taskOps 'skia-arm64-files.json') -Raw | ConvertFrom-Json -AsHashtable).Count} | ConvertTo-Json
