# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
from pathlib import Path
import difflib,hashlib,json,sys
root=Path(__file__).resolve().parent;base=root.parent/'box3d-rebuild-20261022'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((root/'input-manifest.json').read_text())
products=sorted(str(p.relative_to(root)) for p in (root/'src').rglob('*.ts'))
assert len(products)==3
inputchecks=[]
for rel,fact in manifest['inputs'].items():
    p=root/'inputs/product'/rel
    assert sha(p)==fact['sha256']
    inputchecks.append({'file':rel,'sha256':sha(p),'matchesFrozenInput':True})
source=[];patch=''
for rel in products:
    original=root/'inputs/product'/rel;candidate=root/rel
    assert sha(base/rel)==sha(original),f'Main input drift: {rel}'
    source.append({'file':rel,'originalSha256':sha(original),'candidateSha256':sha(candidate),'mainStillMatchesOriginal':True})
    patch+=''.join(difflib.unified_diff(original.read_text().splitlines(keepends=True),candidate.read_text().splitlines(keepends=True),fromfile='a/'+rel,tofile='b/'+rel))
(root/'candidate.patch').write_text(patch)
for mode in ['original','candidate']:
    result=json.loads((root/'evidence/run-c/results.json').read_text())
    for rel,fact in result['sources'][mode].items():
        path=root/rel if mode=='candidate' and rel in products else root/'inputs/product'/rel
        assert sha(path)==fact['sha256'],(mode,rel)
        assert sha(root/'evidence/run-c'/mode/rel)==fact['sha256']
assert result['passed']==205 and result['failed']==0
for run in ['typecheck-a','typecheck-b']:
    assert json.loads((root/f'evidence/{run}/result.json').read_text())['diagnostics']==[]
# Earlier commands were executed before the receipt wrapper was created. Bind their exact
# issued argv, working directory, exit file, and raw streams without inventing timestamps.
early={
'prepare':['python3','box3d-private-subscription-sites-20261022/prepare.py'],
'run-a':['node','box3d-private-subscription-sites-20261022/controls.cjs','evidence/run-a'],
'run-b':['node','box3d-private-subscription-sites-20261022/controls.cjs','evidence/run-b'],
'expand-controls':['python3','box3d-private-subscription-sites-20261022/expand-controls.py'],
 'typecheck-a':['node','box3d-private-subscription-sites-20261022/typecheck.cjs','evidence/typecheck-a'],
}
for label,argv in early.items():
    receipt={'argv':argv,'cwd':str(root.parent),'exitCode':int((root/f'{label}.exitcode').read_text()),'stdoutSha256':sha(root/f'{label}.stdout.txt'),'stderrSha256':sha(root/f'{label}.stderr.txt'),'reconstructedFromExactIssuedCommand':True,'subprocessTimestamps':'NOT_CAPTURED'}
    (root/f'{label}.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
status={'inputChecks':inputchecks,'candidateSources':source,'productFileCount':len(products),'finalControls':{'passed':205,'failed':0},'strictAffectedSourceTypecheck':'PASS','formalCells':{'total':2128,'NOT_RUN':2128},'gates':{'total':9,'passed':0},'realProducers':'NOT_INTEGRATED','staged':False,'unified':False,'scope':'protocol preparation with explicit owner/native doubles only','mainSourcesUnchanged':True,'nativeOrSDKBuild':'NOT_RUN','dependenciesInstalled':False}
(root/'validation.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps({'validated':True,'candidateSources':source,'treeBytesBeforeFinalManifest':sum(p.stat().st_size for p in root.rglob('*') if p.is_file())},indent=2))
