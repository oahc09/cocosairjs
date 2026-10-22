from pathlib import Path
import json,hashlib,datetime
r=Path('.');base=r.resolve().parent;h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
ext={
'c2d21a042ccd7779a9b4938491555750a00730a50e59098fca7ca4bea237dcde':base/'box3d-system-pause-qualified-checkpoint-20261022/Box3D-source-incremental-checkpoint.zip',
'abfda6d34d065b19e6659a0ac33ca012430a2b55c03f2d71d82627f9e1642642':base/'box3d-system-pause-qualified-checkpoint-20261022/box3d-rebuild-incremental.bundle',
'1bbfc26781fdf5099d3780fc03a0225299f4feec83aaf04d63d4ef41387e456c':base/'box3d-material-cleanup-qualified-library-roundtrip-20261022/checkpoint-receipt.json',
}
art=r/'tools/physics/box3d/output/command-wasm-release-20261022-n4'
for p in art.glob('*.mjs'):
 if h(p)=='003c79702bf41fa33f197f4786c8469a5234ee122235173970046d7dfbd7c72f':ext[h(p)]=p
for p in art.glob('*.wasm'):
 if h(p)=='4b9494dc2d3c46b4cbacf8d12a8119df5e91a27e19f90b946d50f6467b7adf8f':ext[h(p)]=p
assert len(ext)==5
for name in ['tools/verify/box3d/material-value-entry-source-20261022-a/evidence/typecheck-a/result.json','tools/verify/box3d/material-value-entry-source-20261022-a/evidence/typecheck-b/result.json','tools/verify/box3d/material-value-entry-source-20261022-b/evidence/typecheck-a/result.json']:
 d=json.loads(Path(name).read_text())
 for row in [d['compiler'],*d['inputs']]:
  if '/node_modules/typescript/'in row['path']:
   p=Path(row['path']);assert h(p)==row['sha256'];ext[row['sha256']]=p
external=[]
for sha,p in ext.items():assert h(p)==sha;external.append({'path':str(p),'bytes':p.stat().st_size,'sha256':sha,'kind':('EXTERNAL_INSTALLED_PINNED_TYPESCRIPT_TOOLCHAIN_NOT_VENDORED'if '/node_modules/typescript/'in str(p)else'PREVIOUSLY_LIBRARY_PRESERVED_EXTERNAL_ARTIFACT_NOT_EMBEDDED_SOURCE_RAW')})
u=json.load(open('/tmp/box3d-evidence-checkpoint36-unresolved.json'));plan=json.loads(Path('docs/physics/box3d/rebuild/transfer-cleanup-e-20261022/plan.json').read_text());ex=[]
for row in u:
 if row['manifest'].endswith('transfer-cleanup-e-20261022/plan.json'):
  tok=row['pointer'].split('/');assert len(tok)==4 and tok[1]=='files'and tok[3]=='sha256';v=plan['files'][int(tok[2])];assert v['sha256']==row['sha256']and v['kind']=='REGENERABLE_GIT_TRANSFER_PAYLOAD_ONLY';ex.append({**row,'classification':'EXACT_APPROVED_REGENERABLE_TRANSPORT_CACHE_REMOVED_SOURCE_GIT_AND_EXTERNAL_RESTORE_PRESERVED'})
 else:assert row['sha256']in ext,(row,'unclassified');ex.append({**row,'classification':('EXTERNAL_INSTALLED_PINNED_TYPESCRIPT_TOOLCHAIN'if '/node_modules/typescript/'in str(ext[row['sha256']])else'EXTERNAL_LIBRARY_ARTIFACT_OR_PRIOR_MANIFEST')})
p=Path('docs/physics/box3d/rebuild/shared-material-checkpoint36-intake-20261022/reference-boundaries.json');p.write_text(json.dumps({'status':'ALL_NEW_REFERENCE_IDENTITIES_CLASSIFIED','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'localRetainedReferences':'Verified in checkpoint36 gzip delivery manifest; inherited old references preserved.','externalRehashed':external,'nonEmbeddedReferences':ex,'regenerableTransportCount':429,'rawEvidenceExceptions':'NONE','formalGateChange':False},indent=2)+'\n')
Path('docs/physics/box3d/rebuild/shared-material-checkpoint36-scope-20261022.md').write_text('''# Shared-material checkpoint 36 scope\n\nThis checkpoint changes only the product World prepared-material kernel. All native membership/current-material reads finish before any native setter. Exact setter entry, normal return, readback and cache commit remain separate; unknown/partial effects fault without rollback or replay.\n\nThree current N4 Release Node/JSDOM real-WASM finite runs passed: two-shape preflight refusal with zero setters then two-shape success; post-setter readback failure; actual System pause lifecycle. These are not browser evidence or full physical qualification.\n\nFour exact original shared-asset controls remain RED: invalid cache mutation before refusal, public listener removal detaching physics, held-asset destroy, and notification preceding native propagation. They are preserved failures, not fixed by the kernel alone.\n\nThe isolated S1 private roster and S3 asset entry candidates are not wired into the actual owner lifecycle. Original S1 pure tests passed but independent review found a scalar no-change owner.commit failure that failed to revoke owners. Its original RED, separate repair, and new finite controls are retained without relabeling the original result. Shared all-owner activation remains blocked.\n\nThe prior Collider listener-entry candidate is explicitly NOT ADOPTED because its public off guard incorrectly blocks automatic once retirement. Its original successful assertions did not establish the required once contract. T15 event support remains unimplemented.\n\nAll 2,128 formal required cells remain NOT_RUN and all nine Gates remain unpassed. Real producers remain NOT_INTEGRATED; stagedCommandsSupported and unifiedTransactionsSupported remain false. No main push, merge, deployment, release, Jolt or XPBD work is included.\n\nEvidence closure inventories exact completed roots, ignored logs and explicit references. Previous manifests are losslessly referenced, not recursively expanded. Native artifacts and previous Library archives remain externally preserved by exact hash; authorized removed transport caches are enumerated separately and never called unique raw evidence.\n''')
print(json.dumps({'classified':len(ex),'externalUnique':len(external),'removedTransport':429}))
