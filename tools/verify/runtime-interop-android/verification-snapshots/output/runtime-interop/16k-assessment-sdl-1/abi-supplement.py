"""Read existing APK imports and isolated SDL exports; disassemble version, never load native code."""
from pathlib import Path
import hashlib, io, json, re, subprocess, zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=HERE/'abi-supplement'
OUT.mkdir()
BIN=Path('D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin')
commands=[]
def sha(data): return hashlib.sha256(data).hexdigest()
def run(name,exe,args):
    p=subprocess.run([str(exe),*map(str,args)],capture_output=True,timeout=45)
    (OUT/(name+'.stdout')).write_bytes(p.stdout)
    (OUT/(name+'.stderr')).write_bytes(p.stderr)
    commands.append(dict(name=name,executable=str(exe),arguments=list(map(str,args)),exitCode=p.returncode,stdoutSha256=sha(p.stdout)))
    assert p.returncode==0,name
    return p.stdout.decode()
rows=[]
for abi,build,expected in [
    ('arm64-v8a','android-arm64-build-attempt-1','b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e'),
    ('x86_64','android-build-attempt-10','53093e1e3b3149a6e8e5033bbe1785399232e4565c44af0a810e8eaae18e894c')
]:
    apk=ROOT/'output/runtime-interop'/build/'app-debug.apk'
    blob=apk.read_bytes()
    assert sha(blob)==expected
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        runtime=archive.read('lib/'+abi+'/libmystral-runtime.so')
    runtime_file=OUT/(abi+'-libmystral-runtime.so')
    runtime_file.write_bytes(runtime)
    candidate=HERE/'attempt-2/candidate'/abi/'libSDL3.so'
    imports=run(abi+'-old-runtime-undefined',BIN/'llvm-nm.exe',['--dynamic','--undefined-only',runtime_file])
    exports=run(abi+'-candidate-exports',BIN/'llvm-nm.exe',['--dynamic','--defined-only',candidate])
    names=lambda s: {line.split()[-1].split('@')[0] for line in s.splitlines() if line.split() and line.split()[-1].split('@')[0].startswith('SDL_')}
    required,provided=names(imports),names(exports)
    missing=sorted(required-provided)
    assert required and not missing,(abi,missing)
    assembly=run(abi+'-candidate-getversion',BIN/'llvm-objdump.exe',['-d','--disassemble-symbols=SDL_GetVersion',candidate])
    if abi=='arm64-v8a':
        low=int(re.search(r'mov\s+w0,\s*#0x([0-9a-f]+)',assembly).group(1),16)
        high=int(re.search(r'movk\s+w0,\s*#0x([0-9a-f]+),\s*lsl\s*#16',assembly).group(1),16)
        version=low|(high<<16)
    else:
        version=int(re.search(r'movl\s+\$0x([0-9a-f]+),\s*%eax',assembly).group(1),16)
    assert version==3002030,(abi,version)
    rows.append(dict(abi=abi,oldApk=dict(file=str(apk.relative_to(ROOT)),sha256=sha(blob)),runtimeSha256=sha(runtime),candidateSha256=sha(candidate.read_bytes()),
                     requiredSDLImports=sorted(required),importCount=len(required),missingImports=missing,candidateExportCount=len(provided),
                     nativeGetVersionFromDisassembly=version,nativeSemanticVersion='3.2.30',nativeExecuted=False))
with zipfile.ZipFile(HERE/'attempt-2/candidate/SDL3-3.2.30.aar') as archive:
    header=archive.read('prefab/modules/SDL3-Headers/include/SDL3/SDL_version.h').decode()
header_versions={part:int(re.search(r'#define\s+SDL_'+part+r'_VERSION\s+(\d+)',header).group(1)) for part in ['MAJOR','MINOR','MICRO']}
assert header_versions==dict(MAJOR=3,MINOR=2,MICRO=30)
report=dict(schema='air-sdl-candidate-native-abi-supplement-v1',completed=True,sourceMutations=False,deviceOperations=False,appCompilation='NOT_RUN',nativeExecution='NOT_RUN',
            headerVersion=header_versions,headerSha256=sha(header.encode()),libraries=rows,producerSha256=sha(Path(__file__).read_bytes()),commands=commands)
report['pass']=True
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pass':True,'headerVersion':header_versions,'imports':[{k:r[k] for k in ['abi','importCount','missingImports','nativeGetVersionFromDisassembly']} for r in rows]}))
