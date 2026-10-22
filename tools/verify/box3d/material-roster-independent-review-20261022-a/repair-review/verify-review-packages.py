from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent
checks=[]
for label,base,manifest in [('original',root.parent,root.parent/'original-review-manifest.json'),('repair',root,root/'repair-review-manifest.json')]:
 m=json.loads(manifest.read_text());errors=[]
 for f in m['files']:
  p=base/f['path']
  if p.is_symlink() or not p.is_file():errors.append({'path':f['path'],'error':'missing or symlink'});continue
  b=p.read_bytes()
  if len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['sha256']:errors.append({'path':f['path'],'error':'content mismatch'})
 checks.append({'scope':label,'manifestSha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'files':len(m['files']),'bytes':sum(f['bytes'] for f in m['files']),'errors':errors,'pass':not errors})
result={'schema':'independent-review-package-verification/1','checks':checks,'pass':all(c['pass'] for c in checks)}
(root/'evidence/package-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));sys.exit(0 if result['pass'] else 1)
