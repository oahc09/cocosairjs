const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const auditDir = path.join(__dirname, 'attempt-2');
fs.mkdirSync(auditDir);
const base = 'output/runtime-interop/';
const source = base + 'mystral-source';
const build = base + 'android-arm64-build-attempt-1';
const stage = base + 'android-assets-attempt-4';
const matrix = base + 'android-arm64-matrix-attempt-1';
const patch = base + 'android-host-patch-candidate8';
const deps = base + 'android-build-deps-attempt-1';
const expectedHead = '3cea6b450b71661e114a04b8bde777ff6d29f67f';
const expectedApk = 'b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e';
const hashes = {};
const checks = [];
const commands = [];
const abs = p => path.resolve(root, p);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = p => { const value = fs.readFileSync(abs(p)); hashes[p] = sha(value); return value; };
const text = p => bytes(p).toString('utf8').replace(/^\uFEFF/, '');
const json = p => JSON.parse(text(p));
const save = (name, value) => fs.writeFileSync(path.join(auditDir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const assert = (value, message) => { if (!value) throw Error(message); };
const check = (id, value, observations) => { checks.push({ id, pass: !!value, observations }); assert(value, id); };
function run(name, executable, args, cwd = root) {
    const result = spawnSync(executable, args, { cwd, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(path.join(auditDir, name + '.stdout'), result.stdout || '', { flag: 'wx' });
    fs.writeFileSync(path.join(auditDir, name + '.stderr'), result.stderr || '', { flag: 'wx' });
    commands.push({ name, executable, args, cwd, status: result.status, signal: result.signal, error: result.error?.message });
    assert(!result.error && result.status === 0, name + ' command failed');
    return result.stdout;
}
function collect(dir, prefix = '') {
    const output = {};
    for (const entry of fs.readdirSync(abs(dir), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
        const relative = prefix + entry.name;
        if (entry.isDirectory()) Object.assign(output, collect(dir + '/' + entry.name, relative + '/'));
        else { assert(entry.isFile(), 'Unexpected non-regular input'); output[relative] = sha(bytes(dir + '/' + entry.name)); }
    }
    return output;
}
const same = (a,b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
function readZip(buffer) {
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0,buffer.length - 65557); i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i+20) === buffer.length) { end = i; break; }
    }
    assert(end >= 0, 'ZIP EOCD missing');
    assert(buffer.readUInt16LE(end+4) === 0 && buffer.readUInt16LE(end+6) === 0, 'Multi-disk ZIP rejected');
    const count = buffer.readUInt16LE(end+10), entries = new Map();
    let offset = buffer.readUInt32LE(end+16);
    for (let i=0; i<count; i++) {
        assert(buffer.readUInt32LE(offset) === 0x02014b50, 'ZIP central header');
        const flags=buffer.readUInt16LE(offset+8), method=buffer.readUInt16LE(offset+10);
        const packed=buffer.readUInt32LE(offset+20), size=buffer.readUInt32LE(offset+24);
        const nameLength=buffer.readUInt16LE(offset+28), extra=buffer.readUInt16LE(offset+30), comment=buffer.readUInt16LE(offset+32);
        const local=buffer.readUInt32LE(offset+42), name=buffer.toString('utf8',offset+46,offset+46+nameLength);
        assert(!entries.has(name) && !(flags&1), 'Duplicate or encrypted ZIP entry');
        assert(buffer.readUInt32LE(local)===0x04034b50, 'ZIP local header');
        const localNameLength=buffer.readUInt16LE(local+26), localExtra=buffer.readUInt16LE(local+28);
        assert(buffer.toString('utf8',local+30,local+30+localNameLength)===name, 'Local/central ZIP name mismatch');
        const start=local+30+localNameLength+localExtra;
        assert(start+packed<=buffer.length, 'ZIP data bounds');
        const compressed=buffer.subarray(start,start+packed);
        const data=method===0?compressed:method===8?zlib.inflateRawSync(compressed):null;
        assert(data && data.length===size, 'Unsupported compression or wrong ZIP size');
        entries.set(name,{data,bytes:size,sha256:sha(data)});
        offset+=46+nameLength+extra+comment;
    }
    return entries;
}
const report = { schema: 'air-android-arm64-source-exit-audit-v1', startedAt: new Date().toISOString(), completed: false, pass: false,
    scope: 'Independent read-only source/build/APK/dependency/physical-exit evidence audit; no source, report or device mutation', releaseReady: false,
    limitations: ['Only this ARM64 phone with 4096-byte pages', 'SDL/V8 PT_LOAD alignment is 4096; 16KB compatibility is not passed', 'Color normalization and visual oracle audit belongs to the separate reviewer', 'No APK rebuild, install, ADB operation, commit or push by this audit'] };
try {
    const cwd=abs(source);
    const head=run('git-head','git',['rev-parse','HEAD'],cwd).trim();
    const status=run('git-status','git',['status','--porcelain'],cwd);
    const remoteUrl=run('git-fork-url','git',['remote','get-url','oahc09'],cwd).trim();
    const remote=run('git-fork-ls-remote','git',['ls-remote','oahc09','refs/heads/feat/cocosair-webgpu-interop'],cwd).trim();
    check('clean-frozen-head-and-pushed-user-fork', head===expectedHead && status==='' && remoteUrl==='https://github.com/oahc09/mystralnative.git' && remote===expectedHead+'\trefs/heads/feat/cocosair-webgpu-interop', {head,remoteUrl,remote,status});
    report.git={head,remoteUrl,remote,status,connectorFallback:'GitHub connector rejected slash-encoded branch URL; actual git ls-remote read-only remote query succeeded'};
    const fileList=run('git-source-file-list','git',['ls-files','-z','--cached','--others','--exclude-standard','--','src','include','CMakeLists.txt','cmake','android'],cwd).split('\0').filter(Boolean);
    const current=Object.fromEntries([...new Set(fileList)].sort().map(p=>[p,sha(bytes(source+'/'+p))]));
    const maps=['source-before.json','source-after.json','source-verified.json'].map(n=>json(build+'/'+n));
    check('115-source-inputs-before-after-current', fileList.length===115 && maps.every(m=>same(m,current)), {count:fileList.length});
    save('source-current.json',current);
    const assets=collect(stage);
    check('29-stage4-assets-before-after-current',Object.keys(assets).length===29 && ['assets-before.json','assets-after.json','assets-verified.json'].every(n=>same(json(build+'/'+n),assets)),{count:Object.keys(assets).length});
    save('assets-current.json',assets);
    const manifest=json(patch+'/manifest.json');
    const comparison=manifest.files.map(row=>({path:row.path,expected:row.modifiedSha256,worktree:sha(bytes(source+'/'+row.path)),fresh:sha(bytes(patch+'/verification-checkout/'+row.path))}));
    for(const row of comparison){ const b=spawnSync('git',['show',head+':'+row.path],{cwd,windowsHide:true,shell:false,maxBuffer:16*1024*1024});assert(b.status===0,'git binary blob read');row.committed=sha(b.stdout);row.matches=[row.worktree,row.fresh,row.committed].every(v=>v===row.expected);commands.push({name:'git-blob-'+row.path,executable:'git',args:['show',head+':'+row.path],cwd,status:b.status,stdoutBytes:b.stdout.length,stdoutSha256:row.committed}); }
    check('candidate8-22-modified-blobs-equal-commit-and-build',comparison.length===22 && comparison.every(r=>r.matches),{count:comparison.length,includesBinaryWrapper:comparison.some(r=>r.path.endsWith('gradle-wrapper.jar'))});
    save('candidate8-blob-comparison.json',comparison);
    const appReport=json(matrix+'/report.json'),buildReport=json(build+'/build-report.json');
    const apkData=bytes(build+'/app-debug.apk');
    check('fixed-apk-and-accepted-installed-sha',sha(apkData)===expectedApk && buildReport.apk.sha256===expectedApk && appReport.apk.sha256===expectedApk && appReport.installedSha256===expectedApk,{bytes:apkData.length,sha256:sha(apkData),installedApk:appReport.installedApk});
    check('acceptance-source-build-binding',sha(bytes(build+'/build-report.json'))===appReport.hostBuild.sha256 && appReport.hostBuild.matches===true && appReport.hostBuild.abi==='arm64-v8a' && buildReport.sourceCommit===head && buildReport.sourceClean===true && buildReport.compiled===true,{hostBuild:appReport.hostBuild});
    const zip=readZip(apkData),zipRows={};
    for(const [name,entry] of zip) if(name.startsWith('assets/')||name.startsWith('lib/'))zipRows[name]={bytes:entry.bytes,sha256:entry.sha256};
    const retainedRowsMatch=Object.entries(appReport.apkFiles).every(([name,row])=>zipRows[name]?.sha256===row.sha256&&zipRows[name]?.bytes===row.bytes);
    const extraNames=Object.keys(zipRows).filter(name=>!Object.hasOwn(appReport.apkFiles,name));
    check('acceptance-inventory-plus-only-root-build-manifest',retainedRowsMatch&&extraNames.length===1&&extraNames[0]==='assets/assets-manifest.json'&&zipRows[extraNames[0]].sha256===assets['assets-manifest.json'],{retainedCount:Object.keys(appReport.apkFiles).length,actualCount:Object.keys(zipRows).length,extraNames});
    check('all-29-assets-match-apk',Object.entries(assets).every(([p,h])=>zip.get('assets/'+p)?.sha256===h),{count:29});
    const providers={
        'libSDL3.so':deps+'/sdl3/extracted/prefab/modules/SDL3-shared/libs/android.arm64-v8a/libSDL3.so',
        'libv8android.so':deps+'/v8/arm64-v8a/libv8android.so',
        'libc++_shared.so':source+'/android/app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/arm64-v8a/libc++_shared.so',
        'libmystral-runtime.so':source+'/android/app/build/intermediates/stripped_native_libs/debug/stripDebugDebugSymbols/out/lib/arm64-v8a/libmystral-runtime.so'
    };
    const libs=[];
    for(const [name,provider] of Object.entries(providers)){
        const item=zip.get('lib/arm64-v8a/'+name);assert(item,'Missing ARM64 library');const b=item.data;
        assert(b.readUInt32LE(0)===0x464c457f && b[4]===2 && b[5]===1 && b.readUInt16LE(18)===183,'Wrong ELF architecture');
        const loadAlignments=[], phoff=Number(b.readBigUInt64LE(32)), step=b.readUInt16LE(54), count=b.readUInt16LE(56);
        for(let i=0;i<count;i++){const off=phoff+i*step;if(b.readUInt32LE(off)===1)loadAlignments.push(Number(b.readBigUInt64LE(off+48)));}
        libs.push({file:'lib/arm64-v8a/'+name,bytes:item.bytes,sha256:item.sha256,provider,providerSha256:sha(bytes(provider)),machine:183,loadAlignments});
    }
    const snapshot=zip.get('assets/v8/arm64-v8a/snapshot_blob.bin');
    const snapshotHash=sha(bytes(deps+'/v8/arm64-v8a/snapshot_blob.bin'));
    const nativeEntries=[...zip.keys()].filter(n=>n.startsWith('lib/'));
    check('exact-four-arm64-libraries-and-provider-bytes',nativeEntries.length===4&&libs.every(l=>l.sha256===l.providerSha256),{count:libs.length});
    check('snapshot-exact-provider-and-observed-runtime',snapshot?.sha256===snapshotHash&&snapshotHash==='434a882e60f335a44843b9e6c082b78abd4c85afd34cfec38dd6c12fdae15fc6'&&appReport.cases.every(c=>c.runtime.snapshotSha256===snapshotHash),{sha256:snapshotHash,bytes:snapshot.bytes});
    save('apk-native-payloads.json',{libraries:libs,snapshot:{sha256:snapshotHash,bytes:snapshot.bytes}});
    const signature=run('apk-signature','D:/jdk-17/bin/java.exe',['-jar','D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose','--print-certs',abs(build+'/app-debug.apk')]);
    check('fresh-apk-signature',signature.includes('Verifies'),{javaSha256:sha(bytes('D:/jdk-17/bin/java.exe')),apksignerJarSha256:sha(bytes('D:/Android/Sdk/build-tools/36.0.0/lib/apksigner.jar'))});
    const depReceipt=json(build+'/dependency-receipt.json');
    const rawReceipts=depReceipt.receipts.map(r=>({file:r.file,expected:r.sha256,actual:sha(bytes(build+'/'+r.file)),originalActual:sha(bytes(r.original.replace('<android-deps>',deps)))}));
    const materialized=depReceipt.selectedMaterializedInputs.map(r=>({file:r.file,expected:r.sha256,actual:sha(bytes(r.file.replace('<android-deps>',deps)))}));
    check('dependency-receipts-and-selected-providers',rawReceipts.length===6&&rawReceipts.every(r=>r.expected===r.actual&&r.actual===r.originalActual)&&materialized.every(r=>r.expected===r.actual),{receipts:rawReceipts.length,selectedProviders:materialized.length});
    const published=json('output/android-arm64-source-exit-audit-1/skia-published-metadata.json').asset;
    const skiaZip=bytes(deps+'/downloads/Skia-m144-e2e6623374-4-android-Release-arm64.zip');
    const skiaFiles=json(build+'/skia-arm64-files.json'),skiaCurrent=collect(deps+'/skia/arm64-v8a');
    check('skia-arm64-published-digest-and-full-materialization',published.digest==='sha256:'+sha(skiaZip)&&published.size===skiaZip.length&&sha(skiaZip)==='a34a870d783de80b113c3d7cdc2c03bf4b938c856f4d1e3e5e8eabb5d2b481d3'&&same(skiaFiles,skiaCurrent),{sha256:sha(skiaZip),bytes:skiaZip.length,materializedFiles:Object.keys(skiaCurrent).length});
    save('dependency-comparison.json',{rawReceipts,materialized,skiaFiles: Object.keys(skiaCurrent).length});
    const log=text(matrix+'/logcat.txt').split(/\r?\n/);
    const cases=[],ids=['probes','air','pbr','skin','ui','compute'];
    assert(same(Object.fromEntries(appReport.cases.map(c=>[c.caseId,true])),Object.fromEntries(ids.map(c=>[c,true]))),'Six cases required');
    for(const c of appReport.cases){
        const dir=matrix+'/'+c.caseId,pid=c.session.pid;
        const session=json(dir+'/session.json'),exit=json(dir+'/native-exit.json'),ready=json(dir+'/native-ready.json');
        const live=text(dir+'/process-table-before-finish.txt'),gone=text(dir+'/process-table-after-stop.txt');
        const parsePs=s=>{const lines=s.trim().split(/\r?\n/);assert(/^\s*PID\s+NAME\s*$/.test(lines[0]),'Actual PID NAME ps header');const rows=lines.slice(1).map(l=>{const m=l.match(/^\s*(\d+)\s+(.*)$/);assert(m,'Malformed process row');return{pid:Number(m[1]),name:m[2].trim()};});assert(rows.length>50,'Empty/incomplete process table');return rows;};
        const liveRows=parsePs(live),goneRows=parsePs(gone);
        const ownLines=log.flatMap((line,index)=>{const m=line.match(/^\S+\s+\S+\s+(\d+)\s+(\d+)\s+\S\s+([^:]+):\s?(.*)$/);return m&&Number(m[1])===pid?[{line:index+1,text:line,message:m[4]}]:[];});
        let at=-1;
        const required=['finish-request run='+c.runId+' outcome=0','runtime-run-return','runtime-reset-enter','shutdown-enter','shutdown-webgpu-enter','shutdown-webgpu-return','shutdown-window-enter','shutdown-window-return','shutdown-complete','runtime-reset-return','java-native-finished code=0','Finished main function'];
        const proof=required.map(fragment=>{const index=ownLines.findIndex((r,i)=>i>at&&r.message.includes(fragment));assert(index>=0,c.caseId+' missing ordered '+fragment);at=index;return{fragment,line:ownLines[index].line,text:ownLines[index].text};});
        const row={caseId:c.caseId,runId:c.runId,pid,exit,orderedExitProof:proof,raw:{livePs:dir+'/process-table-before-finish.txt',afterStopPs:dir+'/process-table-after-stop.txt',nativeExit:dir+'/native-exit.json',session:dir+'/session.json'},liveRows:liveRows.length,afterStopRows:goneRows.length,
            liveOwnPid:liveRows.some(r=>r.pid===pid&&r.name==='com.mystral.engine.interop'),afterStopNoOwnPid:!goneRows.some(r=>r.pid===pid),afterStopNoOwnPackage:!goneRows.some(r=>r.name==='com.mystral.engine.interop'||r.name.startsWith('com.mystral.engine.interop:'))};
        row.pass=c.completed===true&&c.pass===true&&c.application.completed===true&&c.application.pass===true&&session.runId===c.runId&&session.pid===pid&&exit.pid===pid&&exit.code===0&&exit.error===''&&ready.loadedABI==='arm64-v8a'&&ready.nativeStarted===true&&ready.snapshotSha256===snapshotHash&&row.liveOwnPid&&row.afterStopNoOwnPid&&row.afterStopNoOwnPackage&&c.processCheckCompleted===true&&c.pidGone===true&&c.pidGoneCheck.connected===true&&c.pidGoneCheck.remainingPids.length===0;
        assert(row.pass,c.caseId+' raw exit/process evidence mismatch');cases.push(row);
    }
    check('six-independent-native-real-shutdown-and-ps-proofs',cases.length===6&&new Set(cases.map(c=>c.pid)).size===6&&cases.every(c=>c.pass),{pids:cases.map(c=>c.pid)});
    save('native-exit-comparison.json',cases);
    const alignGap=libs.filter(l=>l.loadAlignments.some(a=>a<16384)).map(l=>l.file);
    check('4kb-device-and-honest-16kb-release-boundary',appReport.device.pageSize===4096&&appReport.device.emulator===false&&appReport.physicalAcceptance===true&&appReport.releaseReady===false&&appReport.elf16kCompatible===false&&appReport.functional4kOnly===true&&alignGap.length===2,{pageSize:appReport.device.pageSize,alignGap,releaseReady:false});
    report.device=appReport.device;report.physicalCaseCount=cases.length;report.apk={bytes:apkData.length,sha256:sha(apkData)};report.alignmentGaps=alignGap;
    report.completed=true;report.pass=true;
}catch(error){report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();report.checks=checks;save('commands.json',commands);save('input-sha256.json',hashes);report.producer={file:'../audit-attempt-2.cjs',sha256:sha(fs.readFileSync(__filename))};save('report.json',report);console.log(JSON.stringify({completed:report.completed,pass:report.pass,checks:checks.length,error:report.error?.message,releaseReady:false}));}

