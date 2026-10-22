from pathlib import Path
import json,hashlib,datetime,subprocess
root=Path.cwd();base=root/'docs/physics/box3d/rebuild';out=base/'material-b1-real-four-lead-review-20261022-a';assert not out.exists();out.mkdir()
h=lambda b:hashlib.sha256(b).hexdigest();rows=[]
cases=[('clone-callback','owner-material-real-release-20261022-clone-callback-b1-a'),('collider-listener-failure','owner-material-real-release-20261022-collider-listener-failure-b1-a'),('default-listener-failure','owner-material-real-release-20261022-default-listener-failure-b1-a'),('default-readback-failure','owner-material-native-release-20261022-readback-b1-a')]
for case,name in cases:
 p=base/name;r=json.loads((p/'receipt.json').read_bytes());n=json.loads((p/'native-and-app.raw.json').read_bytes());cp={x['name']:x['data']for x in n['checkpoints']};f=cp['final-assertions']
 assert r['status']==n['status']==('PASS_LIMITED_MATERIAL_NATIVE_FAILURE'if case=='default-readback-failure'else'PASS_LIMITED_MATERIAL_OWNER')
 assert r['child']['exitCode']==0 and r['inputsUnchanged'] and r['expected']==case
 assert r['nativeReportSha256']==h((p/'native-and-app.raw.json').read_bytes())
 assert r['sourceHashesBefore']==r['sourceHashesAfter']==n['sourceHashesBefore']==n['sourceHashesAfter']
 assert len(r['sourceHashesBefore'])==109
 for path,sha in r['sourceHashesBefore'].items():assert h((p/'inputs'/path).read_bytes())==sha and h((root/path).read_bytes())==sha,path
 assert len(r['artifact']['buildInputHashes'])==50
 for entry in r['artifact']['buildInputHashes']:assert h((root/entry['path']).read_bytes())==entry['sha256']
 assert all(c['pass']for c in f['checks']) and not f['failed'] and f['failure']is None
 close=cp['actual-close'];assert close['close']['status']=='released';owned=close['observations']['beforeBindingDispose'];assert owned['coreBytes']=='0'and all(v in ['0',0]for v in owned['bridge'].values());assert n['loaderAfter']['status']=='DISPOSED' and n['observationErrors']==[]
 later=cp['material-case-verdict-before-close']['native']['nativeStepIndex']
 if case=='clone-callback':
  a=cp['clone-callback-outcome'];assert a['cloneFriction']==a['originalFriction']==0.3 and abs(a['native']['friction']-0.3)<1e-6 and a['world']['state']=='ready' and later==1
  assert a['events']and all(v['result']['threw']and v['result']['code']=='AIR_E_BOX3D_REENTRANT'and v['previous']==v['after']==0.3 for v in a['events'])
  facts={'cloneFriction':a['cloneFriction'],'originalFriction':a['originalFriction'],'nativeFriction':a['native']['friction'],'callbackWriteRejectedBeforeCache':True}
 elif case.endswith('listener-failure'):
  a=cp['native-return-then-listener-failure'];assert a['injectedListenerEntries']==1 and a['exactOriginalError']and a['world']['state']=='faulted'and later==0 and abs(a['native']['friction']-0.8)<1e-6
  diag=a['world']['commandOwner']['lastMaterialChange'];assert diag['failed']and diag['actualRead']=='copied'
  if case=='collider-listener-failure':assert a['colliderStillOriginal']and not a['colliderIsCandidate']and diag['actualMatchesBefore']and not diag['actualMatchesCandidate']
  else:assert not a['systemStillOld']and a['systemIsCandidate']and not diag['actualMatchesBefore']and diag['actualMatchesCandidate']
  facts={key:a[key]for key in ['colliderStillOriginal','colliderIsCandidate','systemStillOld','systemIsCandidate']};facts.update({'nativeFriction':a['native']['friction'],'ownerMaterialDiagnostic':diag,'faultedAfterRealNativeWrite':True})
 else:
  a=cp['native-readback-failure-outcome'];assert a['injection']=={'armed':True,'nativeSetCalls':1,'injected':1,'readReturnedAfterWrite':True};assert a['world']['state']=='faulted'and later==0 and a['systemStillOld']and not a['systemIsCandidate']and abs(a['native']['friction']-0.8)<1e-6
  diag=a['world']['commandOwner']['lastMaterialChange'];assert diag['actualRead']=='not-requested'and diag['actualMatchesBefore']is None and diag['actualMatchesCandidate']is None and diag['effects']==['delegate-entered']
  injected=[v for v in n['calls']if v.get('explicitInjectedThrowAfterRealReturn')];assert len(injected)==1 and injected[0]['returned']is True
  facts={'postArmRealNativeSetters':1,'explicitInjectedReadbackFailures':1,'nativeFriction':a['native']['friction'],'actualSystemCacheStillOld':True,'ownerMaterialDiagnostic':diag,'nativeRollbackSetterReplayed':False}
 assert a['world']['commandOwner']['activeTemporaryScopes']==0 and a['world']['commandOwner']['unresolvedMaterialScopes']==0
 rows.append({'case':case,'receipt':str((p/'receipt.json').relative_to(root)),'receiptSha256':h((p/'receipt.json').read_bytes()),'raw':str((p/'native-and-app.raw.json').relative_to(root)),'rawSha256':h((p/'native-and-app.raw.json').read_bytes()),'status':r['status'],'namedDirectSourceHashesVerified':109,'currentNativeInputHashesVerified':50,'assertions':len(f['checks']),'facts':facts,'realNativeSteps':later,'actualClose':'released','ownedCoreAndBridgeCountersZero':True,'loaderDisposed':True})
# Keep original expectations/injection source bytes unchanged across the fix.
for prefix in ['owner-material-real-wasm','owner-material-native-failure']:
 for suffix in ['.test.ts','-preload.mjs']:
  name='tools/verify/box3d/'+prefix+suffix;assert subprocess.check_output(['git','show','4981678aec8ee64c0eeb31551a6cc551ac42d1c2:'+name])==(root/name).read_bytes(),name
review={'status':'PASS_FOUR_FINITE_CURRENT_RELEASE_WASM_MATERIAL_CASES_CLEANUP_CONTRACT_STILL_OPEN','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':'15fe9fdd5b6ecd602c39cad503143932a10bad4f','remoteSourceCommit':'a8e27bd9c66cf56bae3edc7ecfa270d1dcc06a60','cases':rows,'totalAssertions':sum(r['assertions']for r in rows),'unchangedOriginalFixtureAssertionsAndInjections':True,'limits':['Actual official N4 Release WASM with actual AIR/Scene/Node/Collider/System source in Node/Jest/JSDOM; not browser.','Listener/readback exceptions are explicit JS fixture injections after real native calls, not naturally occurring core failures.','Internal apply failure records actualRead not-requested, never falsely classifies native mutation as unchanged.','Secondary cleanup aggregation and first world fault preservation remain confirmed separate diagnostic defects.','No shared-asset propagation, full material lifecycle, public unified activation or formal Gate acceptance. All 2128 required cells remain NOT_RUN.']}
(out/'receipt.json').write_text(json.dumps(review,indent=2)+'\n');(out/'review.py').write_bytes(Path('/tmp/box3d_review_material_b1_four.py').read_bytes());(out/'run-summary.json').write_bytes(Path('/tmp/box3d-b1-real-four-run-summary.json').read_bytes());print(json.dumps({'status':review['status'],'cases':len(rows),'assertions':review['totalAssertions'],'receiptSha256':h((out/'receipt.json').read_bytes())}))
