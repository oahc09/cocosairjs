"""Offline SDL candidate assessment. No dependency replacement, build, JNI loading, or ADB."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import io
import json
import re
import struct
import subprocess
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'output/runtime-interop/mystral-source'
OLD = ROOT / 'output/runtime-interop/android-build-deps-attempt-1/sdl3/extracted'
ZIP = HERE / 'SDL3-devel-3.2.30-android.zip'
NDK = Path('D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin')
JAVA = Path('D:/jdk-17/bin/javap.exe')
checks, commands, inputs = [], [], {}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    data = path.read_bytes()
    inputs[str(path)] = digest(data)
    return data

def save(name, value):
    with (HERE / name).open('x', encoding='utf-8', newline='\n') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write('\n')

def check(name, passed, details):
    checks.append({'id': name, 'pass': bool(passed), 'observations': details})
    if not passed:
        raise RuntimeError(name)

def run(name, executable, args):
    process = subprocess.run([str(executable), *map(str, args)], capture_output=True, timeout=45, check=False)
    (HERE / (name + '.stdout')).write_bytes(process.stdout)
    (HERE / (name + '.stderr')).write_bytes(process.stderr)
    commands.append({'name': name, 'executable': str(executable), 'arguments': list(map(str,args)), 'exitCode': process.returncode,
                     'stdoutSha256': digest(process.stdout), 'stderrSha256': digest(process.stderr)})
    if process.returncode != 0:
        raise RuntimeError(name + ' failed')
    return process.stdout.decode('utf-8', errors='replace')

def elf_info(data):
    if data[:6] != b'\x7fELF\x02\x01':
        raise RuntimeError('Expected little-endian ELF64')
    machine = struct.unpack_from('<H', data, 18)[0]
    table = struct.unpack_from('<Q', data, 32)[0]
    step, count = struct.unpack_from('<HH', data, 54)
    phdrs = []
    for index in range(count):
        kind, flags, offset, vaddr, paddr, filesz, memsz, alignment = struct.unpack_from('<IIQQQQQQ', data, table + index * step)
        phdrs.append(dict(index=index, type=kind, flags=flags, offset=offset, vaddr=vaddr, filesz=filesz, memsz=memsz, alignment=alignment))
    loads = [p for p in phdrs if p['type'] == 1]
    relros = []
    for p in phdrs:
        if p['type'] != 0x6474e552:
            continue
        owner = next((l for l in loads if (l['vaddr'],l['memsz'],l['filesz']) == (p['vaddr'],p['memsz'],p['filesz'])), None)
        start, end = p['vaddr'] // 16384 * 16384, (p['vaddr'] + p['memsz'] + 16383) // 16384 * 16384
        end_aligned = (p['vaddr'] + p['memsz']) % 16384 == 0
        separate_writable = all(l['vaddr'] >= end or l['vaddr'] + l['memsz'] <= start for l in loads if l['flags'] & 2 and l is not owner)
        safe = end_aligned or (owner is not None and separate_writable)
        relros.append({'phdrIndex':p['index'], 'endAddress':p['vaddr']+p['memsz'], 'endAligned16KB':end_aligned,
                       'ownLoadIndex':None if owner is None else owner['index'], 'noOtherWritableLoadInProtectedPages':separate_writable,
                       'staticProtectionSafe':safe})
    return {'machine':machine, 'phdrs':phdrs, 'loadAlignments':[p['alignment'] for p in loads],
            'load16KB':bool(loads) and all(p['alignment'] >= 16384 and (p['vaddr']-p['offset']) % 16384 == 0 for p in loads),
            'relro':relros, 'relroStaticSafe':bool(relros) and all(p['staticProtectionSafe'] for p in relros)}

report = {'schema':'air-sdl-16kb-candidate-assessment-v1', 'startedAt':datetime.now(timezone.utc).isoformat(), 'completed':False,
          'candidateStaticPassed':False, 'releaseReady':False, 'runtime16KB':'NOT_RUN', 'deviceOperations':False,
          'sourceMutations':False, 'dependencyReplacement':False, 'appCompilation':'NOT_RUN'}
try:
    blob = read(ZIP)
    published = json.loads(read(HERE / 'published-metadata.json').decode('utf-8-sig'))['asset']
    check('published-candidate-size-and-digest', len(blob) == 15121629 and len(blob) <= 20*1024*1024 and published['digest'] == 'sha256:' + digest(blob)
          and digest(blob) == '0525e4bc9cc1370e6d664ec93c927846e311c19a819de05a232bca452b0e3a7a', {'bytes':len(blob),'sha256':digest(blob)})
    destination = HERE / 'candidate'
    destination.mkdir()
    with zipfile.ZipFile(io.BytesIO(blob)) as outer:
        names = outer.namelist()
        check('one-official-aar', [n for n in names if n.endswith('.aar')] == ['SDL3-3.2.30.aar'], {'entries':names})
        aar_data = outer.read('SDL3-3.2.30.aar')
        aar_path = destination / 'SDL3-3.2.30.aar'
        aar_path.write_bytes(aar_data)
    with zipfile.ZipFile(io.BytesIO(aar_data)) as aar:
        description = json.loads(aar.read('description.json'))
        prefab = json.loads(aar.read('prefab/prefab.json'))
        manifest = aar.read('AndroidManifest.xml').decode()
        check('matched-aar-source-version-and-sdk', description['version'] == '3.2.30' and description['git-hash'] == 'f5e5f6588921eed3d7d048ce43d9eb1ff0da0ffc'
              and 'android:minSdkVersion="21"' in manifest and 'android:targetSdkVersion="35"' in manifest,
              {'description':description,'prefab':prefab,'manifest':manifest})
        sourcejar_data, classes = aar.read('classes-sources.jar'), aar.read('classes.jar')
        (destination / 'classes.jar').write_bytes(classes)
        (destination / 'classes-sources.jar').write_bytes(sourcejar_data)
        with zipfile.ZipFile(io.BytesIO(sourcejar_data)) as sources:
            activity = sources.read('org/libsdl/app/SDLActivity.java').decode()
            surface = sources.read('org/libsdl/app/SDLSurface.java').decode()
            (destination / 'SDLActivity.java').write_text(activity,encoding='utf-8')
            (destination / 'SDLSurface.java').write_text(surface,encoding='utf-8')
        with zipfile.ZipFile(io.BytesIO(classes)) as compiled:
            java_classes = [{'file':n,'majorVersion':struct.unpack_from('>H',compiled.read(n),6)[0]} for n in compiled.namelist() if n.endswith('.class')]
        check('java8-compatible-bytecode', bool(java_classes) and all(c['majorVersion'] <= 52 for c in java_classes), {'classCount':len(java_classes),'majorVersions':sorted(set(c['majorVersion'] for c in java_classes))})
        libraries = []
        for abi, machine in [('arm64-v8a',183),('x86_64',62)]:
            entry = 'prefab/modules/SDL3-shared/libs/android.' + abi + '/libSDL3.so'
            data = aar.read(entry)
            abi_metadata = json.loads(aar.read('prefab/modules/SDL3-shared/libs/android.'+abi+'/abi.json'))
            native_dir = destination / abi
            native_dir.mkdir()
            library = native_dir / 'libSDL3.so'
            library.write_bytes(data)
            info = elf_info(data)
            info.update({'abi':abi,'entry':entry,'bytes':len(data),'sha256':digest(data),'abiMetadata':abi_metadata})
            raw = run(abi+'-readelf',NDK/'llvm-readelf.exe',['--wide','--program-headers','--dynamic',library])
            info['needed'] = re.findall(r'\(NEEDED\).*?\[(.*?)\]',raw)
            info['soname'] = re.findall(r'\(SONAME\).*?\[(.*?)\]',raw)
            version_code = run(abi+'-native-version-code',NDK/'llvm-objdump.exe',['-d','--disassemble-symbols=SDL_GetVersion_REAL',library])
            info['nativeVersionDisassemblyAvailable'] = 'SDL_GetVersion_REAL>:' in version_code
            check(abi+'-real-load-and-relro', info['machine'] == machine and info['load16KB'] and info['relroStaticSafe'] and abi_metadata['api'] == 21 and abi_metadata['ndk'] == 28,
                  {'sha256':info['sha256'],'loadAlignments':info['loadAlignments'],'relro':info['relro'],'abiMetadata':abi_metadata})
            libraries.append(info)
        report['libraries'] = libraries
        report['aar'] = {'name':aar_path.name,'bytes':len(aar_data),'sha256':digest(aar_data),'classesJarSha256':digest(classes),'sourceJarSha256':digest(sourcejar_data),'description':description,'prefab':prefab,'manifest':manifest}
    javap = run('javap-sdlactivity',JAVA,['-classpath',destination/'classes.jar','-protected','-s','-constants','org.libsdl.app.SDLActivity'])
    javap_surface = run('javap-sdlsurface',JAVA,['-classpath',destination/'classes.jar','-protected','-s','org.libsdl.app.SDLSurface'])
    private = run('javap-sdlactivity-private',JAVA,['-classpath',destination/'classes.jar','-private','-constants','org.libsdl.app.SDLActivity'])
    required = [
        'protected void onCreate(android.os.Bundle);',
        'protected org.libsdl.app.SDLSurface createSDLSurface(android.content.Context);',
        'protected java.lang.String[] getLibraries();',
        'protected java.lang.String getMainFunction();',
        'protected java.lang.String[] getArguments();',
        'protected void onPause();', 'protected void onResume();', 'protected void onDestroy();',
        'public void onConfigurationChanged(android.content.res.Configuration);',
        'protected static org.libsdl.app.SDLSurface mSurface;',
    ]
    actual = [{'declaration':r,'present':r in javap} for r in required]
    host_activity = read(SOURCE / 'android/app/src/main/java/com/mystral/engine/MystralActivity.java').decode()
    check('mystral-activity-override-and-inherited-field', all(r['present'] for r in actual) and 'extends android.view.SurfaceView' in javap_surface,
          {'required':actual,'surfaceView': 'extends android.view.SurfaceView' in javap_surface,'hostSourceSha256':digest(host_activity.encode()),'scope':'Actual candidate classes.jar declarations, no App compilation'})
    versions = {key:int(re.search(r'SDL_'+key+r'_VERSION\s*=\s*(\d+)',activity).group(1)) for key in ['MAJOR','MINOR','MICRO']}
    check('java-jni-version-contract-preserved-in-candidate', versions == {'MAJOR':3,'MINOR':2,'MICRO':30} and 'native int nativeSetupJNI();' in javap and 'SDL C/Java version mismatch' in activity,
          {'versionConstants':versions,'nativeSetupJNI':'()I','exactVersionCheck':True,'mixedOldJavaNewNativeWouldBeRejected':True})
    with zipfile.ZipFile(io.BytesIO(read(OLD / 'classes-sources.jar'))) as oldjar:
        old_activity = oldjar.read('org/libsdl/app/SDLActivity.java').decode()
    old_native = sorted(re.findall(r'^\s*public static native\s+(.+);\s*$',old_activity,re.M))
    new_native = sorted(re.findall(r'^\s*public static native\s+(.+);\s*$',activity,re.M))
    report['javaJni'] = {'requiredDeclarations':actual,'versionConstants':versions,'oldSDLActivityNativeMethodCount':len(old_native),
                         'newSDLActivityNativeMethodCount':len(new_native),'removedOrChangedNativeDeclarations':sorted(set(old_native)-set(new_native)),
                         'addedOrChangedNativeDeclarations':sorted(set(new_native)-set(old_native)),'allJavaClassesMustComeFromCandidate':True}
    report['recommendation'] = 'Prefer testing the complete official SDL 3.2.30 AAR before maintaining a private 3.2.8 rebuild. ARM64/x64 ELF and host override signatures passed static checks; runtime and lifecycle acceptance remain mandatory.'
    report['runtime16KB'] = 'NOT_RUN'
    report['completed'] = True
    report['candidateStaticPassed'] = True
except Exception as error:
    report['error'] = {'name':type(error).__name__,'message':str(error)}
    sys.exit_code = 1
finally:
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    report['checks'] = checks
    report['producer'] = {'file':'assess.py','sha256':digest(Path(__file__).read_bytes())}
    report['tools'] = [{'file':str(p),'sha256':digest(read(p))} for p in [Path(sys.executable), JAVA, NDK/'llvm-readelf.exe', NDK/'llvm-objdump.exe']]
    save('commands.json',commands)
    save('input-sha256.json',inputs)
    save('report.json',report)
    print(json.dumps({'completed':report['completed'],'candidateStaticPassed':report['candidateStaticPassed'],'checks':len(checks),'error':report.get('error'),'releaseReady':False}))
if not report['candidateStaticPassed']:
    sys.exit(1)
