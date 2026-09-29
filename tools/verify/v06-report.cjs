const fs=require('fs');const path=require('path');const esbuild=require('esbuild');const Module=require('module');
const root=path.resolve(__dirname,'../..');
function load(file){const out=esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,write:false,platform:'node',format:'cjs'});const mod=new Module(file,module);mod.paths=module.paths;mod._compile(out.outputFiles[0].text,file);return mod.exports;}
const {RECIPES}=load('tools/benchmark/recipes/recipes30.ts');
const {recipeStats,checkCoverage,validateEvidenceSet,promoteRecipes}=load('tools/benchmark/recipes/schema.ts');
const {aggregate}=load('tools/benchmark/runner/metrics.ts');const {CATALOG_BENCHMARKS}=load('tools/benchmark/catalog/catalog100.ts');const {VALIDATORS}=load('tools/benchmark/validators/index.ts');
const dual=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/v06-golden-dual-track.json'))),catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/v06-catalog-runtime-gate.json'))),metrics=aggregate(dual.rows.map(row=>row.record));
const exampleIds=fs.readdirSync(path.join(root,'examples')).filter(id=>fs.existsSync(path.join(root,'examples',id,'index.html')));
const evidenceFile=path.join(root,'docs/evidence/v06-recipes.json'),evidenceDocument=fs.existsSync(evidenceFile)?JSON.parse(fs.readFileSync(evidenceFile)):null,evidence=evidenceDocument?.runs??[];
const context={benchmarkIds:new Set(CATALOG_BENCHMARKS.map(row=>row.id)),exampleIds:new Set(exampleIds),validatorIds:new Set(Object.keys(VALIDATORS)),exampleHasEntry:new Map(exampleIds.map(id=>[id,true])),evidence,benchmarkDefs:new Map(CATALOG_BENCHMARKS.map(row=>[row.id,{id:row.id,type:row.benchmarkType,category:row.category,validators:[...row.validators,...(row.visualValidators||[])]}]))};
const benchmarkEvidence=require('./benchmark-evidence.cjs'),sourceHash=benchmarkEvidence.sourceHash(root),{SCENARIOS}=require('../benchmark/recipes/scenarios.cjs'),evidenceTools=require('../benchmark/recipes/evidence.cjs');
const scenarioHashes=new Map(RECIPES.map(recipe=>[recipe.id,SCENARIOS[recipe.id]?evidenceTools.scenarioHash(root,recipe,SCENARIOS[recipe.id]):'missing']));
function artifactExists(relative,hash,bytes){const absolute=path.resolve(root,relative),allowed=path.join(root,'docs','evidence','recipes')+path.sep;if(!absolute.startsWith(allowed)||!fs.existsSync(absolute)||fs.statSync(absolute).size!==bytes)return false;return evidenceTools.artifactHash(absolute)===hash;}
const evidenceFailures=validateEvidenceSet(RECIPES,evidence,{sourceHash,scenarioHashes,artifactExists});if(evidence.length!==RECIPES.length)evidenceFailures.push(`Recipe evidence count ${evidence.length} != ${RECIPES.length}`);
// A recorded revision must name a commit this repository can reach, otherwise the
// evidence cannot be attributed (a copy with a synthetic HEAD must not be accepted).
const v06Meta=benchmarkEvidence.metadata(root);
const recordedRevisions=new Map();
for(const entry of [['Golden dual-track',dual.source?.baseRevision],['Catalog runtime',catalog.source?.baseRevision],['Recipe batch',evidenceDocument?.baseRevision],...evidence.map(r=>[`Recipe ${r.recipeId}`,r.revision])]){
    const key=entry[1]??'(missing)';if(!recordedRevisions.has(key))recordedRevisions.set(key,[]);recordedRevisions.get(key).push(entry[0]);
}
const revisionFailures=[...recordedRevisions.entries()].filter(([rev])=>!benchmarkEvidence.revisionInHistory(root,rev==='(missing)'?null:rev)).map(([rev,labels])=>`${labels.join('、')} evidence revision ${rev} is not a commit reachable from HEAD ${v06Meta.baseRevision??'(no git repo)'}`);
const effectiveRecipes=promoteRecipes(RECIPES,context),coverageFailures=checkCoverage(effectiveRecipes,context),recipes=recipeStats(effectiveRecipes);
const refPass=dual.rows.length===10&&dual.rows.every(row=>['PASS','EXPECTED_UNSUPPORTED','EXPECTED_FALLBACK'].includes(row.reference.engineResult));
const catalogPass=catalog.total===100&&catalog.pass===100,recipesPass=evidenceFailures.length===0&&coverageFailures.length===0&&recipes.catalogTotal>=30&&recipes.validatedCount>=30&&recipes.stableCount>=20;
const testsPath=path.join(root,'output/v06-review-jest.json'),tests=fs.existsSync(testsPath)?JSON.parse(fs.readFileSync(testsPath)):null,blockers=[];
if(dual.source?.sourceHash!==sourceHash||catalog.source?.sourceHash!==sourceHash)blockers.push('运行证据与当前源码哈希不一致，需要重跑。');
if(!refPass)blockers.push('Golden Reference 有失败；必须修复并重跑。');if(!catalogPass)blockers.push('100 项 Runtime Gate 未全过；逐项结果见 catalog evidence。');
if(!recipesPass)blockers.push(`Recipe 完整场景证据未通过：${[...evidenceFailures,...coverageFailures].slice(0,8).join('；')}`);
if(revisionFailures.length)blockers.push(`证据 revision 无法归因到本仓库历史：${revisionFailures.slice(0,4).join('；')}`);
if(metrics.eligibleTypeBTrials===0||metrics.firstCompileSuccessRate<.6||metrics.agentFinalSuccessRate<.8||metrics.medianRepairSuccessful>3)blockers.push('Agent 指标未达阈值。');if(!tests?.success)blockers.push('本轮 Jest 结果尚未通过或缺失。');
const report={measuredAt:new Date().toISOString(),status:blockers.length?'BLOCKED':'PASS',referenceGatePass:refPass,catalogGatePass:catalogPass,revision:{head:v06Meta.baseRevision,recorded:[...recordedRevisions.keys()],failures:revisionFailures},metrics,recipes,evidenceFailures,coverageFailures,tests:tests?{suites:tests.numTotalTestSuites,tests:tests.numTotalTests,passed:tests.numPassedTests,success:tests.success}:null,blockers};
fs.writeFileSync(path.join(root,'docs/evidence/v06-review-gate.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# V0.6 Final Gate（自动生成）','',`状态：**${report.status}**。生成时间：${report.measuredAt}。`,'','本文件由 `node tools/verify/v06-report.cjs` 从本轮证据生成，禁止手工填写全绿结论。','',`- Golden Reference：${refPass?'通过':'未通过'}。`,`- Catalog Runtime：${catalog.pass}/${catalog.total}，分布 ${JSON.stringify(catalog.counts)}。`,`- Agent：${metrics.agentPass}/${metrics.eligibleTrials}；First Compile：${metrics.firstCompileSuccessRate}，Type-B 分母 ${metrics.eligibleTypeBTrials}；成功 repair 中位数 ${metrics.medianRepairSuccessful}。`,`- Recipe：总数 ${recipes.catalogTotal}，validated（含 stable）${recipes.validatedCount}，stable ${recipes.stableCount}；evidence failures ${evidenceFailures.length}。`,`- Jest：${report.tests?`${report.tests.suites} suites / ${report.tests.passed} of ${report.tests.tests} tests；success=${report.tests.success}`:'未记录'}。`,`- 证据 revision：HEAD ${report.revision.head??'（无 git）'}，记录值 ${report.revision.recorded.join(' / ')}，无法归因 ${report.revision.failures.length} 项。`,'','## 待完成门禁','',...blockers.map(value=>'- '+value),'','## 证据与复现','','- `docs/evidence/v06-recipes.json`：30 条 composite browser run。','- `docs/evidence/recipes/`：逐 Recipe 截图与状态快照。','- `node tools/benchmark/recipes/run-recipes-browser.cjs`：重跑 Recipe。','- `node tools/verify/v06-report.cjs`：严格校验证据并生成本报告。',''];
const reportDir=path.join(root,'build/reports');fs.mkdirSync(reportDir,{recursive:true});fs.writeFileSync(path.join(reportDir,'v06-final-gate.md'),lines.join('\n'));console.log(JSON.stringify(report,null,2));process.exitCode=blockers.length?1:0;
