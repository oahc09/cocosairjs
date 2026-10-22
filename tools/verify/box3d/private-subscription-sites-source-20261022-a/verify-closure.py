# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent
exclude={'closure-manifest.json','closure-verification.json','closure.stdout.txt','closure.stderr.txt','closure.exitcode','closure.receipt.json'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if '--seal' in sys.argv:
    files=[]
    for p in sorted(root.rglob('*')):
        if p.is_file() and str(p.relative_to(root)) not in exclude:
            files.append({'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)})
    (root/'closure-manifest.json').write_text(json.dumps({'schema':'private-subscription-sites-closure/1','excludedSelfReferentialEnvelope':sorted(exclude),'files':files},indent=2)+'\n')
manifest=json.loads((root/'closure-manifest.json').read_text())
expected={x['path'] for x in manifest['files']}
actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and str(p.relative_to(root)) not in exclude}
assert expected==actual,{'missing':sorted(expected-actual),'unexpected':sorted(actual-expected)}
for entry in manifest['files']:
    p=root/entry['path'];assert p.stat().st_size==entry['bytes'] and sha(p)==entry['sha256'],entry['path']
total=sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
assert total<10*1024*1024
result={'verified':True,'files':len(expected),'manifestSha256':sha(root/'closure-manifest.json'),'treeBytesAtVerification':total,'limitBytes':10*1024*1024,'formalCellsNOT_RUN':2128,'realProducers':'NOT_INTEGRATED','staged':False,'unified':False}
(root/'closure-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
