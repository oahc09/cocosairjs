from pathlib import Path
import shutil,json,hashlib,subprocess,datetime
r=Path('.'); h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest(); target=r/'docs/physics/box3d/rebuild/private-material-checkpoint37-intake-20261022';target.mkdir(exist_ok=False)
sets=[('../box3d-private-material-integration-20261022',target/'integration'),('../box3d-private-subscription-sites-20261022',r/'tools/verify/box3d/private-subscription-sites-source-20261022-a'),('../box3d-checkpoint36-finalization-20261022',target/'checkpoint36-finalization'),('../box3d-remote-stage36-transfer',target/'checkpoint36-transfer'),('../box3d-native-cache-reclaim-plan-f-20261022',target/'native-cache-audit-f'),('../box3d-duplicate-download-reclaim-plan-g-20261022',target/'duplicate-download-reclaim-g')]; rows=[]
for original,destination in sets:
 source=Path(original);assert source.is_dir();shutil.copytree(source,destination)
 for p in sorted(source.rglob('*')):
  if p.is_file():
   assert not p.is_symlink(); q=destination/p.relative_to(source);assert h(p)==h(q);rows.append({'source':str(p),'retained':q.as_posix(),'bytes':q.stat().st_size,'sha256':h(q)})
(target/'intake-manifest.json').write_text(json.dumps({'status':'EXACT_COMPLETED_INPUTS_AND_RAW_COPIED','timeUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':rows},indent=2)+'\n')
proof=[]
for p in sorted(r.glob('docs/physics/box3d/rebuild/owner-shared-material-private-release-20261022-*-b/receipt.json')):
 d=json.loads(p.read_text());n=p.parent/'native-and-app.raw.json';raw=json.loads(n.read_text());assert h(n)==d['nativeReportSha256']; assert d['status']==raw['status']=='PASS_LIMITED_SHARED_MATERIAL'and d['child']['exitCode']==0
 assert d['sourceHashesBefore']==d['sourceHashesAfter']==raw['sourceHashesBefore']==raw['sourceHashesAfter']
 for name,sha in d['sourceHashesBefore'].items(): assert h(name)==sha
 for row in d['artifact']['buildInputHashes']:assert h(row['path'])==row['sha256']
 final=[c for c in raw['checkpoints']if c['name']=='source-contract-final-verdict'];assert len(final)==1;checks=final[0]['data']['checks'];assert len(checks)==5 and all(c['pass']is True for c in checks)
 test='tools/verify/box3d/owner-shared-material-real-wasm.test.ts';assert Path(test).read_bytes()==subprocess.check_output(['git','show','HEAD:'+test])
 proof.append({'case':d['expected'],'receipt':str(p),'receiptSha256':h(p),'nativeRaw':str(n),'nativeRawSha256':h(n),'checks':[{k:v for k,v in c.items()if k in ['id','pass']}for c in checks],'nativeInputCount':len(d['artifact']['buildInputHashes']),'namedDirectInputCount':len(d['sourceHashesBefore']),'originalAssertionsUnchangedFromCheckpoint36':True,'close':final[0]['data']['close']})
(target/'four-real-cases-review.json').write_text(json.dumps({'status':'PASS_FOUR_FINITE_CURRENT_SOURCE_REAL_N4_WASM_CASES','timeUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':proof,'scope':'Actual AIR/System/World with real N4 WASM in Node/JSDOM. No native failure injection. Not browser, all-owner completeness, producer integration, full physical matrix or Gate. Original source RED records remain unchanged.','formalRequiredCells':2128,'formalNotRun':2128,'gateStatus':'NONE_PASSED'},indent=2)+'\n')
print(json.dumps({'intakeFiles':len(rows),'bytes':sum(x['bytes']for x in rows),'realCases':len(proof),'target':str(target)}))
