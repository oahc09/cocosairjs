const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'probe-attempt-2');
fs.mkdirSync(out);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(out, name),
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const build = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-report.json')));
const original = fs.readFileSync(path.resolve(root, build.probe.file));
if (sha(original) !== build.probe.sha256) throw Error('Original probe changed');
save('original-probe.mjs', original);
let diagnostic = original.toString('utf8');
diagnostic = diagnostic.replace('thrown !== null || validation !== null',
    '(thrown !== null && /expired|destroyed|consumed|invalid/i.test(thrown)) || validation !== null');
diagnostic = diagnostic.replace('const pass = render(invalidEncoder, firstView);\n        pass.end();',
    "const pass = render(invalidEncoder, firstView);\n        console.log('OWNERSHIP_STEP expired-view-pass ' + JSON.stringify({type:typeof pass, id:pass?._nativeResourceId}));\n        if (!pass) return;\n        pass.end();");
diagnostic = diagnostic.replace('render(liveEncoder, context.getCurrentTexture().createView()).end();',
    "const finalTexture = context.getCurrentTexture();\n    const finalView = finalTexture.createView();\n    console.log('OWNERSHIP_STEP final-resource ' + JSON.stringify({encoderId:liveEncoder?._nativeResourceId,textureId:finalTexture?._nativeResourceId,viewType:typeof finalView,viewId:finalView?._nativeResourceId}));\n    const finalPass = render(liveEncoder, finalView);\n    console.log('OWNERSHIP_STEP final-pass ' + JSON.stringify({type:typeof finalPass,id:finalPass?._nativeResourceId}));\n    if(!finalPass) throw Error('Ordinary final render pass is undefined');\n    finalPass.end();");
save('diagnostic.mjs', diagnostic);
const executable = path.resolve(root, build.executable.file);
const source = path.resolve(root, build.source);
const fingerprints = () => Object.fromEntries(Object.keys(build.sourceAfter).sort().map((file) =>
    [file, sha(fs.readFileSync(path.join(source, file)))]));
const before = fingerprints();
if (JSON.stringify(before) !== JSON.stringify(build.sourceAfter) || sha(fs.readFileSync(executable)) !== build.executable.sha256)
    throw Error('Frozen native candidate changed');
const args = ['run', path.join(out, 'diagnostic.mjs'), '--headless', '--width', '320', '--height', '240'];
const startedAt = new Date().toISOString();
const result = spawnSync(executable, args, { cwd: out, windowsHide: true, shell: false, timeout: 90000, maxBuffer: 16*1024*1024 });
save('stdout.txt', result.stdout || Buffer.alloc(0)); save('stderr.txt', result.stderr || Buffer.alloc(0));
const lines = (result.stdout || Buffer.alloc(0)).toString('utf8').split(/\r?\n/);
const markers = lines.filter((line) => /^(?:\[log\] )?AIR_RESOURCE_OWNERSHIP_RESULT /.test(line));
const application = markers.length === 1 ? JSON.parse(markers[0].slice(markers[0].indexOf('AIR_RESOURCE_OWNERSHIP_RESULT ') + 'AIR_RESOURCE_OWNERSHIP_RESULT '.length)) : null;
const report = { schema:'air-native-resource-ownership-diagnostic-v2', startedAt, finishedAt:new Date().toISOString(),
    executable:build.executable, originalProbeSha256:sha(original), diagnosticSha256:sha(Buffer.from(diagnostic)), arguments:args,
    pid:result.pid, exitCode:result.status, signal:result.signal, error:result.error && String(result.error),
    application, steps:lines.filter((line)=>line.includes('OWNERSHIP_STEP ')),
    sourceInputsUnchanged: JSON.stringify(before) === JSON.stringify(fingerprints()),
    runtimeTeardown:'NOT_RUN_BY_CLI_EXITPROCESS', subset:true, releaseReady:false };
save('report.json', report);
console.log(JSON.stringify(report));
process.exitCode=result.status===0 && application?.completed===true && application?.pass===true ? 0 : 1;
