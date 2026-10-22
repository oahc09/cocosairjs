from pathlib import Path
import json,hashlib,gzip,datetime
r=Path('.').resolve();base=r.parent;intake=Path('docs/physics/box3d/rebuild/private-material-checkpoint37-intake-20261022');h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();ext={};decoded={};retained=[]
def add(p,kind):
 p=Path(p);assert p.is_file()and not p.is_symlink();sha=h(p);ext[sha]={'path':str(p),'bytes':p.stat().st_size,'sha256':sha,'classification':kind}
audit=json.loads((intake/'native-cache-audit-f/native-cache-readonly-audit.json').read_text())
def walk(v):
 if isinstance(v,dict):
  p=v.get('path',v.get('file'));sha=v.get('sha256')
  if isinstance(p,str)and isinstance(sha,str)and len(sha)==64 and Path(p).is_file():
   assert h(p)==sha
   if str(p).endswith('/link.txt'):
    dst=intake/'exact-build-links'/f'{sha}.txt';dst.parent.mkdir(exist_ok=True);dst.write_bytes(Path(p).read_bytes());retained.append(str(dst))
   elif '/output/'in p:add(p,'EXTERNAL_EXISTING_NATIVE_ARTIFACT_OR_INTERMEDIATE_NOT_EMBEDDED_NOT_DELETED')
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(audit)
for name in ['box3d-st.mjs','box3d-st.wasm']:add(r/'tools/physics/box3d/output/command-wasm-release-20261022-n4'/name,'EXTERNAL_PREVIOUSLY_LIBRARY_PRESERVED_CURRENT_N4_NATIVE_ARTIFACT')
for row in json.loads((intake/'duplicate-download-reclaim-g/plan.json').read_text())['files']:add(row['retainedExactLocalCopy'],'EXTERNAL_ORIGINAL_PACKAGE_RETAINED_AFTER_AUTHORIZED_DUPLICATE_DOWNLOAD_REMOVAL')
add(base/'box3d-system-pause-qualified-library-roundtrip-20261022/checkpoint-receipt.json','EXTERNAL_PRIOR_SOURCE_RECEIPT_LIBRARY_PRESERVED_EXACT_BYTES')
for phase in ['a','b']:
 d=json.loads(Path(f'tools/verify/box3d/private-subscription-sites-source-20261022-a/evidence/typecheck-{phase}/result.json').read_text())
 for row in [d['compiler'],*d['compilerReads']]:
  p=row.get('path',row.get('file'))
  if '/node_modules/typescript/'in p:assert h(p)==row['sha256'];add(p,'EXTERNAL_INSTALLED_PINNED_TYPESCRIPT_TOOLCHAIN_NOT_VENDORED')
directory=intake/'native-cache-audit-derived';mapping=json.loads((directory/'mapping.json').read_text())
for row in mapping['files']:
 p=directory/row['newFile'];assert h(p)==row['newFileSha256'];b=gzip.decompress(p.read_bytes());assert len(b)==row['decodedBytes']and hashlib.sha256(b).hexdigest()==row['decodedSha256'];decoded[row['decodedSha256']]={'compressedPath':str(p),'compressedSha256':h(p),'decodedSha256':row['decodedSha256'],'decodedBytes':len(b),'classification':'EMBEDDED_LOSSLESS_GZIP_DERIVED_MANIFEST_ACTUALLY_DECOMPRESSED_AND_VERIFIED'}
add(r/'tools/physics/box3d/output/motion-checkpoint-20261022-m/archive-files-m2.json','EXTERNAL_PRIOR_LIBRARY_ARCHIVE_MEMBER_MANIFEST_REHASHED_NOT_RECURSIVELY_EMBEDDED')
add(base/'box3d-shared-material-kernel-library-roundtrip-20261022/checkpoint-receipt.json','EXTERNAL_EXACT_CHAIN_PREREQUISITE_SOURCE_RECEIPT_LIBRARY_PRESERVED')
for p in (base/'box3d-unified-native-source-checkpoint-20261022').glob('*.zip'):
 if h(p)=='9d8f9c238864c24fe97b43d6120575d0f694009c0973b0653dfa6a11d2c4871a':add(p,'EXTERNAL_BASE22_ACTUAL_LIBRARY_PRESERVED_ARCHIVE')
for name in ['box3d-st.mjs','box3d-st.wasm']:add(r/'tools/physics/box3d/output/command-wasm-debug-20261022-n4'/name,'EXTERNAL_PREVIOUSLY_LIBRARY_PRESERVED_CURRENT_N4_NATIVE_ARTIFACT')
u=json.loads(Path('/tmp/box3d-evidence-checkpoint37-unresolved.json').read_text());unresolved=[];classified=[]
for row in u:
 if row['sha256']=='7609a897cb411baf36b50f78eeb283314b18ccc1719fecf1b74c12d131d81a7f':classified.append({**row,'classification':'KNOWN_MISSING_AUXILIARY_READONLY_GIT_STATUS_STDOUT_NOT_BYTE_VERIFIABLE','gapReceipt':str(intake/'known-auxiliary-raw-gap.json')})
 elif row['sha256'] in decoded: classified.append({**row,**decoded[row['sha256']]})
 elif row['sha256'] in ext:classified.append({**row,'classification':ext[row['sha256']]['classification']})
 elif any(h(p)==row['sha256']for p in retained):pass
 else:unresolved.append(row)
output={'status':'CLASSIFIED_EXACT_EXTERNAL_AND_EMBEDDED_COMPRESSED_IDENTITIES'if not unresolved else'INCOMPLETE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'externalRehashed':list(ext.values()),'embeddedCompressed':list(decoded.values()),'nonEmbeddedOrCompressedReferences':classified,'unresolved':unresolved,'rawEvidenceExceptions':'ONE_KNOWN_UNRECOVERABLE_AUXILIARY_READONLY_GIT_STATUS_STDOUT_NOT_TEST_OR_NATIVE_RAW','formalGateChange':False}
(intake/'reference-boundaries.json').write_text(json.dumps(output,indent=2)+'\n');print(json.dumps({'externalUnique':len(ext),'embeddedCompressedUnique':len(decoded),'classified':len(classified),'retainedBuildLinkFiles':len(retained),'unresolved':unresolved},indent=2))
