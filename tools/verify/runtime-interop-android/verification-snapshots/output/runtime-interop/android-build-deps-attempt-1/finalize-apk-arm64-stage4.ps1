$ErrorActionPreference = 'Stop'
$taskDeps = $PSScriptRoot
$taskBase = Split-Path $taskDeps -Parent
$taskSource = Join-Path $taskBase 'mystral-source'
$taskOps = Join-Path $taskBase 'android-arm64-build-attempt-1'
$taskStage = Join-Path $taskBase 'android-assets-attempt-4'
$taskSaved = Join-Path $taskOps 'app-debug.apk'
$env:JAVA_HOME = 'D:/jdk-17'
node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-verified.json')
if ($LASTEXITCODE -ne 0) { throw 'Source verification failed' }
node (Join-Path $taskDeps 'fingerprint-assets.cjs') $taskStage (Join-Path $taskOps 'assets-verified.json')
if ($LASTEXITCODE -ne 0) { throw 'Asset verification failed' }
if (Test-Path -LiteralPath $taskSaved) { throw 'Refusing to replace retained APK' }
Copy-Item -LiteralPath (Join-Path $taskSource 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $taskSaved
& 'D:/Android/Sdk/build-tools/36.0.0/aapt.exe' dump badging $taskSaved *> (Join-Path $taskOps 'aapt-badging.log')
if ($LASTEXITCODE -ne 0) { throw 'aapt failed' }
$taskBadging = Get-Content -LiteralPath (Join-Path $taskOps 'aapt-badging.log') -Raw
if ($taskBadging -notmatch "package: name='com.mystral.engine.interop' versionCode='1' versionName='0.1.0'" -or
    (($taskBadging -split '\r?\n' | Where-Object { $_.StartsWith('native-code:') }) -join '') -ne "native-code: 'arm64-v8a'") {
    throw 'Unexpected APK identity or ABI'
}
& 'D:/Android/Sdk/build-tools/36.0.0/apksigner.bat' verify --verbose --print-certs $taskSaved *> (Join-Path $taskOps 'apksigner.log')
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
$taskExpected = Get-Content -LiteralPath (Join-Path $taskOps 'assets-before.json') -Raw | ConvertFrom-Json -AsHashtable
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($taskSaved)
$taskAssets = @{}
$taskNative = @()
function Read-TaskEntryHash($taskEntry) {
    $taskAlgorithm = [Security.Cryptography.SHA256]::Create()
    $taskStream = $taskEntry.Open()
    try { ([BitConverter]::ToString($taskAlgorithm.ComputeHash($taskStream))).Replace('-', '').ToLowerInvariant() }
    finally { $taskStream.Dispose(); $taskAlgorithm.Dispose() }
}
try {
    if (@($taskZip.Entries | Group-Object FullName | Where-Object Count -gt 1).Count -ne 0) { throw 'Duplicate ZIP entries' }
    foreach ($taskName in $taskExpected.Keys) {
        $taskEntry = $taskZip.GetEntry('assets/' + $taskName)
        if (-not $taskEntry) { throw ('Missing asset ' + $taskName) }
        $taskHash = Read-TaskEntryHash $taskEntry
        if ($taskHash -ne $taskExpected[$taskName]) { throw ('APK asset SHA mismatch ' + $taskName) }
        $taskAssets[$taskName] = $taskHash
    }
    $taskStripRoot = Join-Path $taskSource 'android/app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/arm64-v8a'
    $taskProviders = @{
        'libv8android.so' = Join-Path $taskDeps 'v8/arm64-v8a/libv8android.so'
        'libSDL3.so' = Join-Path $taskDeps 'sdl3/extracted/prefab/modules/SDL3-shared/libs/android.arm64-v8a/libSDL3.so'
        'libc++_shared.so' = Join-Path $taskStripRoot 'libc++_shared.so'
        'libmystral-runtime.so' = Join-Path $taskStripRoot 'libmystral-runtime.so'
    }
    foreach ($taskEntry in @($taskZip.Entries | Where-Object { $_.FullName.StartsWith('lib/') })) {
        $taskName = $taskEntry.FullName.Split('/')[-1]
        if ($taskEntry.FullName -ne ('lib/arm64-v8a/' + $taskName) -or -not $taskProviders.ContainsKey($taskName)) {
            throw ('Unexpected native library ' + $taskEntry.FullName)
        }
        $taskHash = Read-TaskEntryHash $taskEntry
        $taskProvider = $taskProviders[$taskName]
        $taskProviderHash = (Get-FileHash -LiteralPath $taskProvider -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($taskHash -ne $taskProviderHash) { throw ('Native provider SHA mismatch ' + $taskName) }
        $taskNative += @{file=$taskEntry.FullName; bytes=$taskEntry.Length; sha256=$taskHash; packagingSourceSha256=$taskProviderHash; providerMatches=$true}
    }
    if ($taskNative.Count -ne 4) { throw 'Expected exactly four ARM64 native shared libraries' }
    $taskSnapshot = $taskZip.GetEntry('assets/v8/arm64-v8a/snapshot_blob.bin')
    if (-not $taskSnapshot) { throw 'Missing ARM64 V8 snapshot' }
    $taskSnapshotHash = Read-TaskEntryHash $taskSnapshot
    if ($taskSnapshotHash -ne (Get-FileHash -LiteralPath (Join-Path $taskDeps 'v8/arm64-v8a/snapshot_blob.bin') -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'ARM64 snapshot provider mismatch'
    }
    $taskApkAssets = @($taskZip.Entries | Where-Object { $_.FullName.StartsWith('assets/') })
    if ($taskAssets.Count -ne 29 -or $taskApkAssets.Count -ne 30) { throw 'Unexpected APK asset count' }
    @{pass=$true; assets=$taskAssets; assetCount=$taskAssets.Count; apkAssets=$taskApkAssets.Count; nativeLibraries=$taskNative;
      snapshot=@{file=$taskSnapshot.FullName;bytes=$taskSnapshot.Length;sha256=$taskSnapshotHash;providerMatches=$true};
      snapshotProviderMatches=$true;v8ProviderMatches=$true;sdlProviderMatches=$true;allFourNativeLibrariesByteMatched=$true} |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskOps 'payload-verification.json') -Encoding utf8
} finally { $taskZip.Dispose() }
$taskReportScript = @'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const p=path.resolve(process.argv[2]),host=path.resolve(process.argv[3]);
const read=n=>JSON.parse(fs.readFileSync(path.join(p,n),'utf8').replace(/^\uFEFF/,''));
const same=names=>names.every(name=>JSON.stringify(read(name))===JSON.stringify(read(names[0])));
const apk=fs.readFileSync(path.join(p,'app-debug.apk'));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:host,encoding:'utf8'}).trim();
const clean=execFileSync('git',['status','--porcelain'],{cwd:host,encoding:'utf8'}).trim()==='';
const command=read('command.json');
const report={schema:'mystral-android-build-v1',compiled:command.pass===true&&command.exitCode===0,runnable:false,deviceExecution:'NOT_RUN_BY_BUILD_OPERATION',sourceCommit:commit,sourceClean:clean,sourceCount:Object.keys(read('source-before.json')).length,sourceInputsUnchanged:same(['source-before.json','source-after.json','source-verified.json']),assetsInputsUnchanged:same(['assets-before.json','assets-after.json','assets-verified.json']),apk:{file:'app-debug.apk',bytes:apk.length,sha256:crypto.createHash('sha256').update(apk).digest('hex')},package:'com.mystral.engine.interop',abi:'arm64-v8a',minSdk:26,targetSdk:34,versionCode:1,versionName:'0.1.0',signatureVerified:true,payload:read('payload-verification.json'),command,createdAt:new Date().toISOString()};
report.pass=report.compiled&&report.sourceInputsUnchanged&&report.assetsInputsUnchanged&&clean&&commit===command.sourceCommit&&report.sourceCount===115;
fs.writeFileSync(path.join(p,'build-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,sourceCount:report.sourceCount,sourceCommit:commit,apk:report.apk,assets:report.payload.assetCount,native:report.payload.nativeLibraries.length}));
if(!report.pass)process.exitCode=1;
'@
$taskReportScript | Set-Content -LiteralPath (Join-Path $taskOps 'finalize-report.cjs') -Encoding utf8
node (Join-Path $taskOps 'finalize-report.cjs') $taskOps $taskSource
if ($LASTEXITCODE -ne 0) { throw 'Candidate build failed or inputs drifted' }
