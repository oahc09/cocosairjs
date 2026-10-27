const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(__dirname, name),
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
const build = JSON.parse(fs.readFileSync(path.join(root, 'output/runtime-interop/resource-ownership-win-build-attempt-3/build-report.json')));
const executable = path.resolve(root, build.executable.file), fixture = path.join(__dirname, 'control.mjs');
if (hash(fs.readFileSync(executable)) !== '90488adf84cee6223a703a9bcad71ca6c8c77e33254a143dd827fddb5d69b844') throw Error('Frozen Win3 EXE differs');
const args = ['run', fixture, '--headless', '--width', '320', '--height', '240'];
const startedAt = new Date().toISOString();
const processResult = spawnSync(executable, args, {cwd:__dirname,windowsHide:true,shell:false,timeout:30000,maxBuffer:16*1024*1024});
save('stdout.txt', processResult.stdout || Buffer.alloc(0)); save('stderr.txt', processResult.stderr || Buffer.alloc(0));
const lines = (processResult.stdout || Buffer.alloc(0)).toString('utf8').split(/\r?\n/);
const markers = lines.filter((line) => /^(?:\[log\] )?AIR_ABANDONED_FRAME_RESULT /.test(line));
const application = markers.length === 1 ? JSON.parse(markers[0].slice(markers[0].indexOf('AIR_ABANDONED_FRAME_RESULT ') + 'AIR_ABANDONED_FRAME_RESULT '.length)) : null;
let pidGone = false;
try { process.kill(processResult.pid,0); } catch(error) {pidGone=error.code==='ESRCH';}
const report = {schema:'air-native-abandoned-frame-run-v1',startedAt,finishedAt:new Date().toISOString(),
    executable:build.executable,fixture:{file:path.relative(root,fixture).replace(/\\/g,'/'),sha256:hash(fs.readFileSync(fixture))},
    arguments:args,pid:processResult.pid,exitCode:processResult.status,signal:processResult.signal,error:processResult.error && String(processResult.error),
    application,steps:lines.filter((line)=>line.includes('AIR_ABANDONED_FRAME_STEP ')),pidGone,
    pass:processResult.status===0 && application?.completed===true && application?.pass===true && pidGone,
    scope:'Windows real hidden SDL Surface API control only; no Android, compositor pixel or runtime destructor acceptance',subset:true,releaseReady:false};
save('report.json',report);console.log(JSON.stringify(report));process.exitCode=report.pass?0:1;
