"""Independent final source/dependency/APK audit. Writes only this new audit directory."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, io, json, re, struct, subprocess, sys, zipfile

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
BASE=ROOT/'output/runtime-interop'
HOST=BASE/'mystral-source'
DEPS=BASE/'deps-16k-attempt-1'
STAGE=BASE/'android-assets-attempt-4'
LLVM=Path('D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin')
inputs,commands,checks={},{},[]
def label(p):
    try:return str(p.relative_to(ROOT)).replace('\\','/')
    except ValueError:return str(p)
def sha_bytes(data):return hashlib.sha256(data).hexdigest()
def sha_file(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    value=h.hexdigest();inputs[label(p)]=value;return value
def read(p):sha_file(p);return json.loads(p.read_text(encoding='utf-8-sig'))
def save(name,value):
    with (OUT/name).open('x',encoding='utf-8') as f:json.dump(value,f,indent=2);f.write('\n')
def check(name,value,observations):
    checks.append(dict(id=name,passVerified=bool(value),observations=observations))
    if not value:raise RuntimeError(name)
def run(name,exe,args,cwd=ROOT):
    p=subprocess.run([str(exe),*map(str,args)],cwd=cwd,capture_output=True,timeout=60)
    (OUT/(name+'.stdout')).write_bytes(p.stdout);(OUT/(name+'.stderr')).write_bytes(p.stderr)
    commands[name]=dict(executable=str(exe),arguments=list(map(str,args)),exitCode=p.returncode,stdoutSha256=sha_bytes(p.stdout),stderrSha256=sha_bytes(p.stderr))
    if p.returncode:raise RuntimeError(name+' command failed')
    return p.stdout.decode('utf-8',errors='replace')
def current_sources():
    p=subprocess.run(['git','ls-files','-z','--cached','--others','--exclude-standard','--','src','include','CMakeLists.txt','cmake','android'],cwd=HOST,capture_output=True,check=True)
    files=p.stdout.decode().split('\0');return {n:sha_file(HOST/n) for n in sorted(set(files)-{''})}
def git_blob(p):
    h=hashlib.sha1();h.update(('blob '+str(p.stat().st_size)+'\0').encode())
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def elf(data,abi):
    assert data[:6]==b'\x7fELF\x02\x01'
    machine=struct.unpack_from('<H',data,18)[0];assert machine==(183 if abi=='arm64-v8a' else 62)
    table=struct.unpack_from('<Q',data,32)[0];step,count=struct.unpack_from('<HH',data,54)
    ph=[]
    for i in range(count):
        kind,flags,offset,va,pa,filesz,memsz,align=struct.unpack_from('<IIQQQQQQ',data,table+i*step)
        ph.append(dict(index=i,type=kind,flags=flags,offset=offset,vaddr=va,filesz=filesz,memsz=memsz,align=align))
    loads=[p for p in ph if p['type']==1]
    aligned=bool(loads) and all(l['align']>=16384 and (l['vaddr']-l['offset'])%16384==0 for l in loads)
    relro=[]
    for p in ph:
        if p['type']!=0x6474e552:continue
        own=next((l for l in loads if (l['vaddr'],l['filesz'],l['memsz'])==(p['vaddr'],p['filesz'],p['memsz'])),None)
        start=p['vaddr']//16384*16384;end=(p['vaddr']+p['memsz']+16383)//16384*16384
        end_aligned=(p['vaddr']+p['memsz'])%16384==0
        no_overlap=all(l['vaddr']>=end or l['vaddr']+l['memsz']<=start for l in loads if l is not own and l['flags']&2)
        relro.append(dict(phdrIndex=p['index'],endAligned16KB=end_aligned,ownLoadIndex=own['index'] if own else None,noOtherWritableLoadInProtectedPages=no_overlap,safe=end_aligned or (own is not None and no_overlap)))
    return dict(machine=machine,loadAlignments=[l['align'] for l in loads],load16KB=aligned,relro=relro,relroStaticSafe=bool(relro) and all(r['safe'] for r in relro))

report=dict(schema='air-android-16kb-build-source-independent-audit-v1',startedAt=datetime.now(timezone.utc).isoformat(),completed=False,releaseReady=False,
    scope='Independent static build/source/dependency and accepted-report binding audit. Pixel/source-code and environment details are audited separately.',
    arm64Runtime16KB='NOT_RUN',arm64NewCandidateScope='BUILD_AND_STATIC_ONLY',x64RuntimeEvidence='4KB and strict 16KB simulator reports; no physical-device acceptance for these new APKs',deviceOperations=False,sourceMutations=False,artifactMutations=False)
try:
    head=run('git-head','git',['rev-parse','HEAD'],HOST).strip()
    status=run('git-status','git',['status','--porcelain'],HOST)
    staged=run('git-staged','git',['diff','--cached','--name-only'],HOST)
    expected={'CMakeLists.txt','android/app/build.gradle.kts','android/app/src/main/java/com/mystral/engine/InteropServer.java','android/app/src/main/java/com/mystral/engine/MystralActivity.java','src/js/v8_engine.cpp','src/platform/android_main.cpp'}
    check('original-six-dirty-files-preserved-without-staging',head=='3cea6b450b71661e114a04b8bde777ff6d29f67f' and staged=='' and {l[3:] for l in status.splitlines()}==expected and all(l[:2]==' M' for l in status.splitlines()),dict(head=head,status=status,staged=staged))
    run('git-diff-check','git',['diff','--check'],HOST)
    source=current_sources();assets={str(p.relative_to(STAGE)).replace('\\','/'):sha_file(p) for p in sorted(STAGE.rglob('*')) if p.is_file()}
    check('115-current-source-and29-stage4-assets',len(source)==115 and len(assets)==29,dict(source=len(source),assets=len(assets)))
    save('source-current.json',source);save('assets-current.json',assets)
    gradle=(HOST/'android/app/build.gradle.kts').read_text()
    check('sdl-default-and-explicit-legacy-preserved','gradleProperty("mystralSdlVersion").orElse("3.2.30")' in gradle and 'setOf("3.2.8", "3.2.30")' in gradle and 'SDL3-$sdlVersion.aar' in gradle,{})
    deps=read(DEPS/'dependency-inputs.json')
    differences=[r['file'] for r in deps['files'] if sha_file(DEPS/r['file'])!=r['sha256']]
    check('all3099-materialized-dependencies-unchanged',len(deps['files'])==3099 and not differences,dict(count=len(deps['files']),differences=differences))
    for row in deps['originalReceipts']:assert sha_file(DEPS/row['file'])==row['sha256']
    for name in ['v8-download-receipt.json','v8-download-receipt-x64.json']:
        original=read(DEPS/'original-receipts'/name);rows=original['files'];rows=[rows] if isinstance(rows,dict) else rows
        assert original['ref']=='0be13f7e2e9034d123744935ea73b410b2085b15' and original['pass']
        for row in rows:
            actual=DEPS/row['destination'];assert sha_file(actual)==row['sha256'] and git_blob(actual)==row['expectedGitBlobSha1']
    check('cocos-v8-119plus1-input-git-blobs-reverified',True,dict(ref='0be13f7e2e9034d123744935ea73b410b2085b15',v8Version='11.6.189.22'))
    archive=DEPS/'downloads/SDL3-devel-3.2.30-android.zip';aar=DEPS/'sdl3/SDL3-3.2.30.aar'
    check('published-sdl-zip-and-full-aar-match',sha_file(archive)=='0525e4bc9cc1370e6d664ec93c927846e311c19a819de05a232bca452b0e3a7a' and sha_file(aar)=='ac582807f04c82a8cb80140ce6321598848da4a632fd4531874c60df8e019837',dict(zipSha256=sha_file(archive),aarSha256=sha_file(aar)))
    with zipfile.ZipFile(archive) as outer:assert sha_bytes(outer.read('SDL3-3.2.30.aar'))==sha_file(aar)
    with zipfile.ZipFile(aar) as z:
        for n in z.namelist():
            if not n.endswith('/'):assert sha_bytes(z.read(n))==sha_file(DEPS/'sdl3/extracted'/n)
        description=json.loads(z.read('description.json'));manifest=z.read('AndroidManifest.xml').decode()
        assert description['version']=='3.2.30' and description['git-hash']=='f5e5f6588921eed3d7d048ce43d9eb1ff0da0ffc'
        assert 'android:minSdkVersion="21"' in manifest
    check('aar-java-headers-prefab-native-one-origin',True,dict(description=description,minSdk=21))
    candidates=[]
    for abi,folder,expected_sha in [('arm64-v8a','android-16k-arm64-build-attempt-1','a84ed29a1c5d433e48703647d7e63ce8d853cf836dadd5871b6cba335c984e7a'),('x86_64','android-16k-x64-build-attempt-1','3e7931eac6a49a59f9cc165a98dacca3f93b5f0afea7b1dc3b2cffad2d980757')]:
        build=BASE/folder;b=read(build/'build-report.json');closure=read(build/'static-link-closure.json');elf_report=read(build/'elf-16k-verification.json');dependency=read(build/'dependency-receipt.json')
        check(abi+'-all-source-asset-map-stages',all(read(build/n)==source for n in ['source-before.json','source-after.json','source-verified.json']) and all(read(build/n)==assets for n in ['assets-before.json','assets-after.json','assets-verified.json']),{})
        check(abi+'-receipt-mode-and-dependency-binding',b['pass'] and b['compiled'] and b['androidStl']=='c++_static' and b['v8LibraryKind']=='static' and b['v8StartupMode']=='embedded' and b['v8Version']=='11.6.189.22' and b['sdlVersion']=='3.2.30' and b['payload']['snapshotProviderMatches'] is None and sha_file((build/dependency['materializedReceipt']['file']).resolve())==dependency['materializedReceipt']['sha256'],{})
        apk=build/'app-debug.apk'
        check(abi+'-actual-apk-identity',sha_file(apk)==b['apk']['sha256']==expected_sha and apk.stat().st_size==b['apk']['bytes'],b['apk'])
        sig=run(abi+'-signature','D:/jdk-17/bin/java.exe',['-jar','D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose','--print-certs',apk]);assert 'Verifies' in sig
        align=run(abi+'-zipalign','D:/Android/Sdk/build-tools/36.0.0/zipalign.exe',['-v','-c','-P','16','4',apk]);assert 'Verification successful' in align
        check(abi+'-fresh-signature-and-zipalign',True,{})
        libraries=[]
        with zipfile.ZipFile(apk) as z:
            names=z.namelist();assert len(names)==len(set(names))
            assert sorted(n for n in names if n.startswith('lib/'))==['lib/'+abi+'/libSDL3.so','lib/'+abi+'/libmystral-runtime.so']
            assert len([n for n in names if n.startswith('assets/')])==29
            assert not any('snapshot_blob' in n or n.startswith('assets/v8/') for n in names)
            for n,h in assets.items():assert sha_bytes(z.read('assets/'+n))==h
            for name in ['libSDL3.so','libmystral-runtime.so']:
                entry='lib/'+abi+'/'+name;data=z.read(entry);observed=elf(data,abi)
                retained=next(l for l in closure['nativeLibraries'] if l['file']==entry)
                assert sha_bytes(data)==retained['sha256'] and sha_bytes(data)==next(l for l in b['payload']['nativeLibraries'] if l['file']==entry)['sha256']
                retained_elf=next(l for l in elf_report['nativeLibraries'] if l['file']==entry)['elf']
                assert observed['loadAlignments']==retained_elf['loadAlignments'] and observed['load16KB'] and observed['relroStaticSafe']
                raw=run(abi+'-'+name+'-needed',LLVM/'llvm-readelf.exe',['--wide','--dynamic','--program-headers',build/entry])
                assert sha_file(build/entry)==sha_bytes(data)
                needed=re.findall(r'\(NEEDED\).*?\[(.*?)\]',raw)
                assert needed==retained['needed'] and not set(needed)&{'libc++_shared.so','libv8android.so','libstdc++.so','libgnustl_shared.so'}
                if name=='libSDL3.so':assert sha_bytes(data)==sha_file(DEPS/('sdl3/extracted/prefab/modules/SDL3-shared/libs/android.'+abi+'/libSDL3.so'))
                libraries.append(dict(file=entry,sha256=sha_bytes(data),bytes=len(data),needed=needed,elf=observed,compression=z.getinfo(entry).compress_type))
        undefined=run(abi+'-runtime-undefined',LLVM/'llvm-nm.exe',['--dynamic','--undefined-only','--demangle',build/('lib/'+abi+'/libmystral-runtime.so')])
        assert not any(n in undefined for n in ['std::__ndk1::','__cxa_throw','__gxx_personality'])
        check(abi+'-two-so-no-shared-cpp-no-snapshot-all-elf16k',True,dict(libraries=libraries,assetCount=29))
        mapfile=build/closure['map']['file'];assert sha_file(mapfile)==closure['map']['sha256']
        counts={s:0 for s in ['libc++_static.a','libc++abi.a','libv8_monolith.a']};bad_map=False
        with mapfile.open(encoding='utf-8') as f:
            for line in f:
                for s in counts:counts[s]+=s in line
                if 'libc++_shared.so' in line:bad_map=True
        cache=(build/'CMakeCache.txt').read_text();cache_dir=Path(re.search(r'^CMAKE_CACHEFILE_DIR:INTERNAL=(.+)$',cache,re.M).group(1))
        ninja=(cache_dir/'build.ninja').read_text();sha_file(cache_dir/'build.ninja')
        assert 'MYSTRAL_V8_EXTERNAL_STARTUP_DATA=0' in ninja and 'V8_COMPRESS_POINTERS' in ninja and '--allow-multiple-definition' not in ninja and '--allow-shlib-undefined' not in ninja
        assert closure['normalLinkWithoutDuplicateSuppression'] and closure['cppUndefinedSymbols']==[] and closure['cppRuntimeCopiesInOtherApplicationDSOs']==0
        check(abi+'-real-static-cpp-link-map-without-suppression',all(counts.values()) and not bad_map,dict(mapSha256=sha_file(mapfile),archiveObjectRows=counts))
        candidate=dict(abi=abi,apk=dict(file=label(apk),bytes=apk.stat().st_size,sha256=sha_file(apk)),buildReport=dict(file=label(build/'build-report.json'),sha256=sha_file(build/'build-report.json')),libraries=libraries,scope='BUILD_AND_STATIC_ONLY' if abi=='arm64-v8a' else 'BUILD_STATIC_AND_LINKED_RUNTIME_REPORTS')
        candidates.append(candidate)
    acceptance=[]
    for name,page in [('android-16k-matrix-attempt-2',16384),('android-sdl330-4k-regression-attempt-1',4096)]:
        p=BASE/name/'report.json';r=read(p)
        assert r['completed'] and r['pass'] and r['inputsUnchanged'] and r['simulatorAcceptance'] and not r['physicalAcceptance']
        assert r['apk']['sha256']==r['installedSha256']==candidates[1]['apk']['sha256'] and r['hostBuild']['sha256']==candidates[1]['buildReport']['sha256']
        assert r['device']['pageSize']==r['deviceAfter']['pageSize']==page and len(r['cases'])==6 and {c['caseId'] for c in r['cases']}=={'probes','air','pbr','skin','ui','compute'}
        assert all(c['completed'] and c['pass'] and c['runtime']['loadedABI']=='x86_64' and c['runtime']['v8StartupMode']=='embedded' and c['runtime']['v8Version']=='11.6.189.22' for c in r['cases'])
        if page==16384:
            assert r['page16kRuntimeAcceptance'] and r['device']['compatibility']==r['deviceAfter']['compatibility']=={'linker':'fatal','packageManagerDisabled':'true'}
        else:assert not r['page16kRuntimeAcceptance']
        acceptance.append(dict(file=label(p),sha256=sha_file(p),pageSize=page,caseCount=6,abi='x86_64',page16kRuntimeAcceptance=r['page16kRuntimeAcceptance'],compatibility=r['device']['compatibility'],scope='Retained runtime report binding only; no pixel re-evaluation in this audit'))
    check('same-x64-apk-4kb-and-strict16kb-runtime-report-bindings',True,acceptance)
    check('source-and-staged-assets-still-frozen-after-audit',current_sources()==source and {str(p.relative_to(STAGE)).replace('\\','/'):sha_file(p) for p in STAGE.rglob('*') if p.is_file()}==assets,{})
    check('six-dirty-files-remain-unstaged-after-audit',run('git-status-after','git',['status','--porcelain'],HOST)==status and run('git-staged-after','git',['diff','--cached','--name-only'],HOST)=='',{})
    report.update(completed=True,candidates=candidates,acceptedX64Reports=acceptance,sourceBaseCommit=head,dirtySourceFiles=sorted(expected))
    report['pass']=True
except Exception as error:
    report['error']=dict(name=type(error).__name__,message=str(error));report['pass']=False
finally:
    report.update(finishedAt=datetime.now(timezone.utc).isoformat(),checks=checks,producer=dict(file='audit.py',sha256=sha_file(Path(__file__))))
    save('commands.json',commands);save('input-sha256.json',inputs);save('report.json',report)
    print(json.dumps(dict(completed=report['completed'],verified=report['pass'],checks=len(checks),error=report.get('error'),arm64Runtime16KB='NOT_RUN',releaseReady=False)))
if not report['pass']:sys.exit(1)
