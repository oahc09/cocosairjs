const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-report.json')));
const executable = path.resolve(root, build.executable.file), source = path.resolve(root, build.source);
const fingerprint = () => Object.fromEntries(Object.keys(build.sourceAfter).sort().map((file) =>
    [file, hash(fs.readFileSync(path.join(source,file)))]));
const controls = [
    {name:'abandoned-frame', file:path.join(root,'output/runtime-interop/resource-ownership-abandoned-frame-control-attempt-1/control.mjs'),
        marker:'AIR_ABANDONED_FRAME_RESULT ', expectedSha:'2edd64981ae8b562d76c7362182ec2ed685d76566f5d701a50ff230922162b2f'},
    {name:'explicit-canvas-destroy', file:path.join(__dirname,'explicit-destroy-control.mjs'), marker:'AIR_CANVAS_DESTROY_RESULT '},
];
const reports=[];
for (const control of controls) {
    const out=path.join(__dirname,'control-'+control.name+'-attempt-1');fs.mkdirSync(out);
    const save=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    const fixture=fs.readFileSync(control.file), before=fingerprint();
    if((control.expectedSha && hash(fixture)!==control.expectedSha) ||
        hash(fs.readFileSync(executable))!==build.executable.sha256 ||
        JSON.stringify(before)!==JSON.stringify(build.sourceAfter))throw Error('Frozen native candidate/control differs');
    save('source-before.json',before);save('control-source.mjs',fixture);
    const args=['run',control.file,'--headless','--width','320','--height','240'];
    const startedAt=new Date().toISOString();
    const actual=spawnSync(executable,args,{cwd:out,windowsHide:true,shell:false,timeout:30000,maxBuffer:16*1024*1024});
    const stdout=actual.stdout||Buffer.alloc(0),stderr=actual.stderr||Buffer.alloc(0);
    save('stdout.txt',stdout);save('stderr.txt',stderr);
    const lines=stdout.toString('utf8').split(/\r?\n/), markers=lines.filter(line=>line.startsWith(control.marker)||line.startsWith('[log] '+control.marker));
    const application=markers.length===1?JSON.parse(markers[0].slice(markers[0].indexOf(control.marker)+control.marker.length)):null;
    let pidGone=false;try{process.kill(actual.pid,0);}catch(error){pidGone=error.code==='ESRCH';}
    const after=fingerprint();save('source-after.json',after);
    const inputsUnchanged=JSON.stringify(before)===JSON.stringify(after)&&hash(fs.readFileSync(control.file))===hash(fixture)&&hash(fs.readFileSync(executable))===build.executable.sha256;
    const report={schema:'air-native-ownership-control-run-v1',control:control.name,startedAt,finishedAt:new Date().toISOString(),
        executable:build.executable,fixture:{file:path.relative(root,control.file).replace(/\\/g,'/'),sha256:hash(fixture)},
        arguments:args,pid:actual.pid,exitCode:actual.status,signal:actual.signal,error:actual.error&&String(actual.error),
        application,pidGone,inputsUnchanged,runtimeTeardown:'NOT_RUN_BY_WINDOWS_CLI_EXITPROCESS',subset:true,releaseReady:false,
        pass:actual.status===0&&actual.signal===null&&!actual.error&&application?.completed===true&&application?.pass===true&&pidGone&&inputsUnchanged};
    report.status=report.pass?'PASS_API_SCOPE_ONLY':'FAIL';save('report.json',report);reports.push(report);console.log(JSON.stringify(report));
}
fs.writeFileSync(path.join(__dirname,'controls-summary.json'),JSON.stringify({pass:reports.every(r=>r.pass),reports},null,2)+'\n',{flag:'wx'});
process.exitCode=reports.every(r=>r.pass)?0:1;
