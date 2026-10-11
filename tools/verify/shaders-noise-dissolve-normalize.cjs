'use strict';
const fs=require('node:fs'),path=require('node:path');
const {sha256,canonical}=require('./shaders-effect-contract.cjs');
const {validateReport}=require('./shaders-noise-dissolve.cjs');
const ROOT=path.resolve(__dirname,'../..');
function identity(file){const b=fs.readFileSync(path.resolve(ROOT,file));return {path:file.replace(/\\/g,'/'),bytes:b.length,sha256:sha256(b)};}
function normalize(raw,diagnostic){
 const checked=validateReport(raw);if(!checked.ok)throw new Error('Raw report is not schema/oracle-valid');
 const result=JSON.parse(JSON.stringify(raw)),wk=result.engines.find(e=>e.engine==='webkit');
 const row=wk?.report.gates.Runtime.cases.find(c=>c.caseId==='resize');
 if(row?.status!=='FAIL'||row.classification!=='ENGINE_BUG'||wk.report.gates.Runtime.cases.some(c=>c.caseId!=='resize'&&c.status!=='PASS'))throw new Error('Only the explicitly observed WebKit resize classification may be corrected');
 const control=diagnostic.rows?.find(e=>e.engine==='webkit'),before=control?.stages.find(s=>s.id==='before'),resized=control?.stages.find(s=>s.id==='resized-step'),green=control?.stages.find(s=>s.id==='resized-body-color');
 if(diagnostic.method!=='REAL_BROWSER_NATIVE_BUILTIN_CONTROL'||canonical(before?.raw?.rgba)!==canonical(before?.sameCoordinatePNG)||canonical(resized?.raw?.rgba)!==canonical(resized?.canvasExportCenter)||canonical(resized?.raw?.rgba)===canonical(resized?.sameCoordinatePNG)||canonical(green?.raw?.rgba)!==canonical(resized?.raw?.rgba)||canonical(green?.sameCoordinatePNG)!==canonical([0,255,0,255])||green?.css?.rect?.y!==0||green.css.display!=='block'||green.css.opacity!=='1')throw new Error('Independent native builtin compositor/body-color control is not established');
 const correction={from:'ENGINE_BUG/FAIL',to:'INFRA_FAILURE/BLOCKED',reason:'WebKit headless same-page resize: native builtin control retains matching red GPU readback and canvas export while compositor PNG reveals body color. No engine fault line has been established; current presentation environment blocks acceptance. Canvas export/fresh pages do not compensate the required compositor PNG.',controlStages:['before','resized-step','resized-native','resized-rebuilt','resized-body-color','resized-layer-transform'],excludedStage:'resized-canvas-reinsert (changed canvas rect.y, not a valid repair experiment)'};
 row.status='BLOCKED';row.classification='INFRA_FAILURE';row.reason=correction.reason;wk.report.gates.Runtime.status='BLOCKED';wk.report.status='BLOCKED';wk.report.completed=false;wk.report.subset=true;
 wk.report.issues=wk.report.issues.filter(i=>!(i.gate==='Runtime'&&i.caseId==='resize'));wk.report.issues.push({classification:'INFRA_FAILURE',reason:correction.reason,gate:'Runtime',caseId:'resize'});
 result.normalization={schemaVersion:'e01-classification-correction/1',browserRunsAdded:0,rawCollectorExitCode:1,classificationCorrection:correction};result.validation=validateReport(result);if(!result.validation.ok)throw new Error(JSON.stringify(result.validation.errors));return result;
}
function main(argv=process.argv.slice(2)){
 const arg=name=>argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);const report=arg('report'),diagnostic=arg('diagnostic'),out=arg('out');if(!report||!diagnostic||!out)throw new Error('Use --report=<raw.json> --diagnostic=<Lead-control.json> --out=<new.json>');
 const result=normalize(JSON.parse(fs.readFileSync(path.resolve(ROOT,report),'utf8')),JSON.parse(fs.readFileSync(path.resolve(ROOT,diagnostic),'utf8')));result.normalization.rawReport=identity(report);result.normalization.leadControl=identity(diagnostic);result.normalization.tool=identity('tools/verify/shaders-noise-dissolve-normalize.cjs');result.normalization.execution={command:process.argv.join(' '),cwd:ROOT,endedAt:new Date().toISOString(),exitCode:0};const target=path.resolve(ROOT,out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:result.validation.ok,scopePassed:result.validation.scopePassed,statuses:result.engines.map(e=>({engine:e.engine,status:e.report.status})),browserRunsAdded:0}));return 0;
}
module.exports={normalize,main};if(require.main===module)try{process.exitCode=main();}catch(e){console.error(e.stack);process.exitCode=1;}
