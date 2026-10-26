$ErrorActionPreference='Stop'
$taskOld=Join-Path (Split-Path $PSScriptRoot -Parent) 'android-build-deps-attempt-1'
$taskNew=$PSScriptRoot
$taskPaths=@('dawn/include','dawn/arm64-v8a','skia/arm64-v8a','sdl3/extracted','sdl3/SDL3-3.2.8.aar')
$taskRows=@()
foreach($taskRelative in $taskPaths){
    $taskSource=Join-Path $taskOld $taskRelative
    $taskTarget=Join-Path $taskNew $taskRelative
    if(Test-Path -LiteralPath $taskTarget){throw 'Refusing to replace copied dependency'}
    [IO.Directory]::CreateDirectory((Split-Path $taskTarget -Parent))|Out-Null
    Copy-Item -LiteralPath $taskSource -Destination $taskTarget -Recurse -ErrorAction Stop
    $taskFiles=if((Get-Item -LiteralPath $taskSource).PSIsContainer){Get-ChildItem -LiteralPath $taskSource -File -Recurse}else{Get-Item -LiteralPath $taskSource}
    foreach($taskFile in $taskFiles){
        $taskFileRelative=[IO.Path]::GetRelativePath($taskOld,$taskFile.FullName).Replace('\','/')
        $taskDest=Join-Path $taskNew $taskFileRelative
        $taskHash=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if($taskHash -ne (Get-FileHash -LiteralPath $taskDest -Algorithm SHA256).Hash.ToLowerInvariant()){throw 'Copied dependency byte mismatch'}
        $taskRows+=@{file=$taskFileRelative;bytes=$taskFile.Length;sha256=$taskHash;source=('../android-build-deps-attempt-1/'+$taskFileRelative)}
    }
}
@{schema='reused-android-static-dependencies-v1';pass=$true;files=$taskRows;createdAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskNew 'reused-dependencies.json') -Encoding utf8
@{files=$taskRows.Count;bytes=($taskRows|Measure-Object -Property bytes -Sum).Sum}|ConvertTo-Json
