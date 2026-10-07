'use strict';
// Focused native input→node→AFTER_DRAW→compositor PNG collector. No build/install/watch.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { validateEvidence } = require('./interactive-improvement-evidence.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const ROOT = path.resolve(__dirname, '../..');
const INPUTS = ['build/cocosair.module.js', 'build/cocosair.module.d.ts',
    'test/fixtures/interactive-evidence/main.ts', 'test/fixtures/interactive-evidence/index.html',
    'tools/verify/interactive-improvement-browser.cjs', 'tools/verify/interactive-improvement-evidence.cjs',
    'tools/verify/interactive-improvement-browser.tsconfig.json',
    'tools/verify/browser-engines.cjs', 'tools/verify/competitive-example-server.cjs'];
const CASES = { baseline: -1, moved: 1, reset: -1, occluded: 1, restored: 1 };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fingerprint(file) {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
}
function oracleFor(viewport, dpr, x) {
    // Camera orthoHeight=2, center=(0,0), target x=±1; independent analytic projection.
    const width = Math.round(viewport.width*dpr), height = Math.round(viewport.height*dpr);
    return { region: [0, 0, width, height], kind: 'red', minPixels: Math.floor(500*dpr*dpr),
        expectedCentroid: [width/2 + x*height/4 - 0.5, height/2 - 0.5], tolerance: 2*dpr };
}
function currentContext(record, name) {
    return { sdkModuleSha256: fingerprint(INPUTS[0]).sha256,
        appSha256: fingerprint(INPUTS[2]).sha256,
        harnessSha256: fingerprint(INPUTS[4]).sha256,
        visibilityOracle: oracleFor(record.viewport, record.dpr, CASES[name]) };
}
function checkCase(record, name, runId) {
    const errors = [];
    const check = (v, label) => { if (!v) errors.push(label); };
    if (!(name in CASES)) return { ok: false, errors: ['unknown case'] };
    if (!record || typeof record !== 'object' || !record.viewport || record.viewport.width !== 512
        || record.viewport.height !== 384 || ![1,2].includes(record.dpr)) return { ok: false, errors: ['fixed fixture viewport/DPR'] };
    const validation = validateEvidence({ ...record, result: 'PASS' },
        { ...currentContext(record, name), selectedRunId: runId, selectedCaseId: name });
    const e = record.receivedEvent, m = record.modelState, frame = record.submittedFrame;
    check(e?.isTrusted === true && Number.isSafeInteger(e.sequence) && e.sequence > 0, 'trusted received event');
    check(m?.targetName === 'visible-native-target' && m.x === CASES[name] && m.y === 0 && m.rendererMeshBound === true, 'native target pose');
    check(m?.receivedSequence === e?.sequence && frame?.inputSequence === e?.sequence, 'input/model/frame correlation');
    check(frame?.event === 'AFTER_DRAW' && frame.afterDraw === true && Number.isSafeInteger(frame.step) && frame.step > 0, 'native frame receipt');
    const times = [e?.timestamp, frame?.timestamp, record.observationTimestamp].map(Date.parse);
    check(times.every(Number.isFinite) && times[0] <= times[1] && times[1] <= times[2], 'observation order');
    if (name === 'occluded') {
        check(record.result === 'FAIL', 'occlusion must record a visibility failure');
        check(!validation.ok && validation.failures.length === 1 && validation.failures[0].startsWith('visibility:'), 'occluded false PASS rejected only by pixels');
    } else check(record.result === 'PASS' && validation.ok, 'pixel PASS gate');
    return { ok: errors.length === 0, errors, visibility: validation.visibility,
        candidatePassAccepted: validation.ok, candidatePassFailures: validation.failures };
}
function validateBrowserReport(report) {
    const errors = [];
    if (report?.schemaVersion !== 'ier-native-browser/1' || !Array.isArray(report.rows) || !Array.isArray(report.engines)
        || !report.engines.length || new Set(report.engines).size !== report.engines.length
        || report.engines.some(e=>!['chromium','firefox','webkit'].includes(e))) return { ok: false, errors: ['invalid report'] };
    for (const file of INPUTS) {
        const expected = report.fingerprints?.[file], actual = fingerprint(file);
        if (!expected || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) errors.push(`input drift ${file}`);
    }
    for (const row of report.rows) {
        if (!row || !Array.isArray(row.cases) || row.cases.length !== 5 || row.cases.some(c=>!c || typeof c!=='object')
            || !Array.isArray(row.pageErrors) || !Array.isArray(row.consoleErrors)) { errors.push('five cases and raw error arrays required'); continue; }
        const names = row.cases.map(c=>c.caseId);
        if (new Set(names).size !== 5 || Object.keys(CASES).some(n=>!names.includes(n))) errors.push('case coverage');
        for (const record of row.cases) {
            if (record.dpr !== row.dpr || !record.browser?.startsWith(row.engine+' ')) errors.push('row/case browser/DPR mismatch');
            const v = checkCase(record, record.caseId, report.runId);
            if (!v.ok) errors.push(`${row.engine}/${row.dpr}/${record.caseId}: ${v.errors.join(',')}`);
        }
        if (row.pageErrors.length || row.consoleErrors.length) errors.push('browser errors');
        if (!row.clock?.enginePaused || row.clock.method !== 'STEP_CLOCK') errors.push('single clock');
        if (!row.cleanup?.released || row.cleanup.attached || !row.cleanup.ownedNodeDetached || row.cleanup.meshBound || row.cleanup.materialBound
            || row.cleanup.rendererInvalidAfterClose !== true || !Array.isArray(row.cleanup.refs)
            || row.cleanup.refs.length !== 2 || row.cleanup.refs.some(r=>r.before!==1 || r.after!==0)) errors.push('owned release');
        if (!row.releaseIdentity || row.postReleaseError !== 'RECIPE_DISPOSED') errors.push('terminal lifecycle');
    }
    const expectedRows = report.engines.length * 2;
    if (report.rows.length !== expectedRows || report.engines.some(engine=>[1,2].some(dpr=>!report.rows.some(r=>r.engine===engine && r.dpr===dpr)))) errors.push('engine/DPR coverage');
    return { ok: errors.length===0, errors };
}
async function main() {
    const argv = process.argv.slice(2);
    const verify = argv.find(a=>a.startsWith('--verify='));
    if (verify) {
        const r = validateBrowserReport(JSON.parse(fs.readFileSync(verify.slice(9))));
        process.stdout.write(JSON.stringify(r)+'\n'); process.exitCode=r.ok?0:1; return;
    }
    const outArg = argv.find(a=>a.startsWith('--out='));
    assert(outArg, 'explicit --out=<new.json> required');
    const out = path.resolve(ROOT, outArg.slice(6));
    assert(!fs.existsSync(out), 'report already exists');
    const artifacts = out.replace(/\.json$/, '')+'-artifacts';
    fs.mkdirSync(artifacts, { recursive:true });
    const choice = (argv.find(a=>a.startsWith('--browser=')) || '--browser=all').slice(10);
    const engines = choice==='all'?['chromium','firefox','webkit']:[choice];
    assert(engines.every(e=>['chromium','firefox','webkit'].includes(e)), 'unknown browser');
    const startedAt = new Date().toISOString(), runId = 'ier-'+crypto.randomUUID();
    const report = { schemaVersion:'ier-native-browser/1', runId, engines, startedAt,
        command: [process.execPath,...process.argv.slice(1)], cwd:ROOT, subset:true, completed:false,
        captureMethod:'Native step receipt, then two browser requestAnimationFrame callbacks without advancing the engine, then full compositor screenshot',
        fingerprints:Object.fromEntries(INPUTS.map(f=>[f,fingerprint(f)])), rows:[],
        limitations:['Independent generated native fixture; original 11/16/23/Water/soft/Puzzle assets unavailable.',
            'AFTER_DRAW proves submission; compositor PNG observation is not a physical display timestamp.',
            'Protocol pointer input does not certify a physical touch device. GPU timing and memory unavailable.'] };
    const pw = require('playwright');
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const server = await startExampleServer(ROOT);
    try {
        for (const engine of engines) {
            const browser = await pw[engine].launch({ ...launchOptions(engine), headless:true });
            try {
                for (const dpr of [1,2]) {
                    const row = { engine, browserVersion:browser.version(), dpr, pageErrors:[], consoleErrors:[], cases:[] };
                    report.rows.push(row);
                    const page = await browser.newPage({ viewport:{width:512,height:384}, deviceScaleFactor:dpr });
                    const logs=[];
                    page.on('pageerror',e=>row.pageErrors.push(String(e)));
                    page.on('console',m=>{ logs.push({type:m.type(),text:m.text()}); if(m.type()==='error')row.consoleErrors.push(m.text()); });
                    await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
                    try {
                        await page.goto(server.origin+'/test/fixtures/interactive-evidence/');
                        await page.waitForFunction(()=>!!window.__ierEvidence,null,{timeout:45000,polling:100});
                        async function capture(name) {
                            const observation=await page.evaluate(()=>window.__ierEvidence.step());
                            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
                            const bytes=await page.screenshot();
                            const png=path.join(artifacts,`${engine}-dpr${dpr}-${name}.png`);
                            fs.writeFileSync(png,bytes,{flag:'wx'});
                            const now=new Date().toISOString();
                            const record = { schemaVersion:'ier-evidence/2',runId,caseId:name,
                                appFingerprint:report.fingerprints[INPUTS[2]],sdkFingerprint:report.fingerprints[INPUTS[0]],
                                harnessFingerprint:report.fingerprints[INPUTS[4]], browser:`${engine} ${row.browserVersion}`,
                                viewport:{width:512,height:384},dpr,inputMethod:'PLAYWRIGHT_PROTOCOL_POINTER',seed:0,
                                receivedEvent:observation.receivedEvent,modelState:observation.modelState,
                                layoutReceipt:observation.layoutReceipt,submittedFrame:observation.submittedFrame,
                                pngPath:path.relative(ROOT,png).replace(/\\/g,'/'),pngSha256:sha(bytes),pngBytes:bytes.length,
                                observationTimestamp:now,sourceStatus:'recreated',comparisonDimensions:['interaction','geometry'],
                                limitations:[...report.limitations],referenceComparison:{result:'NOT_RUN',reason:'External source not observed'},
                                result:name==='occluded'?'FAIL':'PASS',method:'STEP_CLOCK',
                                execution:{command:report.command.join(' '),cwd:ROOT,exitCode:0,startedAt,endedAt:now} };
                            row.cases.push(record); row.clock=observation.clock;
                            row.lastValidation=checkCase(record,name,runId);
                        }
                        await page.click('#reset'); await capture('baseline');
                        await page.mouse.click(400,280); await capture('moved');
                        await page.click('#reset'); await capture('reset');
                        await page.click('#occlude'); await page.mouse.click(400,280); await capture('occluded');
                        await page.click('#occlude'); await capture('restored');
                        row.cleanup=await page.evaluate(async()=>{
                            const p=window.__ierEvidence.release(),q=window.__ierEvidence.release();
                            const cleanup=await p; return {...cleanup,releaseIdentity:p===q};
                        });
                        row.releaseIdentity=row.cleanup.releaseIdentity;
                        row.postReleaseError=await page.evaluate(async()=>{try{await window.__ierEvidence.step();return null;}catch(e){return e.message;}});
                    } catch(error) { row.error=String(error.stack||error); row.pageErrors.push(row.error); }
                    finally {
                        await page.close();
                        fs.writeFileSync(path.join(artifacts,`${engine}-dpr${dpr}.log`),JSON.stringify(logs,null,2),{flag:'wx'});
                    }
                    process.stdout.write(`${engine} DPR${dpr}: ${row.cases.length} cases, ${row.pageErrors.length} page errors\n`);
                }
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
    report.endedAt=new Date().toISOString();
    report.validation=validateBrowserReport(report);
    report.scopePassed=report.validation.ok;
    report.exitCode=report.scopePassed?0:1;
    fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
    process.stdout.write(JSON.stringify({out,scopePassed:report.scopePassed,errors:report.validation.errors})+'\n');
    process.exitCode=report.exitCode;
}
module.exports={oracleFor,checkCase,validateBrowserReport};
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
