# Copyright (c) 2026-2027 oahc09@gmail.com
# SPDX-License-Identifier: MIT
"""Check explicitly declared actual-run references against lossless packed bytes."""
from pathlib import Path
import hashlib,json,zipfile
here=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(here/'neutral-material-evidence.zip') as z:
 inventory=json.loads(z.read('inventory.json')); rows={r['path']:r for r in inventory['files']}
 roots=sorted([(Path(r['directory']),r['alias']) for r in inventory['roots']],key=lambda x:len(str(x[0])),reverse=True)
 def logical(path):
  p=Path(path)
  for root,alias in roots:
   if p==root or root in p.parents:return alias+'/'+p.relative_to(root).as_posix()
  raise AssertionError('Reference outside exact archived roots: '+str(path))
 def read(name,expected=None):
  r=rows[name]; data=z.read('objects/'+r['sha256']);assert sha(data)==r['sha256'] and len(data)==r['bytes']
  if expected is not None:assert r['sha256']==expected,(name,expected,r['sha256'])
  return data
 reviews=['evidence-review/verification.json','evidence-review-final/verification.json']
 checked=[];inputcopies=0;loglinks=0
 for review_name in reviews:
  review=json.loads(read(review_name));assert review['status']=='PASS_LIMITED_EVIDENCE_INTEGRITY' and not review['errors']
  for phase,records in [('current',review['runs']),('historical',review['history'])]:
   for row in records:
    base=logical(row['directory']); receipt=json.loads(read(base+'/receipt.json',row['receiptSha256'])); raw=json.loads(read(base+'/native-and-app.raw.json',row['rawSha256']))
    assert receipt['nativeReportSha256']==row['rawSha256']
    for name,h in receipt['sourceHashesBefore'].items():read(base+'/inputs/'+name,h);inputcopies+=1
    for name,h in row.get('logSha256',{}).items():read(base+'/'+name,h);loglinks+=1
    if row.get('outerExit'):read(logical(row['outerExit']['path']),row['outerExit']['sha256']);loglinks+=1
    checked.append({'review':review_name,'phase':phase,'directory':base,'receiptSha256':row['receiptSha256'],'rawSha256':row['rawSha256']})
 result={'status':'PASS_EXPLICIT_PACKED_ACTUAL_RUN_REFERENCE_CLOSURE','archiveSha256':sha((here/'neutral-material-evidence.zip').read_bytes()),'inventorySha256':sha(z.read('inventory.json')),'checks':checked,'namedInputCopyReferencesChecked':inputcopies,'logExitReferencesChecked':loglinks,'scope':'Both frozen integrity reviews: named actual run receipt/raw/log/exit/frozen input references only. Earlier review remains historical after a type-only harness correction. External native artifacts are separately identified, not pretended embedded. No every-JSON-string or all-history closure claim.'}
 print(json.dumps(result,indent=2))
