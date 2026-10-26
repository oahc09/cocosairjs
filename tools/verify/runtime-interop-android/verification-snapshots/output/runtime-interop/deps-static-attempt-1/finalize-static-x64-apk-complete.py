"""Freeze and verify the built static-C++ candidate; no device operations."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, shutil, subprocess, zipfile

DEPS=Path(__file__).resolve().parent
BASE=DEPS.parent
ROOT=BASE.parents[1]
SOURCE=BASE/'mystral-source'
OLD=BASE/'android-build-deps-attempt-1'
OPS=BASE/'android-static-x64-build-attempt-1'
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
run('completion-source-verify','node',[OLD/'fingerprint-android-source.cjs',OPS/'source-completed.json'])
run('completion-asset-verify','node',[OLD/'fingerprint-assets.cjs',STAGE,OPS/'assets-completed.json'])
sources=read(OPS/'source-before.json');assets=read(OPS/'assets-before.json')
assert len(sources)==115 and sources==read(OPS/'source-after.json')==read(OPS/'source-verified.json')==read(OPS/'source-completed.json')
assert len(assets)==29 and assets==read(OPS/'assets-after.json')==read(OPS/'assets-verified.json')==read(OPS/'assets-completed.json')
apk=OPS/'app-debug.apk'
assert sha(apk.read_bytes())==sha((SOURCE/'android/app/build/outputs/apk/debug/app-debug.apk').read_bytes())
signature=run('completion-signature','D:/jdk-17/bin/java.exe',['-jar','D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose','--print-certs',apk])
assert 'Verifies' in signature
badging=run('completion-badging','D:/Android/Sdk/build-tools/36.0.0/aapt.exe',['dump','badging',apk])
assert "package: name='com.mystral.engine.interop' versionCode='1' versionName='0.1.0'" in badging
assert re.search(r"^native-code: 'x86_64'\s*$",badging,re.M)
closure=read(OPS/'static-link-closure.json')
assert closure['passVerified'] and closure['cppUndefinedSymbols']==[] and closure['normalLinkWithoutDuplicateSuppression']
assert sha((OPS/closure['map']['file']).read_bytes())==closure['map']['sha256']
native=closure['nativeLibraries']
with zipfile.ZipFile(apk) as z:
    native_names=sorted(n for n in z.namelist() if n.startswith('lib/'))
    assert native_names==['lib/x86_64/libSDL3.so','lib/x86_64/libmystral-runtime.so']
    snapshot_names=[n for n in z.namelist() if 'snapshot_blob' in n or n.startswith('assets/v8/')]
    assert not snapshot_names
    assert len([n for n in z.namelist() if n.startswith('assets/')])==29
    for name,expected in assets.items():assert sha(z.read('assets/'+name))==expected,name
    for library in native:
        assert sha(z.read(library['file']))==library['sha256']==sha((OPS/library['file']).read_bytes())
        raw=run('completion-'+Path(library['file']).name,LLVM/'llvm-readelf.exe',['--wide','--dynamic',OPS/library['file']])
        needed=re.findall(r'\(NEEDED\).*?\[(.*?)\]',raw)
        assert needed==library['needed'] and not set(needed)&{'libc++_shared.so','libstdc++.so','libgnustl_shared.so','libv8android.so'}
download=read(DEPS/'v8-download-receipt.json')
assert download['pass'] and len(download['files'])==119
for item in download['files']:assert item['pass'] and sha((DEPS/item['destination']).read_bytes())==item['sha256']
x64download=read(DEPS/'v8-download-receipt-x64.json')
x64files=[x64download['files']] if isinstance(x64download['files'],dict) else x64download['files']
assert x64download['pass'] and len(x64files)==1
for item in x64files:assert item['pass'] and sha((DEPS/item['destination']).read_bytes())==item['sha256']
assert read(DEPS/'x64-header-equivalence.json')['allTopLevelObjectsIdentical']
reused=read(DEPS/'reused-dependencies.json')
assert reused['pass']
for item in reused['files']:assert sha((DEPS/item['file']).read_bytes())==item['sha256']
x64reused=read(DEPS/'reused-dependencies-x64.json')
assert x64reused['pass']
for item in x64reused['files']:assert sha((DEPS/item['file']).read_bytes())==item['sha256']
header=(DEPS/'v8/include/v8-version.h').read_text()
version='.'.join(re.search(r'#define\s+'+key+r'\s+(\d+)',header).group(1) for key in ['V8_MAJOR_VERSION','V8_MINOR_VERSION','V8_BUILD_NUMBER','V8_PATCH_LEVEL'])
assert version=='11.6.189.22'
payload=dict(passVerified=True,**{'pass':True},assetCount=29,apkAssets=29,assets=assets,nativeLibraries=native,snapshotMode='embedded',snapshotProviderMatches=None,snapshotProviderVerification='NOT_APPLICABLE_EMBEDDED_STARTUP',externalSnapshotPresent=False,sdlProviderMatches=True,
             v8ProviderKind='static-monolith',v8StaticArchiveSha256=sha((DEPS/'v8/x86_64/libv8_monolith.a').read_bytes()))
write('payload-verification.json',payload)
dependency=dict(**{'pass':True},schema='mystral-android-static-dependencies-v1',passVerified=True,v8Ref=download['ref'],v8Version=version,v8DownloadReceipt=dict(file='../deps-static-attempt-1/v8-download-receipt.json',sha256=sha((DEPS/'v8-download-receipt.json').read_bytes())),reusedReceipt=dict(file='../deps-static-attempt-1/reused-dependencies.json',sha256=sha((DEPS/'reused-dependencies.json').read_bytes())),androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded')
dependency['x64MonolithReceipt']=dict(file='../deps-static-attempt-1/v8-download-receipt-x64.json',sha256=sha((DEPS/'v8-download-receipt-x64.json').read_bytes()))
dependency['headerEquivalenceReceipt']=dict(file='../deps-static-attempt-1/x64-header-equivalence.json',sha256=sha((DEPS/'x64-header-equivalence.json').read_bytes()))
dependency['x64ReusedReceipt']=dict(file='../deps-static-attempt-1/reused-dependencies-x64.json',sha256=sha((DEPS/'reused-dependencies-x64.json').read_bytes()))
write('dependency-receipt.json',dependency)
result=dict(schema='mystral-android-build-v1',compiled=True,runnable=False,deviceExecution='NOT_RUN_BY_BUILD_OPERATION',passVerified=True,sourceInputsUnchanged=True,assetsInputsUnchanged=True,sourceCount=115,sourceBaseCommit=command['sourceBaseCommit'],
            apk=dict(file='app-debug.apk',bytes=apk.stat().st_size,sha256=sha(apk.read_bytes())),package='com.mystral.engine.interop',abi='x86_64',minSdk=26,targetSdk=34,versionCode=1,versionName='0.1.0',signatureVerified=True,
            androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded',v8Version=version,v8VersionEvidence='Fixed matching v8-version.h; runtime JNI version is verified separately during device acceptance',
            payload=payload,command=command,createdAt=datetime.now(timezone.utc).isoformat(),releaseReady=False)
# Preserve the established boolean names consumed by the acceptance collector.
result['pass']=True;payload['pass']=True;dependency['pass']=True
# payload JSON above intentionally uses no fake external snapshot match.
write('finalizer-commands.json',commands)
write('build-report.json',result)
print(json.dumps({'pass':True,'apk':result['apk'],'native':len(native),'androidStl':'c++_static','v8Version':version,'snapshot':'embedded / no external assets'}))
