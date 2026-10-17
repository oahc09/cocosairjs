$ErrorActionPreference = 'Stop'
$webgpuDirectory = 'docs/evidence/webgpu-completion/static'
if (Test-Path -LiteralPath $webgpuDirectory) { throw 'Static record directory already exists' }
New-Item -ItemType Directory -Path $webgpuDirectory | Out-Null
$webgpuSourceBefore = (& node -e "console.log(require('./tools/verify/webgpu-candidate.cjs').sourceFingerprint(process.cwd()))").Trim()
$webgpuReceipts = @()
function Invoke-WebGpuCheck([string]$webgpuName, [string[]]$webgpuArguments) {
    $webgpuStart = [DateTime]::UtcNow.ToString('o')
    $webgpuLog = Join-Path $webgpuDirectory ($webgpuName + '.log')
    & node @webgpuArguments *> $webgpuLog
    $webgpuExitCode = $LASTEXITCODE
    $script:webgpuReceipts += [ordered]@{ name=$webgpuName; command=@('node')+$webgpuArguments; startedAt=$webgpuStart; finishedAt=[DateTime]::UtcNow.ToString('o'); exitCode=$webgpuExitCode; log=($webgpuName+'.log') }
}
Invoke-WebGpuCheck 'typecheck' @('node_modules/typescript/bin/tsc','--noEmit')
Invoke-WebGpuCheck 'startup-gltf' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/webgpu-admission.test.ts','test/smoke/startup-admission.test.ts','test/smoke/port-gap-bootstrap-config.test.ts','test/smoke/smoke-07-gltf.test.ts','test/smoke/smoke-11-gltf-geometry.test.ts')
Invoke-WebGpuCheck 'd10' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/smoke-30-v12-regression.test.ts','--testNamePattern','D10')
Invoke-WebGpuCheck 'file-map' @('tools/verify/verify-file-map.cjs')
Invoke-WebGpuCheck 'wasm-boundary' @('tools/verify/verify-wasm-backends.cjs')
Invoke-WebGpuCheck 'web-only' @('tools/verify/verify-web-only.cjs')
Invoke-WebGpuCheck 'custom-exports' @('tools/verify/verify-custom-exports.cjs','--json')
Invoke-WebGpuCheck 'licenses' @('tools/verify/verify-licenses.cjs','--json')
Invoke-WebGpuCheck 'webgpu-assets' @('tools/build/webgpu-assets.cjs','--check')
$env:COCOS_EFFECT_COMPILER_ROOT='D:/Work/Github/cocos-cli'
Invoke-WebGpuCheck 'builtin-regeneration' @('tools/build/builtin-assets.cjs','--check')
Invoke-WebGpuCheck 'focused-format' @('node_modules/prettier/bin/prettier.cjs','--check','tools/verify/webgpu-backend.cjs','tools/verify/webgpu-candidate.cjs','tools/verify/webgpu-custom-pipeline.cjs','tools/verify/webgpu-environment.cjs','tools/verify/webgpu-resource-contracts.cjs','tools/verify/webgpu-completion-runner.cjs','tools/verify/webgpu-acceptance.cjs','tools/verify/consumer-acceptance.cjs','tools/verify/verify-custom-exports.cjs','examples/webgpu-basic/src/main.ts')
$webgpuSourceAfter = (& node -e "console.log(require('./tools/verify/webgpu-candidate.cjs').sourceFingerprint(process.cwd()))").Trim()
$webgpuPassed = ($webgpuSourceBefore -eq $webgpuSourceAfter) -and @($webgpuReceipts | Where-Object exitCode -ne 0).Count -eq 0
$webgpuResult = [ordered]@{ passed=$webgpuPassed; sourceSha256=$webgpuSourceBefore; sourceUnchanged=($webgpuSourceBefore -eq $webgpuSourceAfter); receipts=$webgpuReceipts }
$webgpuResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $webgpuDirectory 'report.json') -Encoding utf8
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $webgpuDirectory 'producer.ps1')
$webgpuManifestPath='docs/evidence/webgpu-completion/manifest.json'
$webgpuManifest=Get-Content -LiteralPath $webgpuManifestPath -Raw | ConvertFrom-Json -AsHashtable
Get-ChildItem -LiteralPath $webgpuDirectory -File | ForEach-Object { $webgpuManifest.files['static/'+$_.Name]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
$webgpuManifest.staticValidation=[ordered]@{passed=$webgpuPassed;sourceSha256=$webgpuSourceBefore;report='static/report.json'}
$webgpuManifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $webgpuManifestPath -Encoding utf8
$webgpuResult | ConvertTo-Json -Depth 1
if (-not $webgpuPassed) { exit 1 }
