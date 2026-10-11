'use strict';
const fs=require('node:fs'),path=require('node:path');
const {sha256,canonical}=require('./shaders-effect-contract.cjs');
const runner=require('./shaders-noise-dissolve.cjs');
const ROOT=path.resolve(__dirname,'../..');
function verifyUnsafe(raw,engine,gate,caseIds){
 const baseline=runner.validateReport(raw),errors=[...baseline.errors];
 const report=raw?.engines?.find(e=>e.engine===engine)?.report,record=report?.gates?.[gate];
 if(!record||!Array.isArray(caseIds)||!caseIds.length||new Set(caseIds).size!==caseIds.length)errors.push('Explicit nonempty unique scoped case IDs required');
 const selected=caseIds.map(id=>record?.cases?.find(c=>c.caseId===id));
 for(const row of selected){if(!row||row.status!=='PASS')errors.push('Scoped validation cannot promote failed/skipped capture');else errors.push(...runner.oracles()[gate.toLowerCase()](row).errors);}
 if(gate==='Performance'&&report){try{const linked=report.gates.Performance.cases[0].execution.rawOutputs[0],bytes=fs.readFileSync(path.resolve(ROOT,linked.path));if(bytes.length!==linked.bytes||sha256(bytes)!==linked.sha256)errors.push('Performance capture SHA drift');const capture=JSON.parse(bytes).collected.performance,plans={'720p':{width:1280,height:720,dpr:1},'1080p':{width:1920,height:1080,dpr:1},'mobile-dpr':{width:390,height:844,dpr:2}};for(const row of selected){const p=plans[row.caseId],measured=capture.find(c=>c.profile===row.caseId),snapshot=measured?.run.snapshot;if(!p||snapshot?.dpr!==p.dpr||snapshot.rect.width!==p.width||snapshot.rect.height!==p.height||snapshot.backing.width!==p.width*p.dpr||snapshot.backing.height!==p.height*p.dpr)errors.push('Performance actual CSS/DPR/backing profile mismatch');if(canonical(row.observation.inventory)!==canonical(snapshot?.inventory)||canonical(row.observation.cpuUpdateMs)!==canonical(measured?.run.samples.cpuUpdateMs)||canonical(row.observation.cpuSubmissionMs)!==canonical(measured?.run.samples.cpuDrawDispatchMs)||canonical(row.observation.queueBookkeepingMs)!==canonical(measured?.run.samples.cpuSubmissionMs)||canonical(row.observation.gpuTimestamp)!==canonical(measured?.timestamp))errors.push('Performance real trace lineage mismatch');}}catch(error){errors.push('Performance trace invalid: '+error.message);}}
 if(gate==='Runtime'&&report){try{const linked=report.gates.Runtime.cases.find(c=>c.caseId==='create').execution.rawOutputs[0],bytes=fs.readFileSync(path.resolve(ROOT,linked.path));if(bytes.length!==linked.bytes||sha256(bytes)!==linked.sha256)errors.push('Runtime capture SHA drift');const captured=JSON.parse(bytes).collected,normal=captured.normal,types=normal.events.map(e=>e.type);if(canonical(types)!==canonical(['pause','pause','input','reset','destroy','recreate'])||normal.events.some(e=>e.isTrusted!==true)||normal.canvasCount!==1||normal.closed||!normal.instance)errors.push('Trusted ordinary UI event chain/active native instance missing');}catch(error){errors.push('Runtime ordinary capture invalid: '+error.message);}}
 return {schemaVersion:'e01-scoped-capture-validation/1',purpose:'VALIDATION_OF_REAL_BROWSER_CAPTURE',engine,gate,caseIds,measuredCases:selected.length,browserRunsAdded:0,pass:errors.length===0,errors};
}
function verify(raw,engine,gate,caseIds){try{return verifyUnsafe(raw,engine,gate,caseIds);}catch(error){return {schemaVersion:'e01-scoped-capture-validation/1',purpose:'VALIDATION_OF_REAL_BROWSER_CAPTURE',engine,gate,caseIds,pass:false,errors:['Invalid scoped capture: '+error.message],browserRunsAdded:0};}}
function identity(file){const bytes=fs.readFileSync(path.resolve(ROOT,file));return {path:file.replace(/\\/g,'/'),bytes:bytes.length,sha256:sha256(bytes)};}
function main(argv=process.argv.slice(2)){
 const a=name=>argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3),file=a('report'),engine=a('engine'),gate=a('gate'),ids=a('case-ids'),out=a('out');
 if(!file||!engine||!gate||!ids||!out)throw new Error('Use --report --engine --gate --case-ids --out');
 const startedAt=new Date().toISOString(),result=verify(JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8')),engine,gate,ids.split(','));
 result.capture=identity(file);result.verifier=identity('tools/verify/shaders-noise-dissolve-scoped-gate.cjs');result.execution={command:process.argv.map(v=>v.includes(' ')?'"'+v+'"':v).join(' '),argv:[process.execPath,path.resolve(__filename),...argv],cwd:ROOT,startedAt,endedAt:new Date().toISOString(),exitCode:result.pass?0:1};
 const target=path.resolve(ROOT,out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));return result.execution.exitCode;
}
module.exports={verify,identity,main};if(require.main===module)try{process.exitCode=main();}catch(e){console.error(e.stack);process.exitCode=1;}
