const fs=require('fs'),path=require('path');
const A='E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const BAK='E:/qoder-fixwave-2026-09-19/pre-f54-ledger';fs.mkdirSync(BAK,{recursive:true});
const targets=['findings.jsonl','evidence-index.json','global-verdict.json'];const before={};
for(const f of targets){before[f]=fs.readFileSync(path.join(A,f),'utf8');fs.writeFileSync(path.join(BAK,f),before[f]);}
const findings=before['findings.jsonl'].trim().split(/\r?\n/).map(l=>JSON.parse(l));
const has=new Set(findings.map(f=>f.findingId));
if(!has.has('F-54')){findings.push({findingId:'F-54',
 requirementId:'mandate step 10 (findings must ship with raw evidence) + commit-as-reproducibility contract',
 gate:'candidateIntegrity',
 category:'evidence trail deliverability: .gitignore:5 "*.log" makes every NEW raw audit log untracked, so a plain git add of the audit dir commits the ledger but silently drops the raw logs it cites',
 blocking:false,status:'OPEN-NEEDS-AUTHORIZATION (config change, not made by the audit agent)',
 location:'.gitignore:5 (*.log); docs/audits/global-quality-audit-2026-09-19/raw/**',
 repro:'git check-ignore -v .../raw/negctl/nc-r7g-asset-content-binding.log -> ".gitignore:5:*.log"; 36 raw .log on disk, 26 tracked (force-added earlier), 10 untracked-and-ignored',
 expected:'either every cited raw artifact ships with the ledger, or the ledger points at files git will not carry',
 actual:'10 of 36 raw logs (all added after the ignore rule was in force, incl. the whole R7g and fix-wave set) would be lost from a normal commit',
 evidence:'R7G-PROVENANCE-AND-GITIGNORE-2026-09-19',
 minimalFix:'one of: git add -f the raw logs at commit time; add !docs/audits/**/*.log to .gitignore; or store raw evidence with a .txt suffix. .gitignore is project config, so the audit agent did not change it',
 retest:'after committing, git ls-files docs/audits | grep -c "\.log$" should equal the on-disk count',
 measuredAt:new Date().toISOString()});}
fs.writeFileSync(path.join(A,'findings.jsonl'),findings.map(f=>JSON.stringify(f)).join('\n')+'\n');
const evIndex=JSON.parse(before['evidence-index.json']);
const ev=evIndex.evidence.find(e=>e.id==='R7G-ASSET-BINDING-2026-09-19');
if(ev){for(const r of ['raw/negctl/r7g-07-final-over-delivered.log','raw/negctl/r7g-08-NC-E8-gate-output.log'])if(!ev.raw.includes(r))ev.raw.push(r);
 ev.findings=Array.from(new Set(ev.findings.concat(['F-54'])));}
if(!evIndex.evidence.some(e=>e.id==='R7G-PROVENANCE-AND-GITIGNORE-2026-09-19')){evIndex.evidence.push({
 id:'R7G-PROVENANCE-AND-GITIGNORE-2026-09-19',findings:['F-52','F-54'],
 raw:['raw/negctl/r7g-07-final-over-delivered.log','raw/negctl/r7g-08-NC-E8-gate-output.log','raw/negctl/nc-r7g-asset-content-binding.log'],
 scratch:'E:/qoder-r7i-2026-09-19/work (NC-E8 pre-capture tamper + genuine re-capture + jest 29 suites / 207 tests)',
 summary:'Pre-capture tamper of a manifested asset is caught two independent ways: the browser run FAILS {material-property,resource-released} and offline S15-ASSET-PROVENANCE fires. Upstream digests cover 25 of 65 delivered asset files (SHA256.json 9 + official/manifest.json 16, disjoint sets so no clash is possible), all agreeing with disk today. Final widened gate over the DELIVERED evidence reproduces 70 fail / 1 warn with provenance contributing zero false alarms. Workspace-search tooling asserted several missing/zero-byte assets (DamagedHelmet.glb, smk11-2704619213, asset-bundles/damp/damp.glb, Assets/Texture/history.png, smoke-12-dmp-loading.test.ts, gltf-catalog .bin sidecars); none exists - direct listing finds no 0-byte file anywhere under examples/. F-54: the raw logs of this audit are git-ignored.'});}
fs.writeFileSync(path.join(A,'evidence-index.json'),JSON.stringify(evIndex,null,2)+'\n');
const verdict=JSON.parse(before['global-verdict.json']);
verdict.gates.candidateIntegrity+=' | F-54: .gitignore "*.log" leaves 10 of 36 raw audit logs untracked-and-ignored, so the trail needs git add -f (or a negation rule) to ship with the ledger.';
verdict.gates.negativeControls+=' | F-51/F-52 add 8 asset-content controls (NC-E1..E8): undeclared sidecar 0-byte and same-size garbage, garbage in a zero-declaration example, bound file removed, unbound file injected, zero-byte on disk and in the record, and a PRE-capture tamper caught by the delivery\'s own upstream digest.';
verdict.evidenceTrail='raw logs are the reproducibility anchor; 26/36 tracked, 10 ignored (F-54) - commit with -f or they will not exist for the next reader';
fs.writeFileSync(path.join(A,'global-verdict.json'),JSON.stringify(verdict,null,2)+'\n');
const after=fs.readFileSync(path.join(A,'findings.jsonl'),'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l));
let mut=0;before['findings.jsonl'].trim().split(/\r?\n/).forEach((l,i)=>{if(JSON.stringify(after[i])!==JSON.stringify(JSON.parse(l))){mut++;console.log('CHANGED-UNEXPECTED at '+i)}});
console.log('findings before='+before['findings.jsonl'].trim().split(/\r?\n/).length+' after='+after.length+' unique='+new Set(after.map(f=>f.findingId)).size+' lostOrMutated='+mut);
const v2=JSON.parse(fs.readFileSync(path.join(A,'global-verdict.json'),'utf8'));
const e2=JSON.parse(fs.readFileSync(path.join(A,'evidence-index.json'),'utf8'));
console.log('blocking='+v2.blockingForRelease.length+' overall='+v2.overall+' evidence entries='+e2.evidence.length+' dangling='+e2.evidence.flatMap(e=>e.raw||[]).filter(r=>!fs.existsSync(path.join(A,r))).length);
