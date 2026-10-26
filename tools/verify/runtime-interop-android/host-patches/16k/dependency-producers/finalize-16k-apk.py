"""Verify one isolated 16KB ELF/static-C++ APK candidate. No device operations."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, shutil, struct, subprocess, sys, zipfile

ABI=sys.argv[1]
assert ABI in ['arm64-v8a','x86_64']
DEPS=Path(__file__).resolve().parent
BASE=DEPS.parent
SOURCE=BASE/'mystral-source'
OLD=BASE/'android-build-deps-attempt-1'
OPS=BASE/('android-16k-arm64-build-attempt-1' if ABI=='arm64-v8a' else 'android-16k-x64-build-attempt-1')
STAGE=BASE/'android-assets-attempt-4'
LLVM=Path('D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin')
commands=[]
def sha(data):return hashlib.sha256(data).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(name,value):
    with (OPS/name).open('x',encoding='utf-8') as f:json.dump(value,f,indent=2);f.write('\n')
def run(name,exe,args):
    p=subprocess.run([str(exe),*map(str,args)],capture_output=True,timeout=60)
    (OPS/(name+'.stdout')).write_bytes(p.stdout);(OPS/(name+'.stderr')).write_bytes(p.stderr)
    commands.append(dict(name=name,executable=str(exe),arguments=list(map(str,args)),exitCode=p.returncode,stdoutSha256=sha(p.stdout)))
    if p.returncode:raise RuntimeError(name+' failed')
    return p.stdout.decode('utf-8',errors='replace')
def elf(data):
    assert data[:6]==b'\x7fELF\x02\x01'
    machine=struct.unpack_from('<H',data,18)[0]
    assert machine==(183 if ABI=='arm64-v8a' else 62)
    offset=struct.unpack_from('<Q',data,32)[0];step,count=struct.unpack_from('<HH',data,54)
    ph=[]
    for i in range(count):
        kind,flags,off,va,pa,filesz,memsz,align=struct.unpack_from('<IIQQQQQQ',data,offset+i*step)
        ph.append(dict(index=i,type=kind,flags=flags,offset=off,vaddr=va,filesz=filesz,memsz=memsz,align=align))
    loads=[p for p in ph if p['type']==1]
    assert loads and all(p['align']>=16384 and (p['vaddr']-p['offset'])%16384==0 for p in loads)
    relro=[]
    for p in ph:
        if p['type']!=0x6474e552:continue
        owner=next((l for l in loads if (l['vaddr'],l['filesz'],l['memsz'])==(p['vaddr'],p['filesz'],p['memsz'])),None)
        start=p['vaddr']//16384*16384;end=(p['vaddr']+p['memsz']+16383)//16384*16384
        end_aligned=(p['vaddr']+p['memsz'])%16384==0
        no_overlap=all(l['vaddr']>=end or l['vaddr']+l['memsz']<=start for l in loads if l is not owner and l['flags']&2)
        safe=end_aligned or (owner is not None and no_overlap)
        assert safe
        relro.append(dict(phdrIndex=p['index'],endAligned16KB=end_aligned,ownLoadIndex=owner['index'] if owner else None,noOtherWritableLoadInProtectedPages=no_overlap,staticAlignmentSafe=safe))
    assert relro
    return dict(machine=machine,loadAlignments=[l['align'] for l in loads],loadAlignment16KB=True,relro=relro,relroStaticSafe=True)

command=read(OPS/'command.json');assert command['pass'] and command['exitCode']==0
run('source-verify','node',[OLD/'fingerprint-android-source.cjs',OPS/'source-verified.json'])
run('assets-verify','node',[OLD/'fingerprint-assets.cjs',STAGE,OPS/'assets-verified.json'])
sources=read(OPS/'source-before.json');assets=read(OPS/'assets-before.json')
assert len(sources)==115 and sources==read(OPS/'source-after.json')==read(OPS/'source-verified.json')
assert len(assets)==29 and assets==read(OPS/'assets-after.json')==read(OPS/'assets-verified.json')
apk=OPS/'app-debug.apk';assert not apk.exists()
shutil.copyfile(SOURCE/'android/app/build/outputs/apk/debug/app-debug.apk',apk)
badging=run('aapt-badging','D:/Android/Sdk/build-tools/36.0.0/aapt.exe',['dump','badging',apk])
assert "package: name='com.mystral.engine.interop' versionCode='1' versionName='0.1.0'" in badging
assert re.search(r"^native-code: '"+ABI+r"'\s*$",badging,re.M)
signature=run('apksigner','D:/jdk-17/bin/java.exe',['-jar','D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose','--print-certs',apk])
assert 'Verifies' in signature
zipalign=run('zipalign-16k','D:/Android/Sdk/build-tools/36.0.0/zipalign.exe',['-v','-c','-P','16','4',apk])
assert 'Verification successful' in zipalign
native=[]
with zipfile.ZipFile(apk) as z:
    names=z.namelist();assert len(names)==len(set(names))
    expected=['lib/'+ABI+'/libSDL3.so','lib/'+ABI+'/libmystral-runtime.so']
    assert sorted(n for n in names if n.startswith('lib/'))==expected
    assert len([n for n in names if n.startswith('assets/')])==29
    snapshot_names=[n for n in names if 'snapshot_blob' in n or n.startswith('assets/v8/')];assert not snapshot_names
    for name,expected_sha in assets.items():assert sha(z.read('assets/'+name))==expected_sha
    for name in expected:
        data=z.read(name);target=OPS/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        raw=run(Path(name).name+'-readelf',LLVM/'llvm-readelf.exe',['--wide','--dynamic','--program-headers',target])
        needed=re.findall(r'\(NEEDED\).*?\[(.*?)\]',raw)
        assert not set(needed)&{'libc++_shared.so','libgnustl_shared.so','libstdc++.so','libv8android.so'}
        provider=DEPS/('sdl3/extracted/prefab/modules/SDL3-shared/libs/android.'+ABI+'/libSDL3.so') if name.endswith('/libSDL3.so') else SOURCE/('android/app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/'+ABI+'/libmystral-runtime.so')
        assert sha(data)==sha(provider.read_bytes())
        native.append(dict(file=name,bytes=len(data),sha256=sha(data),needed=needed,zipCompression=z.getinfo(name).compress_type,elf=elf(data),providerMatches=True))
    undefined=run('runtime-undefined-symbols',LLVM/'llvm-nm.exe',['--dynamic','--undefined-only','--demangle',OPS/native[1]['file']])
    cpp_undefined=[l for l in undefined.splitlines() if 'std::__ndk1::' in l or '__cxa_throw' in l or '__gxx_personality' in l]
    assert not cpp_undefined

caches=[]
for p in (SOURCE/'android/app/.cxx/Debug').glob('*/'+ABI+'/CMakeCache.txt'):
    s=p.read_text()
    if 'MYSTRAL_V8_LIBRARY_KIND:STRING=static' in s and 'MYSTRAL_V8_STARTUP_DATA:STRING=embedded' in s and str(DEPS).replace('\\','/') in s.replace('\\','/'):caches.append(p)
assert len(caches)==1
cache=caches[0];build_dir=cache.parent
assert re.search(r'^ANDROID_STL:[^=]+=c\+\+_static$',cache.read_text(),re.M)
ninja=(build_dir/'build.ninja').read_text()
assert 'MYSTRAL_V8_EXTERNAL_STARTUP_DATA=0' in ninja and 'V8_COMPRESS_POINTERS' in ninja
assert '--allow-multiple-definition' not in ninja and '--allow-shlib-undefined' not in ninja
map_file=build_dir/'mystral-runtime.map';map_data=map_file.read_bytes();map_text=map_data.decode()
assert all(n in map_text for n in ['libc++_static.a','libc++abi.a','libv8_monolith.a']) and 'libc++_shared.so' not in map_text
shutil.copyfile(map_file,OPS/'mystral-runtime.map');shutil.copyfile(cache,OPS/'CMakeCache.txt')
map_origins={key:dict(count=sum(key in l for l in map_text.splitlines()),firstLines=[l for l in map_text.splitlines() if key in l][:8]) for key in ['libc++_static.a','libc++abi.a','libv8_monolith.a','android_getCpuFamily','Cr_z_']}
closure=dict(passVerified=True,nativeLibraries=native,cppUndefinedSymbols=cpp_undefined,map=dict(file='mystral-runtime.map',bytes=len(map_data),sha256=sha(map_data),origins=map_origins),normalLinkWithoutDuplicateSuppression=True,cppRuntimeCopiesInOtherApplicationDSOs=0,externalSnapshotAssets=[],scope='Only SDL C-only and one C++ runtime DSO are packaged')
write('static-link-closure.json',closure)
inputs=read(DEPS/'dependency-inputs.json');assert inputs['completed'] and inputs['passVerified'] and len(inputs['files'])==3099
for r in inputs['files']:assert sha((DEPS/r['file']).read_bytes())==r['sha256']
for r in inputs['originalReceipts']:assert sha((DEPS/r['file']).read_bytes())==r['sha256']
assert sha((DEPS/'sdl3/SDL3-3.2.30.aar').read_bytes())=='ac582807f04c82a8cb80140ce6321598848da4a632fd4531874c60df8e019837'
header=(DEPS/'v8/include/v8-version.h').read_text()
version='.'.join(re.search(r'#define\s+'+key+r'\s+(\d+)',header).group(1) for key in ['V8_MAJOR_VERSION','V8_MINOR_VERSION','V8_BUILD_NUMBER','V8_PATCH_LEVEL'])
assert version=='11.6.189.22'
payload=dict(assetCount=29,apkAssets=29,assets=assets,nativeLibraries=native,snapshotMode='embedded',snapshotProviderMatches=None,snapshotProviderVerification='NOT_APPLICABLE_EMBEDDED_STARTUP',externalSnapshotPresent=False,sdlProviderMatches=True,sdlVersion='3.2.30',v8ProviderKind='static-monolith',v8StaticArchiveSha256=sha((DEPS/('v8/'+ABI+'/libv8_monolith.a')).read_bytes()))
payload['pass']=True;write('payload-verification.json',payload)
elf_report=dict(schema='mystral-android-16kb-elf-and-zip-audit-v1',completed=True,elf16kCompatible=True,relroStaticSafe=True,zipalign16kVerified=True,zipPackaging='compressed native libraries / extracted by Android',nativeLibraries=native,runtime16KB='NOT_RUN_BY_BUILD_OPERATION',releaseReady=False)
write('elf-16k-verification.json',elf_report)
dependency=dict(schema='mystral-android-16kb-dependencies-v1',sdlVersion='3.2.30',sdlAarSha256=inputs['sdlAarSha256'],materializedReceipt=dict(file='../deps-16k-attempt-1/dependency-inputs.json',sha256=sha((DEPS/'dependency-inputs.json').read_bytes())),androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded',v8Version=version)
dependency['pass']=True;write('dependency-receipt.json',dependency)
result=dict(schema='mystral-android-build-v1',compiled=True,runnable=False,deviceExecution='NOT_RUN_BY_BUILD_OPERATION',sourceInputsUnchanged=True,assetsInputsUnchanged=True,sourceCount=115,sourceBaseCommit=command['sourceBaseCommit'],apk=dict(file='app-debug.apk',bytes=apk.stat().st_size,sha256=sha(apk.read_bytes())),package='com.mystral.engine.interop',abi=ABI,minSdk=26,targetSdk=34,versionCode=1,versionName='0.1.0',signatureVerified=True,androidStl='c++_static',v8LibraryKind='static',v8StartupMode='embedded',v8Version=version,sdlVersion='3.2.30',elf16kCompatible=True,zipalign16kVerified=True,payload=payload,command=command,createdAt=datetime.now(timezone.utc).isoformat(),releaseReady=False)
result['pass']=True;write('finalizer-commands.json',commands);write('build-report.json',result)
print(json.dumps(dict(verified=True,abi=ABI,apk=result['apk'],nativeCount=2,elf16kCompatible=True,relroStaticSafe=True,zipalign16kVerified=True,runtime16KB='NOT_RUN_BY_BUILD_OPERATION')))
