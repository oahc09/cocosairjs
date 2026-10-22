from pathlib import Path
import json,hashlib,datetime,shutil
root=Path.cwd();out=root/'docs/physics/box3d/rebuild/material-cleanup-real-seven-lead-review-20261022-a';out.mkdir(exist_ok=False);h=lambda b:hashlib.sha256(b).hexdigest();source=root.parent/'box3d-material-cleanup-seven-run-20261022-a';run=json.loads((source/'run-summary.json').read_text());rows=[]
assert len(run['rows'])==7
for entry in run['rows']:
 p=Path(entry['receipt']).parent;r=json.loads((p/'receipt.json').read_bytes());n=json.loads((p/'native-and-app.raw.json').read_bytes());cp={x['name']:x['data'] for x in n['checkpoints']};f=cp['final-assertions'];case=entry['case']
 assert r['inputsUnchanged'] and r['sourceHashesBefore']==r['sourceHashesAfter']==n['sourceHashesBefore']==n['sourceHashesAfter'];assert len(r['sourceHashesBefore'])==109
 for path,sha in r['sourceHashesBefore'].items():assert h((p/'inputs'/path).read_bytes())==sha and h((root/path).read_bytes())==sha,path
 assert len(r['artifact']['buildInputHashes'])==50
 for item in r['artifact']['buildInputHashes']:assert h((root/item['path']).read_bytes())==item['sha256']
 assert r['nativeReportSha256']==h((p/'native-and-app.raw.json').read_bytes())
 failed=[v['id'] for v in f['checks'] if not v['pass']];close=cp['actual-close']['close'];owned=n['beforeBindingDispose'];assert owned['coreBytes']=='0' and all(v in ['0',0] for v in owned['bridge'].values());assert n['loaderAfter']['status']=='DISPOSED' and not n['observationErrors']
 if case=='collider-cleanup':
  assert entry['exitCode']==r['child']['exitCode']==1 and r['status']==n['status']=='FAIL' and failed==['app close released'];assert close['status']=='failed' and close['physicsPreparation']['status']=='closed';assert all(x['cleanup']=='released'for x in close['physicsPreparation']['acquired']);assert any('Shape component is not live' in x['message'] for x in close['failures']);qualification='NOT_QUALIFIED_MANUAL_PROTECTED_CALLBACK_PLUS_LATER_ENGINE_DESTROY';note='Nine pre-close first-error/secondary cleanup checks passed; app close correctly failed because direct protected callback had already released the adapter while the live component remained scheduler-owned. Original failed assertion is retained. This is not normal lifecycle qualification. A distinct App.close-driven fixture is required.'
 else:
  assert entry['exitCode']==r['child']['exitCode']==0 and r['status']==n['status'] and n['status'].startswith('PASS_LIMITED_') and not failed and not f['failed'] and f['failure']is None and close['status']=='released';qualification=n['status'];note='Finite current native+AIR source case only.'
 if case in ['observer-lease-cleanup','public-default-cleanup','collider-cleanup']:
  a=cp['explicit-cleanup-failure-outcome'];assert a['world']['failure']=={'hasFailure':True,'error':0}and a['world']['state']=='faulted'and a['native']['nativeStepIndex']==0
  errors=a['world']['commandOwner']['cleanup']['cleanupFailures'];assert len(errors)==(2 if case=='public-default-cleanup' else 3)
  assert any(v.get('error')=='scope-mutation-secondary' for v in errors) if case!='collider-cleanup' else any(v.get('error')=='adapter-cleanup-secondary' for v in errors)
 rows.append({'case':case,'receipt':str(p/'receipt.json'),'receiptSha256':h((p/'receipt.json').read_bytes()),'raw':str(p/'native-and-app.raw.json'),'rawSha256':h((p/'native-and-app.raw.json').read_bytes()),'status':qualification,'assertions':len(f['checks']),'failedAssertions':failed,'namedSourcesVerified':109,'nativeInputsVerified':50,'actualCloseStatus':close['status'],'ownedCoreAndBridgeZero':True,'note':note})
for p in source.iterdir():
 if p.is_file():shutil.copy2(p,out/p.name)
shutil.copy2('/tmp/box3d_run_material_cleanup_seven.py',out/'runner.py');shutil.copy2(__file__,out/'review.py')
receipt={'status':'SIX_FINITE_PASS_ONE_MANUAL_CALLBACK_LIFECYCLE_FIXTURE_NOT_QUALIFIED','sourceCommit':'4e1cb31336dee13c549d8ec94ab71e64072e93e2','remoteSourceCommit':'26de4376f67344ffb2d58e89c2c46b5d466f3247','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':rows,'passedCases':6,'unqualifiedCases':1,'totalAssertions':sum(x['assertions']for x in rows),'failedAssertions':1,'limits':['Explicit injected JS/cleanup errors following real native operations; not naturally occurring core failures.','Actual Node/Jest/JSDOM with official N4 Release WASM, not browser.','No full material/shared-asset lifecycle or formal Gate upgrade. All2128 required cells NOT_RUN.']};(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'totalAssertions':receipt['totalAssertions'],'receiptSha256':h((out/'receipt.json').read_bytes())}))
