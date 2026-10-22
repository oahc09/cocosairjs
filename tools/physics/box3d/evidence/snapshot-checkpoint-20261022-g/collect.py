from pathlib import Path
import json,hashlib,shutil,tarfile,datetime
r=Path('.');out=r/'tools/physics/box3d/output';ev=r/'tools/physics/box3d/evidence';cp=out/'snapshot-checkpoint-20261022-g'
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def j(p):return json.loads(p.read_text())
def item(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':h(p)}
def write(p,x):p.write_text(json.dumps(x,indent=2)+'\n')
prior=j(ev/'index.json');prior_files=prior['files']
for x in prior_files:assert item(r/x['path'])==x,x['path']
old_owned=j(r/'tools/physics/box3d/owned-files.json')
debug=out/'wasm-snapshot-debug-20261022-g';release=out/'wasm-snapshot-release-20261022-g';comparison=out/'wasm-snapshot-compare-20261022-g';snapcomp=out/'snapshot-comparison-20261022-g';source=out/'snapshot-source-20261022-g'
rs=[j(p/'build-receipt.json') for p in [debug,release]]
assert all(x['status']=='PASS' for x in rs);assert rs[0]['inputHashes']==rs[1]['inputHashes']
for x in rs[0]['inputHashes']:assert h(r/x['path'])==x['sha256'],x['path']
for p in [debug,release]:
 for art in j(p/'manifest.json')['artifacts']:assert h(p/art['path'])==art['sha256'] and (p/art['path']).stat().st_size==art['bytes']
 for name in ['wasm-contract.raw.json','wasm-ownership-contract.raw.json','wasm-snapshot-contract.raw.json','artifact-audit.raw.json']:assert j(p/name)['status']=='PASS'
assert j(comparison/'comparison.raw.json')['status']=='PASS';assert j(snapcomp/'snapshot-comparison.raw.json')['status']=='PASS'
inputs=sorted({x['path'] for x in rs[0]['inputHashes']}|{'tools/physics/box3d/audit-artifacts.mjs','tools/physics/box3d/compare-wasm-builds.mjs','tools/physics/box3d/compare-snapshot-builds.mjs','tools/physics/box3d/wasm-contact-growth-contract.mjs','tools/physics/box3d/README.md','tools/physics/box3d/snapshot-contract.md'})
for path in inputs:
 dest=cp/'inputs'/path;assert not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest)
growths=[out/f'wasm-contact-growth-{mode}-20261022-{attempt}' for mode in ['debug','release'] for attempt in ['g','g2']]
for p in growths:assert j(p/'contact-growth.raw.json')['status']=='PASS'
commands=[]
for mode,d in [('Debug',debug),('Release',release)]:
 commands.append('source /workspace/scratch/62d43a81bbde/box3d-toolchain-20261022/use-toolchain.sh && node tools/physics/box3d/build.mjs '+('--debug ' if mode=='Debug' else '')+'--out '+str(d))
 commands.append('node tools/physics/box3d/audit-artifacts.mjs '+str(d))
commands.append('node tools/physics/box3d/compare-wasm-builds.mjs '+' '.join(map(str,[debug,release,comparison])))
for p in growths:commands.append('node tools/physics/box3d/wasm-contact-growth-contract.mjs '+str(debug if 'debug' in p.name else release)+' '+str(p))
commands.append('node tools/physics/box3d/compare-snapshot-builds.mjs '+' '.join(map(str,[debug,release,out/'wasm-contact-growth-debug-20261022-g2',out/'wasm-contact-growth-release-20261022-g2',snapcomp])))
commands.extend(['node tools/physics/box3d/verify-sources.mjs','node ../upstream-update-20261022/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2020 --module nodenext src/air/physics/box3d/binding/facade.d.mts','python3 tools/physics/box3d/output/snapshot-checkpoint-20261022-g/review_additive.py'])
summary={
 'schemaVersion':1,'status':'PASS_LIMITED_COPIED_SNAPSHOT_FOUNDATION','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Fresh Debug/Release actual Node WASM batch poses, immediate copied native events, raw cached manifolds, finite ownership and growth. Not complete C21/C22/T07/G1.',
 'identity':rs[1]['identity'],'abiVersionChanged':False,'preexistingWireLayoutsAndCSignaturesChanged':False,'originalVendorFilesVerified':130,'stagedCoreFiles':111,'currentBuildInputCount':len(rs[0]['inputHashes']),
 'statuses':{'wasmDebug':'PASS_REAL_FINITE_FIXTURES','wasmRelease':'PASS_REAL_FINITE_FIXTURES','artifactAudits':'PASS_55_UNITS_PER_MODE','basePhysicsOwnershipComparison':'PASS_EXACT_FINITE','snapshotComparison':'PASS_EXACT_FINITE','bodyTransformBatch':'PASS_64_BODIES_REAL_NATIVE_BATCH','contactAndSensorGrowth':'PASS_TWO_ACTUAL_GROWS_PER_MODE_G2','staleSchema':'PASS_TWO_EXPECTED_REJECTIONS_ACTUAL_E_MODULE','contactWorldLocalPoints':'BLOCKED_UNPROVEN_CACHED_ANCHOR_EPOCH','fullC21':'INCOMPLETE','fullC22':'INCOMPLETE','T07':'INCOMPLETE','browser':'BLOCKED_INFRASTRUCTURE','strictCsp':'NOT_RUN','nativeSanitizerG':'NOT_RUN','historicalOriginalSanitizer':'FAIL_PRESERVED','historicalCandidateASanUBSan':'BLOCKED_LSAN_PTRACE','G1':'INCOMPLETE'},
 'commands':commands,'currentInputHashes':rs[0]['inputHashes'],
 'focusedChecks':{'sourceIntegrityExitCode':0,'declarationsExitCode':0,'formatExitCode':0,'sourceAdditiveAbiReview':'PASS'},
 'observations':j(debug/'wasm-snapshot-contract.raw.json')['observations'],
 'snapshotGroupsPerMode':len(j(debug/'wasm-snapshot-contract.raw.json')['checks']),
 'growthObservationCorrection':{'originalReports':[str(p/'contact-growth.raw.json') for p in growths if p.name.endswith('-g')],'reason':'Original fixture read previous.byteLength after actual memory growth detached that buffer, so beforeBytes was 0. Original physics/snapshot assertions did execute; the length observation is invalid.','exactOriginalFixture':item(cp/'contact-growth-original-observation-bug.mjs'),'correctedFixture':item(r/'tools/physics/box3d/wasm-contact-growth-contract.mjs'),'correctedReports':[str(p/'contact-growth.raw.json') for p in growths if p.name.endswith('-g2')],'originalReportsUnmodified':True},
 'reports':[item(p) for p in [source/'stale-schema.raw.json',debug/'build-receipt.json',release/'build-receipt.json',debug/'wasm-snapshot-contract.raw.json',release/'wasm-snapshot-contract.raw.json',debug/'artifact-audit.raw.json',release/'artifact-audit.raw.json',comparison/'comparison.raw.json',snapcomp/'snapshot-comparison.raw.json',cp/'source-verification.raw.json',cp/'additive-abi-review.raw.json']]+[item(p/'contact-growth.raw.json') for p in growths],
 'artifacts':{mode:[item(p/x['path']) for x in j(p/'manifest.json')['artifacts']] for mode,p in [('Debug',debug),('Release',release)]},
 'limitations':['No generic contact world/local point reconstruction is exposed; native hit points remain separate event fields.','Slow thick sensor fixture does not qualify thin/transient CCD sensor C22.','Copied touching manifolds cover facade-owned bodies, not arbitrary raw-native-created unowned bodies.','Exact finite Debug/Release equality is not cross-platform determinism.','Finite lifecycle checks cannot prove no ABA/generation wrap.','Core live bytes do not measure all JS allocations or the entire WASM heap.','g normal WASM assertions are not native sanitizer runs; historical ASan/UBSan outcomes remain separate.']}
write(cp/'summary.json',summary)
write(cp/'source-checkpoint-final.json',{'scope':'Final g source and documentation; exact compiled sources are identified separately in build receipts','files':[item(r/p) for p in inputs]})
# Archive source snapshots, original raw outputs, actual artifacts, staged core and build/link metadata, not objects/libraries.
directories=[debug,release,comparison,snapcomp,source,*growths,cp]
files=[]
for directory in directories:
 for p in directory.rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(directory)
  if directory not in [debug,release] or len(rel.parts)==1 or rel.parts[0]=='staged-core' or p.suffix=='.rsp' or str(rel) in ['CMakeFiles/air_box3d.dir/link.txt','CMakeFiles/CMakeConfigureLog.yaml']:
   if p.suffix not in ['.o','.a']:files.append(p)
files=sorted(set(files));write(cp/'archive-files.json',{'files':[item(p) for p in files]});files.append(cp/'archive-files.json')
archive=out/'snapshot-validation-20261022-g.tar.gz';assert not archive.exists()
with tarfile.open(archive,'w:gz') as tar:
 for p in files:tar.add(p,arcname=str(p),recursive=False)
with tarfile.open(archive,'r:gz') as tar:
 assert len(tar.getmembers())==len(files)
 for p in files:assert tar.extractfile(str(p)).read()==p.read_bytes(),p
meta={**item(archive),'entries':len(files),'byteVerified':True,'tracked':False,'scope':'g exact source inputs, actual Debug/Release artifacts, all raw fixtures including original detached-buffer observation and corrected g2, staged core, build commands/logs/compile/link metadata, additive ABI review and numeric anchor hypothesis diagnostics; no intermediate objects/static libraries.'}
write(cp/'archive-metadata.json',meta)
# Durable small evidence is a byte-identical copy. Existing evidence never overwritten.
for directory in directories:
 for p in directory.iterdir():
  if not p.is_file():continue
  if p.suffix not in ['.json','.txt','.mjs','.py']:continue
  if directory in [debug,release] and p.suffix=='.mjs':continue
  if directory==cp and p.name=='archive-files.json':continue
  dst=ev/directory.name/p.name;assert not dst.exists();dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dst);assert dst.read_bytes()==p.read_bytes()
# Extend the current index; historical status records keep their own original identities.
prior['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();prior['schemaSha256']=rs[1]['identity']['schemaSha256'];prior['latestWasmAttempt']=release.name
prior['statuses'].update({'copiedSnapshotWasmDebug':'PASS_FINITE_NATIVE_DATA','copiedSnapshotWasmRelease':'PASS_FINITE_NATIVE_DATA','copiedSnapshotComparison':'PASS_EXACT_FINITE','contactAnchorEpoch':'BLOCKED_UNPROVEN_RECYCLED_AND_CCD_SNAPSHOT_BASIS','C21':'INCOMPLETE','C22':'INCOMPLETE','T07':'INCOMPLETE'})
for p in [debug,release]:prior['wasmAttempts'].append({'name':p.name,'compile':'PASS','node':'PASS_NARROW_FOUNDATION','ownership':'PASS_FINITE_CONTRACT','copiedSnapshots':'PASS_SEVEN_REAL_GROUPS','artifactAudit':'PASS_55_UNITS','schemaSha256':rs[1]['identity']['schemaSha256'],'patchChainSha256':rs[1]['identity']['patchChainSha256'],'receipt':str(ev/p.name/'build-receipt.json')})
prior['snapshotIncrement']={'summary':str(ev/cp.name/'summary.json'),'summarySha256':h(cp/'summary.json'),'currentBuildInputCount':21,'newWireSymbols':8,'abiVersion':1,'preexistingWireLayoutsUnchanged':True,'snapshotGroupsPerMode':7,'rotatingEccentricSamplesPerMode':12,'currentContactWorldPointsStatus':'BLOCKED_UNPROVEN_CACHED_ANCHOR_EPOCH','slowThickSensorOnly':True,'originalGrowthObservationBugPreserved':True,'correctedGrowthRuns':'g2','originalVendorFilesUnchanged':130}
prior['snapshotRawArchive']=meta
prior['statusScopeNotes'].append('g is additive ABI-1 copied native data under a new schema. Actual fresh Debug/Release physics/ownership/events pass finite fixtures, while generic contact world/local reconstruction explicitly rejects unproven cached epoch. C21/C22/T07/G1 remain incomplete. Old g supplemental beforeBytes=0 observation bug is retained; corrected g2 reports are separate. No g native sanitizer or browser qualification.')
prior['files']=[item(p) for p in sorted(ev.rglob('*')) if p.is_file() and p!=ev/'index.json']
for x in prior_files:assert item(r/x['path'])==x
write(ev/'index.json',prior)
# Inventory only this worker's allowed roots, excluding output and this inventory itself.
owned=r/'tools/physics/box3d/owned-files.json';roots=['vendor/box3d','tools/physics/box3d','src/air/physics/box3d/binding'];inventory=[]
for name in roots:
 for p in (r/name).rglob('*'):
  if p.is_file() and p!=owned and not p.is_relative_to(out):inventory.append(item(p))
inventory.sort(key=lambda x:x['path']);write(owned,{'schemaVersion':1,'scopeRoots':roots,'excludes':['tools/physics/box3d/output/**','this manifest itself'],'files':inventory})
oldmap={x['path']:x for x in old_owned['files']};changes=[x for x in inventory if oldmap.get(x['path'])!=x]
removed=sorted(set(oldmap)-{x['path'] for x in inventory});assert not removed
write(cp/'handoff.json',{'status':'FROZEN','ownedInventory':item(owned),'ownedFileCountExcludingInventory':len(inventory),'evidenceIndex':item(ev/'index.json'),'evidenceFileCount':len(prior['files']),'oldEvidenceByteVerified':len(prior_files),'summary':item(ev/cp.name/'summary.json'),'archive':meta,'changedOrNewFiles':changes,'removedFiles':removed})
print(json.dumps({'ownedFiles':len(inventory),'evidenceFiles':len(prior['files']),'priorEvidenceUnchanged':len(prior_files),'changedOrNewFiles':len(changes),'archive':meta,'summary':item(ev/cp.name/'summary.json'),'ownedInventory':item(owned),'evidenceIndex':item(ev/'index.json')},indent=2))
