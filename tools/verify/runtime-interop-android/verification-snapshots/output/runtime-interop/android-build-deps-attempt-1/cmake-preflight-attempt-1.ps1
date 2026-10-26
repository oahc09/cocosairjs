$ErrorActionPreference='Stop'
$taskDeps=$PSScriptRoot
$taskBase=Split-Path $taskDeps -Parent
$taskSource=Join-Path $taskBase 'mystral-source'
$taskOps=Join-Path $taskBase 'android-cmake-preflight-attempt-1'
New-Item -ItemType Directory -Path $taskOps -ErrorAction Stop|Out-Null
$taskCmake='D:/Android/Sdk/cmake/3.22.1/bin/cmake.exe'
$taskArgs=@('-S',$taskSource,'-B',(Join-Path $taskOps 'build'),'-G','Ninja','-DCMAKE_MAKE_PROGRAM=D:/Android/Sdk/cmake/3.22.1/bin/ninja.exe','-DCMAKE_TOOLCHAIN_FILE=D:/Android/Sdk/ndk/29.0.14206865/build/cmake/android.toolchain.cmake','-DANDROID_ABI=x86_64','-DANDROID_PLATFORM=android-26','-DANDROID_STL=c++_shared','-DCMAKE_BUILD_TYPE=Debug',('-DMYSTRAL_ANDROID_DEPS_ROOT='+$taskDeps.Replace('\','/')),'-DMYSTRAL_USE_V8=ON','-DMYSTRAL_USE_QUICKJS=OFF','-DMYSTRAL_USE_DAWN=ON','-DMYSTRAL_USE_WGPU=OFF','-DMYSTRAL_REQUIRE_CANVAS2D=ON','-DMYSTRAL_USE_SWC=OFF','-DMYSTRAL_USE_DRACO=OFF','-DMYSTRAL_USE_QUICHE=OFF','-DMYSTRAL_USE_RAYTRACING=OFF')
$taskSteps=@()
foreach($taskStep in @(@{name='configure';arguments=$taskArgs},@{name='build';arguments=@('--build',(Join-Path $taskOps 'build'),'--target','mystral-runtime','--parallel','8')})){
 $taskRecord=[ordered]@{name=$taskStep.name;command=$taskCmake;arguments=$taskStep.arguments;startedAt=[DateTime]::UtcNow.ToString('o');pass=$false}
 & $taskCmake @($taskStep.arguments) *> (Join-Path $taskOps ($taskStep.name+'.log'))
 $taskRecord.exitCode=$LASTEXITCODE;$taskRecord.pass=$LASTEXITCODE -eq 0;$taskRecord.finishedAt=[DateTime]::UtcNow.ToString('o');$taskSteps+=[pscustomobject]$taskRecord
 $taskSteps|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskOps 'commands.json') -Encoding utf8
 if(-not $taskRecord.pass){Get-Content -LiteralPath (Join-Path $taskOps ($taskStep.name+'.log')) -Tail 65;exit 1}
 Write-Output ($taskStep.name+': PASS')
}
