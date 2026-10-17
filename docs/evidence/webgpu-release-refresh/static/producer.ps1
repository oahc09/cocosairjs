$ErrorActionPreference = 'Stop'
$webgpuDirectory = 'output/playwright/webkit-video-loop-r4/webgpu/static'
if (Test-Path -LiteralPath $webgpuDirectory) { throw 'Static output already exists' }
New-Item -ItemType Directory -Path $webgpuDirectory | Out-Null
$webgpuSourceBefore = (& node -e "console.log(require('./tools/verify/webgpu-candidate.cjs').sourceFingerprint(process.cwd()))").Trim()
$webgpuReceipts = @()
function Invoke-WebGpuCheck([string]$webgpuName, [string[]]$webgpuArguments) {
    $webgpuStart = [DateTime]::UtcNow.ToString('o')
    & node @webgpuArguments *> (Join-Path $webgpuDirectory ($webgpuName + '.log'))
    $webgpuExitCode = $LASTEXITCODE
    $script:webgpuReceipts += [ordered]@{name=$webgpuName;command=@('node')+$webgpuArguments;startedAt=$webgpuStart;finishedAt=[DateTime]::UtcNow.ToString('o');exitCode=$webgpuExitCode;log=($webgpuName+'.log')}
}
Invoke-WebGpuCheck 'typecheck' @('node_modules/typescript/bin/tsc','--noEmit')
Invoke-WebGpuCheck 'startup-gltf' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/webgpu-admission.test.ts','test/smoke/startup-admission.test.ts','test/smoke/port-gap-bootstrap-config.test.ts','test/smoke/smoke-07-gltf.test.ts','test/smoke/smoke-11-gltf-geometry.test.ts')
Invoke-WebGpuCheck 'physical-materials' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/smoke-15-gltf-physical.test.ts','test/smoke/smoke-16-gltf-clearcoat.test.ts','test/smoke/smoke-17-gltf-anisotropy.test.ts','test/smoke/smoke-18-gltf-iridescence.test.ts','test/smoke/smoke-19-gltf-bump.test.ts','test/smoke/smoke-21-gltf-review-regression.test.ts')
Invoke-WebGpuCheck 'unlit-fog' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/competitive-unlit-fog.test.ts')
Invoke-WebGpuCheck 'video-calibration' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/video-fullscreen-cleanup.test.ts')
Invoke-WebGpuCheck 'api-trace' @('tools/verify/api-trace.cjs','--selftest')
Invoke-WebGpuCheck 'video-sequence' @('tools/verify/video-loop-sequencing.test.cjs')
Invoke-WebGpuCheck 'spec-validation' @('tools/examples/spec-validate.cjs','--strict')
Invoke-WebGpuCheck 'spec-evidence' @('tools/examples/spec-evidence.cjs','--check')
Invoke-WebGpuCheck 'http-range' @('tools/verify/static-file-response.cjs')
Invoke-WebGpuCheck 'd10' @('node_modules/jest/bin/jest.js','--runInBand','--cacheDirectory','output/jest-webgpu','test/smoke/smoke-30-v12-regression.test.ts','--testNamePattern','D10')
Invoke-WebGpuCheck 'file-map' @('tools/verify/verify-file-map.cjs')
Invoke-WebGpuCheck 'wasm-boundary' @('tools/verify/verify-wasm-backends.cjs')
Invoke-WebGpuCheck 'web-only' @('tools/verify/verify-web-only.cjs')
Invoke-WebGpuCheck 'custom-exports' @('tools/verify/verify-custom-exports.cjs','--json')
Invoke-WebGpuCheck 'licenses' @('tools/verify/verify-licenses.cjs','--json')
Invoke-WebGpuCheck 'webgpu-assets' @('tools/build/webgpu-assets.cjs','--check')
$env:COCOS_EFFECT_COMPILER_ROOT='D:/Work/Github/cocos-cli'
Invoke-WebGpuCheck 'builtin-regeneration' @('tools/build/builtin-assets.cjs','--check')
Invoke-WebGpuCheck 'focused-format' @('node_modules/prettier/bin/prettier.cjs','--check','tools/verify/example-spec-browser.cjs','tools/verify/browser-matrix.cjs','tools/verify/gallery-artifact.cjs','tools/benchmark/runner/browser-runtime.cjs','docs/reference/npm-scripts.md','docs/UPSTREAM.md','tools/verify/webgpu-candidate.cjs','tools/verify/webgpu-resource-contracts.cjs','tools/verify/webgpu-acceptance.cjs','src/air/effects/unlit-fog.ts','test/smoke/competitive-unlit-fog.test.ts','test/smoke/video-fullscreen-cleanup.test.ts','tools/verify/example-spec-common.cjs','tools/verify/api-trace.cjs','tools/verify/browser-matrix-contract.json','tools/verify/video-loop-sequencing.test.cjs','examples/video-basic/main.js','examples/video-basic/index.html','examples/video-basic/example.json','examples/spark-splats/src/main.ts','examples/spark-splats/example.json','examples/webgpu-basic/example.json','examples/responsive-board-recipes/src/main.ts','examples/shader-driver-pilot/example.json','tools/examples/spec-validate.cjs','tools/benchmark/runner/browser-runtime.cjs','src/air/assets/gltf/material/physical-effect.ts','src/air/assets/gltf/material/standard-effect.ts','test/smoke/smoke-21-gltf-review-regression.test.ts','test/smoke/smoke-15-gltf-physical.test.ts','tools/build/builtin-assets.cjs','--ignore-path','.gitignore')
$webgpuSourceAfter = (& node -e "console.log(require('./tools/verify/webgpu-candidate.cjs').sourceFingerprint(process.cwd()))").Trim()
$webgpuPassed = ($webgpuSourceBefore -eq $webgpuSourceAfter) -and @($webgpuReceipts | Where-Object exitCode -ne 0).Count -eq 0
$webgpuResult = [ordered]@{passed=$webgpuPassed;sourceSha256=$webgpuSourceBefore;sourceUnchanged=($webgpuSourceBefore -eq $webgpuSourceAfter);receipts=$webgpuReceipts}
$webgpuResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $webgpuDirectory 'report.json') -Encoding utf8
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $webgpuDirectory 'producer.ps1')
$webgpuResult | ConvertTo-Json -Depth 1
if (-not $webgpuPassed) { exit 1 }



