"""Freeze and verify the built static-C++ candidate; no device operations."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, shutil, subprocess, zipfile

DEPS=Path(__file__).resolve().parent
BASE=DEPS.parent
ROOT=BASE.parents[1]
SOURCE=BASE/'mystral-source'
OLD=BASE/'android-build-deps-attempt-1'
OPS=BASE/'android-static-build-attempt-1'
STAGE=BASE/'android-assets-attempt-4'
LLVM=Path('D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin')
commands=[]
def sha(data): return hashlib.sha256(data).hexdigest()
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(n,v):
    with (OPS/n).open('x',encoding='utf-8') as f:json.dump(v,f,indent=2);f.write('\n')
def run(name,exe,args):
    result=subprocess.run([str(exe),*map(str,args)],capture_output=True,timeout=60)
    (OPS/(name+'.stdout')).write_bytes(result.stdout)
    (OPS/(name+'.stderr')).write_bytes(result.stderr)
    commands.append(dict(name=name,executable=str(exe),arguments=list(map(str,args)),exitCode=result.returncode,stdoutSha256=sha(result.stdout)))
    if result.returncode!=0:raise RuntimeError(name+' failed')
    return result.stdout.decode('utf-8',errors='replace')

command=read(OPS/'command.json')
assert command['pass'] and command['exitCode']==0
run('source-verify','node',[OLD/'fingerprint-android-source.cjs',OPS/'source-verified.json'])
run('asset-verify','node',[OLD/'fingerprint-assets.cjs',STAGE,OPS/'assets-verified.json'])
sources=read(OPS/'source-before.json');assets=read(OPS/'assets-before.json')
assert len(sources)==115 and sources==read(OPS/'source-after.json')==read(OPS/'source-verified.json')
assert len(assets)==29 and assets==read(OPS/'assets-after.json')==read(OPS/'assets-verified.json')
generated=SOURCE/'android/app/build/outputs/apk/debug/app-debug.apk'
apk=OPS/'app-debug.apk'
assert not apk.exists()
shutil.copyfile(generated,apk)
badging=run('aapt-badging','D:/Android/Sdk/build-tools/36.0.0/aapt.exe',['dump','badging',apk])
assert "package: name='com.mystral.engine.interop' versionCode='1' versionName='0.1.0'" in badging
assert re.search(r"^native-code: 'arm64-v8a'\s*$",badging,re.M)
signature=run('apksigner','D:/jdk-17/bin/java.exe',['-jar','D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose','--print-certs',apk])
assert 'Verifies' in signature
native=[]
with zipfile.ZipFile(apk) as z:
    names=z.namelist()
    assert len(names)==len(set(names))
    native_names=sorted(n for n in names if n.startswith('lib/'))
    assert native_names==['lib/arm64-v8a/libSDL3.so','lib/arm64-v8a/libmystral-runtime.so']
    snapshot_names=[n for n in names if 'snapshot_blob' in n or n.startswith('assets/v8/')]
    assert not snapshot_names
    assert len([n for n in names if n.startswith('assets/')])==29
    for name,expected in assets.items():assert sha(z.read('assets/'+name))==expected,name
    for name in native_names:
        data=z.read(name);output=OPS/name
        output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(data)
        raw=run(Path(name).name+'-readelf',LLVM/'llvm-readelf.exe',['--wide','--dynamic','--program-headers',output])
        needed=re.findall(r'\(NEEDED\).*?\[(.*?)\]',raw)
        assert not set(needed)&{'libc++_shared.so','libstdc++.so','libgnustl_shared.so','libv8android.so'}
        native.append(dict(file=name,bytes=len(data),sha256=sha(data),needed=needed))
    sdl=(DEPS/'sdl3/extracted/prefab/modules/SDL3-shared/libs/android.arm64-v8a/libSDL3.so').read_bytes()
    assert native[0]['sha256']==sha(sdl)=='07f29ed700506a55814cd07774db2ed9a1c1d32ade3cce27da16dea31342ae57'
    packaged_runtime=SOURCE/'android/app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/arm64-v8a/libmystral-runtime.so'
    assert native[1]['sha256']==sha(packaged_runtime.read_bytes())
    symbols=run('runtime-undefined-symbols',LLVM/'llvm-nm.exe',['--dynamic','--undefined-only','--demangle',OPS/native[1]['file']])
    cpp_undefined=[l for l in symbols.splitlines() if 'std::__ndk1::' in l or '__cxa_throw' in l or '__gxx_personality' in l]
    assert not cpp_undefined,cpp_undefined

caches=[]
for cache in (SOURCE/'android/app/.cxx/Debug').glob('*/arm64-v8a/CMakeCache.txt'):
    value=cache.read_text(encoding='utf-8')
    if 'MYSTRAL_V8_LIBRARY_KIND:STRING=static' in value and 'MYSTRAL_V8_STARTUP_DATA:STRING=embedded' in value and str(DEPS).replace('\\','/') in value.replace('\\','/'):
        caches.append(cache)
assert len(caches)==1,caches
cache=caches[0];build_dir=cache.parent
assert 'ANDROID_STL:UNINITIALIZED=c++_static' in cache.read_text() or 'ANDROID_STL:STRING=c++_static' in cache.read_text()
map_file=build_dir/'mystral-runtime.map'
assert map_file.is_file()
map_bytes=map_file.read_bytes();map_text=map_bytes.decode('utf-8')
assert 'libc++_static.a' in map_text and 'libc++abi.a' in map_text and 'libv8_monolith.a' in map_text
assert 'libc++_shared.so' not in map_text
shutil.copyfile(map_file,OPS/'mystral-runtime.map')
shutil.copyfile(cache,OPS/'CMakeCache.txt')
ninja=(build_dir/'build.ninja').read_text(encoding='utf-8')
assert '--allow-multiple-definition' not in ninja and '--allow-shlib-undefined' not in ninja
assert 'MYSTRAL_V8_EXTERNAL_STARTUP_DATA=0' in ninja and 'V8_COMPRESS_POINTERS' in ninja
map_origins={}
for key in ['libc++_static.a','libc++abi.a','libv8_monolith.a','libzlib.a','android_getCpuFamily','Cr_z_']:
    matches=[line for line in map_text.splitlines() if key in line]
    map_origins[key]=dict(count=len(matches),firstLines=matches[:12])
write('static-link-closure.json',dict(passVerified=True,nativeLibraries=native,cppUndefinedSymbols=cpp_undefined,map=dict(file='mystral-runtime.map',bytes=len(map_bytes),sha256=sha(map_bytes),origins=map_origins),normalLinkWithoutDuplicateSuppression=True,
      cppRuntimeCopiesInOtherApplicationDSOs=0,externalSnapshotAssets=snapshot_names,scope='Only SDL C-only and one C++ runtime DSO are packaged'))

download=read(DEPS/'v8-download-receipt.json')
assert download['pass'] and len(download['files'])==119
for item in download['files']:assert item['pass'] and sha((DEPS/item['destination']).read_bytes())==item['sha256']
reused=read(DEPS/'reused-dependencies.json')
assert reused['pass']
for item in reused['files']:assert sha((DEPS/item['file']).read_bytes())==item['sha256']
header=(DEPS/'v8/include/v8-version.h').read_text()
version='.'.join(re.search(r'#define\s+'+key+r'\s+(\d+)',header).group(1) for key in ['V8_MAJOR_VERSION','V8_MINOR_VERSION','V8_BUILD_NUMBER','V8_PATCH_LEVEL'])
assert version=='11.6.189.22'
payload=dict(passVerified=True,assetCount=29,apkAssets=29,assets=assets,nativeLibraries=native,snapshotMode='embedded',snapshotProviderMatches=None,snapshotProviderVerification='NOT_APPLICABLE_EMBEDDED_STARTUP',externalSnapshotPresent=False,sdlProviderMatches=True,
             v8ProviderKind='static-monolith',v8StaticArchiveSha256=sha((DEPS/'v8/arm64-v8a/libv8_monolith.a').read_bytes()))
write('payload-verification.json',payload)
dependency=dict(schema='mystral-android-static-dependencies-v1',passVerified=True,v8Ref=download['ref'],v8Version=version,v8DownloadReceipt=dict(file='../deps-static-attempt-1/v8-download-receipt.json',sha256=sha((DEPS/'v8-download-receipt.json').read_bytes())),reusedReceipt=dict(file='../deps-static-attempt-1/reused-dependencies.json',sha256=sha((DEPS/'reused-dependencies.json').read_bytes())),androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded')
write('dependency-receipt.json',dependency)
result=dict(schema='mystral-android-build-v1',compiled=True,runnable=False,deviceExecution='NOT_RUN_BY_BUILD_OPERATION',passVerified=True,sourceInputsUnchanged=True,assetsInputsUnchanged=True,sourceCount=115,sourceBaseCommit=command['sourceBaseCommit'],
            apk=dict(file='app-debug.apk',bytes=apk.stat().st_size,sha256=sha(apk.read_bytes())),package='com.mystral.engine.interop',abi='arm64-v8a',minSdk=26,targetSdk=34,versionCode=1,versionName='0.1.0',signatureVerified=True,
            androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded',v8Version=version,v8VersionEvidence='Fixed matching v8-version.h; runtime JNI version is verified separately during device acceptance',
            payload=payload,command=command,createdAt=datetime.now(timezone.utc).isoformat(),releaseReady=False)
# Preserve the established boolean names consumed by the acceptance collector.
result['pass']=True;payload['pass']=True;dependency['pass']=True
# payload JSON above intentionally uses no fake external snapshot match.
write('finalizer-commands.json',commands)
write('build-report.json',result)
print(json.dumps({'pass':True,'apk':result['apk'],'native':len(native),'androidStl':'c++_static','v8Version':version,'snapshot':'embedded / no external assets'}))
