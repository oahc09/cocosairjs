from pathlib import Path
import json,hashlib,shutil,datetime
r=Path('.');out=r/'docs/physics/box3d/rebuild/system-pause-real-lead-review-20261022-a';out.mkdir(exist_ok=False)
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
base='docs/physics/box3d/rebuild/';cases=['owner-system-pause-release-20261022-a','owner-material-native-release-20261022-readback-pause-c','owner-material-cleanup-release-20261022-observer-lease-pause-c'];rows=[]
for name in cases:
 p=Path(base+name);receipt=json.loads((p/'receipt.json').read_text());raw=json.loads((p/'native-and-app.raw.json').read_text());checks=[]
 for checkpoint in raw['checkpoints']:
  if isinstance(checkpoint.get('data'),dict)and isinstance(checkpoint['data'].get('checks'),list):checks=checkpoint['data']['checks']
 assert receipt['child']['exitCode']==0 and receipt['inputsUnchanged'] and receipt['status'].startswith('PASS_')
 assert checks and all(x.get('pass')for x in checks)
 for path,sha in receipt['sourceHashesAfter'].items():assert h(path)==sha,path
 rows.append({'name':name,'status':receipt['status'],'checks':len(checks),'receipt':str(p/'receipt.json'),'receiptSha256':h(p/'receipt.json'),'raw':str(p/'native-and-app.raw.json'),'rawSha256':h(p/'native-and-app.raw.json'),'sourceInputs':len(receipt['sourceHashesBefore']),'nativeInputs':len(receipt['artifact']['buildInputHashes']),'sourceStableAtCollectionAndLeadReview':True,'nativeBeforeDispose':raw['beforeBindingDispose']})
outer=Path('../box3d-pause-owner-integration-20261022')
shutil.copytree(outer/'material-regressions',out/'outer-material-regressions')
for n in ['real-wasm-a.stdout.txt','real-wasm-a.stderr.txt','real-wasm-a.exit-code.txt']:shutil.copyfile(outer/n,out/n)
portable=r/'tools/verify/box3d/system-pause-source-20261022-a/portable-green-c';shutil.copytree(outer/'portable-green-c',portable)
raw=json.loads((portable/'raw.json').read_text());rows0=raw['rows'];assert len(rows0)==18 and all(x['status']=='PASS_SOURCE_WITH_MOCK_BINDING'for x in rows0)
loaded=raw['loadedSources']
for item in loaded:assert h(item['path'])==item['sha256'],item['path']
sourcepaths=['src/air/physics/box3d/'+n+'.ts'for n in ['world-command-owner','world','command-queue','command-producers']]+['src/cocos/physics/framework/'+n+'.ts'for n in ['physics-system','physics-system-control']]
sources={p:h(p)for p in sourcepaths};info={'status':'PASS_FINITE_CURRENT_RELEASE_SYSTEM_PAUSE_AND_TWO_MATERIAL_REGRESSIONS','createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productHashes':sources,'realCases':rows,'portableSourceRegression':{'cases':len(rows0),'checks':sum(len(x['checks'])for x in rows0),'loadedSources':len(loaded),'allLoadedHashesCurrent':True,'raw':str(portable/'raw.json'),'rawSha256':h(portable/'raw.json')},'independentFailureReview':{'receipt':'tools/verify/box3d/immediate-pause-owner-review-20261022-c/receipt.json','sha256':h('tools/verify/box3d/immediate-pause-owner-review-20261022-c/receipt.json'),'scope':'Five actual-source/mock cases, 43 checks; two original RED attempts retained; sustained injected cleanup failures remain cleanup-failed, not native leaks.'},'formalRequiredCells':{'count':2128,'status':'NOT_RUN'},'browser':'NOT_RUN_INFRA_BLOCKED','producers':'NOT_INTEGRATED','stagedCommandsSupported':False,'unifiedTransactionsSupported':False,'qualification':'Finite actual AIR/System/World real N4 WASM in Node/JSDOM only; no formal Gate, browser, public targets or complete material/app lifecycle claim.'}
(out/'receipt.json').write_text(json.dumps(info,indent=2)+'\n')
# Preserve the full no-output compiler and formatting receipts, including the first fixture-only tsc failure.
for name in ['real-fixture-setup-a','real-fixture-setup-b']:
 dest=Path('tools/verify/box3d/system-pause-source-20261022-a/lead-final-controls')/name;shutil.copytree(outer/name,dest)
print(json.dumps({'realCases':[(x['name'],x['checks'])for x in rows],'portableCases':len(rows0),'portableChecks':info['portableSourceRegression']['checks'],'loadedSources':len(loaded),'receiptSha256':h(out/'receipt.json')}))
