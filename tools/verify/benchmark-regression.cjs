const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const esbuild = require('esbuild');
const { BrowserRuntime } = require('../benchmark/runner/browser-runtime.cjs');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const out = esbuild.buildSync({ entryPoints: [path.join(root,file)], bundle:true, write:false, platform:'node', format:'cjs' });
  const m = new Module(path.join(root,'tools/verify/.regression.cjs'), module);
  m.paths = module.paths; m._compile(out.outputFiles[0].text, m.filename || path.join(root,'.regression.cjs')); return m.exports;
}
const { TrialRunner } = load('tools/benchmark/runner/trial.ts');
const { aggregate } = load('tools/benchmark/runner/metrics.ts');
const { ManualAgentDriver } = load('tools/benchmark/driver/manual-driver.ts');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'air-bench-regression-'));
const fixture = path.join(tmp,'fixture'); fs.mkdirSync(path.join(fixture,'src'),{recursive:true});
const entry = path.join(fixture,'src/main.ts');
const workspace = { paths: { workspace: fixture } };
let checks=0;
(async()=>{
  try {
    const runtime = new BrowserRuntime({repo:root,esbuild});
    for (const source of ['const n: number = "wrong"; export { n };', 'import { MissingExport } from "cocosair"; console.log(MissingExport);', 'import { n } from "./absent"; console.log(n);']) {
      fs.writeFileSync(entry,source); assert.equal((await runtime.build(workspace)).success,false); checks++;
    }
    fs.writeFileSync(entry,'import { Node } from "cocosair"; const n: Node = new Node("test"); export { n };');
    assert.equal((await runtime.build(workspace)).success,true); checks++;
    fs.writeFileSync(entry,'import { createAirApp } from "cocosair"; const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")]; export { createAirApp, buttons };');
    assert.equal((await runtime.build(workspace)).success,true); checks++;
    const base={trialResult:'VALID',engineResult:'PASS',agentResult:'PASS',repairs:0,firstSubmissionCompilePass:true,failureDomain:'NONE',policyDenials:[]};
    const metrics=aggregate([{...base,benchmarkType:'source-create'},{...base,benchmarkType:'runtime-control',firstSubmissionCompilePass:false},{...base,benchmarkType:'source-repair',contractualUnsupported:true},{...base,benchmarkType:'source-create',agentResult:'NOT_EVALUATED'}]);
    assert.equal(metrics.eligibleTrials,2); assert.equal(metrics.eligibleTypeBTrials,1); assert.equal(metrics.firstCompileSuccessRate,1); checks++;
    const benchmark={id:'TEST',version:'1',name:'test',benchmarkType:'source-create',prompt:'test',writablePaths:['src'],readablePaths:[],protectedPaths:[],allowedCommands:[],allowedNetworkHosts:[],validators:['scene-ready'],validatorParams:{},capabilityRequirements:[],repairBudget:1,timeBudgetMs:30};
    const options={benchmark,workRoot:tmp,fixtureDir:fixture,cleanupTimeoutMs:30};
    const blockedRuntime={ build:async()=>({success:true,diagnostics:[]}),start:async()=>new Promise(()=>{}),stop:async()=>new Promise(()=>{}) };
    const driver=new ManualAgentDriver('test');driver.script({type:'write-file',path:'src/main.ts',content:'export {};' });
    const began=Date.now();const result=await new TrialRunner(blockedRuntime).runAgent({...options,runtime:blockedRuntime},driver);
    assert.equal(result.trialResult,'INVALID_RUN');assert.equal(result.failureDomain,'ISOLATION');assert.ok(Date.now()-began<1000);checks++;
    let stops=0;
    const cleanRuntime={...blockedRuntime,stop:async()=>{stops++;}};
    const driver2=new ManualAgentDriver('test');driver2.script({type:'write-file',path:'src/main.ts',content:'export {};'});
    const timed=await new TrialRunner(cleanRuntime).runAgent({...options,runtime:cleanRuntime},driver2);
    assert.equal(timed.agentResult,'TIMEOUT');assert.ok(stops>=1);checks++;
    // Syntax-check catalog using the actual bundler; ts-jest transpile-only must not hide errors.
    load('tools/benchmark/recipes/recipes30.ts');checks++;
    console.log(JSON.stringify({ok:true,checks}));
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
