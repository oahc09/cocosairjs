from pathlib import Path
import gzip,json,hashlib,subprocess,datetime,re
root=Path('.');load=lambda p:json.loads(gzip.decompress(Path(p).read_bytes())if str(p).endswith('.json.gz')else Path(p).read_bytes());c=load('ai/ledgers/box3d-delivery-checkpoint-36.json.gz')['config'];refs=c['manifestReferences'];additional=set(c['additionalFiles']);h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
p=Path('ai/ledgers/box3d-rebuild-state.json');state=load(p);state['updatedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['nextStep']='Qualify actual private shared-material lifecycle and failure paths beyond four finite cases; then wire actual nonempty unified producer consumption only after owner completeness and phase prerequisites close.';q=state['currentCandidate'];q['sharedMaterialSourceDefects']='FOUR_ORIGINAL_RED_RETAINED_NEW_COMPOSITE_PASSES_SAME_FOUR_REAL_N4_RELEASE_CASES_LIMITED';q['sharedMaterialSourceDefectsReceipt']='docs/physics/box3d/rebuild/private-material-checkpoint37-intake-20261022/four-real-cases-review.json';q['privateMaterialValueRoster']='ACTUAL_BOX3D_OWNER_LIFECYCLE_AND_FIVE_ASSET_ENTRIES_INTEGRATED_FINITE_REAL_CASES_NOT_ALL_OWNER_QUALIFIED';q['privateMaterialSubscriptions']='ACTUAL_BOX3D_PRIVATE_LANE_PUBLIC_NOTIFICATION_INDEPENDENT_LEGACY_OTHER_BACKEND_UNCHANGED';state['persistentCheckpoint']={'status':'PASS_ACTUAL_LIBRARY_DOWNLOAD_INCREMENTAL_INDEPENDENT_STORE_FULL_FILE_VERIFICATION','libraryFileId':'libfile_5cb4dd1de5e881919a6aadd5c986b3da','commit':'45b526f248575a0542af8eed591c0cf8c8a1ba8d','trackedFiles':20147,'requiresBaseLibrary':'libfile_10c86f5827f481919e3938fbb0c2670b','requiresBaseCommit':'e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6','receipt':'docs/physics/box3d/rebuild/library-shared-material-kernel-checkpoint-20261022.json'};p.write_text(json.dumps(state,indent=2)+'\n')
paths=['ai/ledgers/box3d-rebuild-state.json','ai/ledgers/box3d-delivery-checkpoint-36.json.gz','docs/physics/box3d/contracts/shared-material-values-decisions-v1.md']
paths+=subprocess.check_output(['git','diff','--name-only','HEAD','--','src/']).decode().splitlines()
paths+=subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','src/']).decode().splitlines()
# Only completed evidence has been copied into these owned roots. Ignore no raw logs.
for base in c['requiredRoots']:
 for p in Path(base).rglob('*'):
  if p.is_file()and '__pycache__'not in p.parts:paths.append(p.as_posix())
paths=sorted(set(paths));known={};allfiles=set(subprocess.check_output(['git','ls-files','-z']).decode().split('\0'))|set(paths)
for name in sorted(allfiles):
 if name and Path(name).is_file()and not Path(name).is_symlink():known.setdefault(h(name),[]).append(name)
def target(sha):
 for name in known.get(sha,[]):
  if not any(name.startswith(d+'/')for d in c['requiredRoots']):additional.add(name)
  return name
 return None
cache={};remapped=[]
for ref in refs:
 n=ref['manifestPath'];doc=cache.setdefault(n,load(n))if n not in cache else cache[n];expected=doc
 for tok in ref['sha256Pointer'].split('/')[1:]:
  tok=tok.replace('~1','/').replace('~0','~');expected=expected[int(tok)]if isinstance(expected,list)else expected[tok]
 if not Path(ref['retainedPath']).is_file()or h(ref['retainedPath'])!=expected:
  old=ref['retainedPath'];new=target(expected);assert new,('Earlier required byte identity missing',old,expected);ref['retainedPath']=new;remapped.append({'manifest':n,'pointer':ref['sha256Pointer'],'previousTarget':old,'exactTarget':new,'sha256':expected})
seen={(r['manifestPath'],r['sha256Pointer'])for r in refs};unresolved=[]
def walk(v,p=''):
 if isinstance(v,dict):
  for k,x in v.items():yield from walk(x,p+'/'+k.replace('~','~0').replace('/','~1'))
 elif isinstance(v,list):
  for i,x in enumerate(v):yield from walk(x,p+'/'+str(i))
 elif isinstance(v,str)and re.fullmatch('[0-9a-f]{64}',v):yield p,v
# Scan only changed/new evidence documents. Old raw identities retain the explicit prior reference ledger.
trackedChanged=set(subprocess.check_output(['git','diff','--name-only','HEAD']).decode().splitlines())
untracked=set(subprocess.check_output(['git','ls-files','--others','--exclude-standard']).decode().splitlines());ignored=set(subprocess.check_output(['git','ls-files','--others','--ignored','--exclude-standard',*c['requiredRoots']]).decode().splitlines());scanNames=(trackedChanged|untracked|ignored)&set(paths)
for name in sorted(scanNames):
 if not name.endswith('.json')or'/inputs/'in name or name.startswith('ai/ledgers/box3d-delivery-checkpoint-')or name.endswith('/reference-boundaries.json'):continue
 try:doc=load(name)
 except Exception:continue
 for pointer,sha in walk(doc):
  if(name,pointer)in seen:continue
  destination=target(sha)
  if destination:refs.append({'manifestPath':name,'sha256Pointer':pointer,'retainedPath':destination});seen.add((name,pointer))
  else:unresolved.append({'manifest':name,'pointer':pointer,'sha256':sha})
for name in paths:
 if not any(name.startswith(d+'/')for d in c['requiredRoots']):additional.add(name)
for exception in c['exceptions']:
 p=Path(exception['path'])
 if p.exists():exception['sha256']=h(p)
c['additionalFiles']=sorted(additional)
for name,data in [('config',c),('unresolved',unresolved),('remapped',remapped),('files',paths)]:Path('/tmp/box3d-evidence-checkpoint37-'+name+'.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
subprocess.run(['git','add','-f','--pathspec-from-file=-','--pathspec-file-nul'],input=('\0'.join(paths)+'\0').encode(),check=True)
print(json.dumps({'stagedPaths':len(paths),'refs':len(refs),'additionalFiles':len(additional),'remapped':len(remapped),'unresolvedOccurrences':len(unresolved),'unresolvedUnique':len(set(x['sha256']for x in unresolved))}))
