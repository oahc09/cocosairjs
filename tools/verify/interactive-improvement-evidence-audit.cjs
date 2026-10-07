'use strict';
// Read actual captured rows and reject in-memory clones; never starts a browser.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateBrowserReport}=require('./interactive-improvement-browser.cjs');
const {validateEvidence}=require('./interactive-improvement-evidence.cjs');
const ROOT=path.resolve(__dirname,'../..');
function audit(report) {
    const actual=validateBrowserReport(report);
    const mutations=[
        ['unknown-SDK',r=>r.rows[0].cases[1].sdkFingerprint.sha256='UNKNOWN'],
        ['app-drift',r=>r.rows[0].cases[1].appFingerprint.sha256='a'.repeat(64)],
        ['harness-drift',r=>r.rows[0].cases[1].harnessFingerprint.sha256='b'.repeat(64)],
        ['PNG-drift',r=>r.rows[0].cases[1].pngSha256='c'.repeat(64)],
        ['missing-PNG',r=>r.rows[0].cases[1].pngPath='MISSING'],
        ['unknown-event',r=>r.rows[0].cases[1].receivedEvent='UNKNOWN'],
        ['untrusted-event',r=>r.rows[0].cases[1].receivedEvent.isTrusted=false],
        ['wrong-native-pose',r=>r.rows[0].cases[1].modelState.x=-1],
        ['late-run',r=>r.rows[0].cases[1].runId='old-run'],
        ['missing-frame',r=>r.rows[0].cases[1].submittedFrame.event='UNKNOWN'],
        ['before-submission',r=>r.rows[0].cases[1].observationTimestamp='2000-01-01T00:00:00.000Z'],
        ['nonzero-exit',r=>r.rows[0].cases[1].execution.exitCode=1],
        ['unknown-clock-range',r=>delete r.rows[0].cases[1].execution.endedAt],
        ['occluded-PASS',r=>r.rows[0].cases[3].result='PASS'],
        ['stale-positions-in-PNG',r=>Object.assign(r.rows[0].cases[1],{pngPath:r.rows[0].cases[0].pngPath,pngSha256:r.rows[0].cases[0].pngSha256,pngBytes:r.rows[0].cases[0].pngBytes})],
        ['resource-ref-inflated',r=>r.rows[0].cleanup.refs[0].after=9],
        ['input-still-attached',r=>r.rows[0].cleanup.attached=true],
        ['missing-engine',r=>r.rows.pop()],
    ].map(([name,mutate])=>{
        const clone=structuredClone(report); mutate(clone); const result=validateBrowserReport(clone);
        return {name,rejected:!result.ok,errors:result.errors};
    });
    const row=report.rows[0].cases[1];
    const noOracle=validateEvidence(row,{sdkModuleSha256:row.sdkFingerprint.sha256,appSha256:row.appFingerprint.sha256,harnessSha256:row.harnessFingerprint.sha256});
    mutations.push({name:'missing-frozen-pixel-oracle',rejected:!noOracle.ok,errors:noOracle.failures});
    return {schemaVersion:'ier-evidence-audit/1',method:'REAL_REPORT_CLONES',actual,
        browserRunsAdded:0,mutations,ok:actual.ok&&mutations.every(m=>m.rejected),
        limitations:['In-memory corruption checks of actual captured data; no additional browser execution.']};
}
module.exports={audit};
if(require.main===module){
    try{
        const reportArg=process.argv.find(a=>a.startsWith('--report=')),outArg=process.argv.find(a=>a.startsWith('--out='));
        if(!reportArg||!outArg)throw Error('--report=<actual.json> --out=<new.json> required');
        const input=path.resolve(ROOT,reportArg.slice(9)),bytes=fs.readFileSync(input),r=audit(JSON.parse(bytes));
        r.command=[process.execPath,...process.argv.slice(1)];r.cwd=ROOT;r.observedAt=new Date().toISOString();
        r.inputs={report:{path:path.relative(ROOT,input).replace(/\\/g,'/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')},
            audit:{path:'tools/verify/interactive-improvement-evidence-audit.cjs',sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}};
        const out=path.resolve(ROOT,outArg.slice(6));fs.mkdirSync(path.dirname(out),{recursive:true});
        fs.writeFileSync(out,JSON.stringify(r,null,2),{flag:'wx'});
        console.log(JSON.stringify({ok:r.ok,actual:r.actual,mutations:r.mutations.length,rejected:r.mutations.filter(m=>m.rejected).length}));process.exitCode=r.ok?0:1;
    }catch(e){console.error(e.stack);process.exitCode=1;}
}
