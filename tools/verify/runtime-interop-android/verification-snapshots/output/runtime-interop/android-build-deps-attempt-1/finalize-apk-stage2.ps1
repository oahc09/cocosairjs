param([Parameter(Mandatory=$true)][string]$Attempt)
$ErrorActionPreference='Stop'
if($Attempt -notmatch '^android-build-attempt-[0-9]+$'){throw 'Pass an existing Android build attempt name'}
$taskDeps=$PSScriptRoot
$taskBase=Split-Path $taskDeps -Parent
$taskOps=Join-Path $taskBase $Attempt
$taskSource=Join-Path $taskBase 'mystral-source'
node (Join-Path $taskDeps 'fingerprint-android-source.cjs') (Join-Path $taskOps 'source-verified.json')
node (Join-Path $taskDeps 'fingerprint-assets.cjs') (Join-Path $taskBase 'android-assets-attempt-2') (Join-Path $taskOps 'assets-verified.json')
$taskSaved=Join-Path $taskOps 'app-debug.apk'
if(Test-Path -LiteralPath $taskSaved){throw 'Refusing to replace retained APK'}
Copy-Item -LiteralPath (Join-Path $taskSource 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $taskSaved
& 'D:/Android/Sdk/build-tools/36.0.0/aapt.exe' dump badging $taskSaved *> (Join-Path $taskOps 'aapt-badging.log')
if($LASTEXITCODE -ne 0){throw 'aapt failed'}
$taskBadging=Get-Content -LiteralPath (Join-Path $taskOps 'aapt-badging.log') -Raw
if($taskBadging -notmatch "package: name='com.mystral.engine.interop' versionCode='1' versionName='0.1.0'" -or $taskBadging -notmatch "native-code: 'x86_64'"){throw 'Unexpected APK identity/ABI'}
& 'D:/Android/Sdk/build-tools/36.0.0/apksigner.bat' verify --verbose $taskSaved *> (Join-Path $taskOps 'apksigner.log')
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
$taskExpected=Get-Content -LiteralPath (Join-Path $taskOps 'assets-before.json') -Raw|ConvertFrom-Json -AsHashtable
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[System.IO.Compression.ZipFile]::OpenRead($taskSaved)
$taskAssets=@{}
$taskNative=@()
function Read-TaskEntryHash($taskEntry){
 $taskAlgorithm=[Security.Cryptography.SHA256]::Create();$taskStream=$taskEntry.Open()
 try{([BitConverter]::ToString($taskAlgorithm.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}
 finally{$taskStream.Dispose();$taskAlgorithm.Dispose()}
}
try{
 foreach($taskName in $taskExpected.Keys){
  $taskEntry=$taskZip.GetEntry('assets/'+$taskName)
  if(-not $taskEntry){throw ('Missing asset '+$taskName)}
  $taskHash=Read-TaskEntryHash $taskEntry
  if($taskHash -ne $taskExpected[$taskName]){throw ('APK asset SHA mismatch '+$taskName)}
  $taskAssets[$taskName]=$taskHash
 }
 foreach($taskEntry in $taskZip.Entries|Where-Object{$_.FullName -match '^lib/'}){
  $taskNative+=@{file=$taskEntry.FullName;bytes=$taskEntry.Length;sha256=(Read-TaskEntryHash $taskEntry)}
 }
 foreach($taskPair in @(
  @{entry='lib/x86_64/libv8android.so';source=(Join-Path $taskDeps 'v8/x86_64/libv8android.so')},
  @{entry='lib/x86_64/libSDL3.so';source=(Join-Path $taskDeps 'sdl3/extracted/prefab/modules/SDL3-shared/libs/android.x86_64/libSDL3.so')},
  @{entry='assets/v8/x86_64/snapshot_blob.bin';source=(Join-Path $taskDeps 'v8/x86_64/snapshot_blob.bin')}
 )){
  $taskEntry=$taskZip.GetEntry($taskPair.entry)
  if(-not $taskEntry){throw ('Missing native payload '+$taskPair.entry)}
  if((Read-TaskEntryHash $taskEntry) -ne (Get-FileHash -LiteralPath $taskPair.source -Algorithm SHA256).Hash.ToLowerInvariant()){
   throw ('Native provider SHA mismatch '+$taskPair.entry)
  }
 }
 if($taskNative.Count -ne 4){throw 'Expected exactly four native shared libraries'}
 $taskPayload=@{pass=$true;assets=$taskAssets;assetCount=$taskAssets.Count;apkAssets=(@($taskZip.Entries|Where-Object{$_.FullName.StartsWith('assets/')})).Count;nativeLibraries=$taskNative;snapshotProviderMatches=$true;v8ProviderMatches=$true;sdlProviderMatches=$true}
 $taskPayload|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $taskOps 'payload-verification.json') -Encoding utf8
}finally{$taskZip.Dispose()}
$taskScript=@'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const p=path.resolve(process.argv[2]);
const read=n=>JSON.parse(fs.readFileSync(path.join(p,n),'utf8').replace(/^\uFEFF/,''));
const same=names=>names.every(name=>JSON.stringify(read(name))===JSON.stringify(read(names[0])));
const apk=fs.readFileSync(path.join(p,'app-debug.apk'));
const report={schema:'mystral-android-build-v1',compiled:true,runnable:false,deviceExecution:'NOT_RUN_BY_BUILD_OPERATION',sourceInputsUnchanged:same(['source-before.json','source-after.json','source-verified.json']),assetsInputsUnchanged:same(['assets-before.json','assets-after.json','assets-verified.json']),apk:{file:'app-debug.apk',bytes:apk.length,sha256:crypto.createHash('sha256').update(apk).digest('hex')},package:'com.mystral.engine.interop',abi:'x86_64',minSdk:26,targetSdk:34,versionCode:1,versionName:'0.1.0',signatureVerified:true,payload:read('payload-verification.json'),command:read('command.json'),createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(p,'build-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compiled:report.compiled,sourceStable:report.sourceInputsUnchanged,assetsStable:report.assetsInputsUnchanged,apk:report.apk,assets:report.payload.assetCount,native:report.payload.nativeLibraries.length}));
if(!report.sourceInputsUnchanged||!report.assetsInputsUnchanged)process.exitCode=1;
'@
$taskScript|Set-Content -LiteralPath (Join-Path $taskOps 'finalize-report.cjs') -Encoding utf8
node (Join-Path $taskOps 'finalize-report.cjs') $taskOps
if($LASTEXITCODE -ne 0){throw 'Candidate inputs drifted during or after build'}

