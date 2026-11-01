/* Stage byte-bound SDK/probes/fixtures for the native Android APK. Does not install or build Gradle. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sourceBinding } = require('../verify/runtime-interop.cjs');
const root = path.resolve(__dirname, '../..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = (file) => path.relative(root, file).replace(/\\/g, '/');
const fixtures = [
    'gltf-basic/BoxTextured.glb',
    'gltf-basic/BoxTextured.LICENSE.md',
    'gltf-skin/SimpleSkin.gltf',
    'gltf-skin/SimpleSkin.LICENSE.md',
    ...['skinningData', 'inverseBindMatrices', 'geometry', 'animation'].map((n) => `gltf-skin/SimpleSkin_${n}.bin`),
];

function prepare(argv) {
    const seen = new Set();
    const args = Object.fromEntries(
        argv.map((a) => {
            const m = /^--(out|bundle)=(.+)$/.exec(a);
            if (!m || seen.has(m[1])) throw Error(`Unknown or duplicate argument: ${a}`);
            seen.add(m[1]);
            return [m[1], m[2]];
        }),
    );
    if (!args.out) throw Error('--out=<new-staging-directory> required');
    const out = path.resolve(root, args.out);
    const bundle = path.resolve(root, args.bundle || 'output/runtime-interop/sdk/cocosair.module.js');
    const binding = sourceBinding(bundle);
    if (!binding.matches) throw Error('Android SDK source binding failed; rebuild the bundle and its receipt');
    const shaderManifest = require('./webgpu-assets.cjs').verify(root);
    const shaderDirectory = path.join(path.dirname(bundle), 'webgpu');
    for (const [name, expected] of Object.entries(shaderManifest.files)) {
        if (sha256(fs.readFileSync(path.join(shaderDirectory, name))) !== expected.sha256)
            throw Error(`Deployed WebGPU asset differs from frozen manifest: ${name}`);
    }
    const unregistered = fs
        .readdirSync(shaderDirectory)
        .filter((name) => name !== 'manifest.json' && !Object.hasOwn(shaderManifest.files, name));
    if (unregistered.length) throw Error('Unregistered deployed WebGPU assets');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out);
    const files = {};
    function put(name, bytes, source) {
        const file = path.join(out, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
        files[name.replace(/\\/g, '/')] = { bytes: bytes.length, sha256: sha256(bytes), source };
    }
    put('interop/sdk/cocosair.module.js', fs.readFileSync(bundle), portable(bundle));
    for (const name of fs.readdirSync(path.join(path.dirname(bundle), 'webgpu'))) {
        const file = path.join(path.dirname(bundle), 'webgpu', name);
        if (fs.statSync(file).isFile()) put(`interop/sdk/webgpu/${name}`, fs.readFileSync(file), portable(file));
    }
    for (const name of fs.readdirSync(path.join(root, 'tools/verify/runtime-interop')))
        if (name.endsWith('.mjs')) {
            const file = path.join(root, 'tools/verify/runtime-interop', name);
            put(`interop/probes/${name}`, fs.readFileSync(file), portable(file));
        }
    for (const relative of fixtures) {
        const parts = relative.split('/');
        const file = path.join(root, 'examples', parts[0], 'assets', ...parts.slice(1));
        put(`interop/assets/${relative}`, fs.readFileSync(file), portable(file));
    }
    const entry = `// Same unmodified SDK/probe modules served from this APK's private loopback assets.
(async () => {
    const config = globalThis.__MYSTRAL_INTEROP__;
    const errors = [];
    const originalError = console.error.bind(console);
    console.error = (...args) => { if (errors.length < 32) errors.push(args.map(String).join(' ')); originalError(...args); };
    const request = async (url, body) => {
        const response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json','X-Interop-Token':config.token},body:JSON.stringify(body)});
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Android interop transport failed');
        return result;
    };
    const caseId = config.caseId;
    const kind = caseId === 'probes' || caseId === 'air' ? caseId : 'scene-' + caseId;
    let result, fatal;
    try {
        await request(config.eventUrl, {stage:'entry-ready',caseId});
        if (caseId === 'demo') {
            const module = await import(config.origin + '/probes/android-demo.mjs');
            const demo = await module.runAndroidDemo({canvas:globalThis.canvas,bundleUrl:config.bundleUrl,publish:body=>request(config.eventUrl,body)});
            // Startup identity for the interactive launcher; never a formal six-case acceptance result.
            await request(config.reportUrl,{...demo,runId:config.runId,caseId,pass:true});
            return;
        }
        const capturePresentation = ({phase}={}) => request(config.captureUrl, {kind,...(phase===undefined?{}:{phase})});
        if(caseId==='probes') {
            const module=await import(config.origin+'/probes/probes.mjs');
            result=await module.runRuntimeInterop({canvas:globalThis.canvas,assetBaseUrl:config.assetBaseUrl,moduleUrl:config.moduleUrl,capturePresentation});
        } else if(caseId==='air') {
            const module=await import(config.origin+'/probes/air-smoke.mjs');
            result=await module.runAirSmoke({canvas:globalThis.canvas,bundleUrl:config.bundleUrl,capturePresentation});
        } else {
            const module=await import(config.origin+'/probes/scene-runner.mjs');
            result=await module.runSceneScenario({id:caseId,canvas:globalThis.canvas,bundleUrl:config.bundleUrl,assetRootUrl:config.assetRootUrl,capturePresentation});
        }
    } catch(error) { fatal=String(error.stack||error); }
    const pass = !fatal && errors.length===0 && (caseId==='probes'?result?.pass===true:result?.status==='PASS');
    const report={schema:'air-android-case-v1',runId:config.runId,caseId,completed:!!result&&!fatal,pass,result,fatal,consoleErrors:errors};
    globalThis.__MYSTRAL_INTEROP_RESULT__=report;
    await request(config.reportUrl,report);
    // Keep SDL alive until the independent collector retains the report and requests /finish.
})().catch(error=>console.error('ANDROID_INTEROP_ENTRY_FAILED',String(error.stack||error)));
`;
    put('interop/entry.js', Buffer.from(entry), 'generated Android test transport');
    const manifest = {
        schema: 'air-android-assets-v1',
        preparedAt: new Date().toISOString(),
        bundle: { file: portable(bundle), sha256: sha256(fs.readFileSync(bundle)), sourceBinding: binding },
        generator: { file: portable(__filename), sha256: sha256(fs.readFileSync(__filename)) },
        files,
    };
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'interop/manifest.json'), bytes);
    fs.writeFileSync(path.join(out, 'assets-manifest.json'), bytes);
    console.log(
        JSON.stringify({ assets: portable(out), count: Object.keys(files).length, sdkSha256: manifest.bundle.sha256 }),
    );
    return manifest;
}
module.exports = { prepare };
if (require.main === module)
    try {
        prepare(process.argv.slice(2));
    } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
    }
