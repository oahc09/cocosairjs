# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""Synthetic reviewer-only mutations, never native/WASM execution. In-memory input
substitution avoids duplicate full raw trees; exact base and mutation recipe retained.
"""
from pathlib import Path
import json, hashlib, subprocess, sys, datetime
root = Path.cwd()
out = Path(sys.argv[1])
if out.exists(): raise RuntimeError('A new output directory is required')
out.mkdir(parents=True)
reviewer = root / 'tools/verify/box3d/review-unified-command-analytic.py'
base = root / 'tools/physics/box3d/output/command-wasm-release-20261022-n4/command-samples.raw.jsonl'
sha = lambda b: hashlib.sha256(b).hexdigest()
# Fresh process per control: only the two known raw stream read_bytes calls are replaced.
wrapper = r'''
from pathlib import Path
import runpy, sys, json
original = Path.read_bytes
base = Path(sys.argv[2]); data = original(base)
rows = [json.loads(line) for line in data.splitlines()]
case = sys.argv[3]
if case == 'actual-velocity-corruption':
    row = next(row for row in rows if row['kind'] == 'analytic-box')
    row['result']['operations'][-1]['actual']['linearVelocity'][0] += 0.1
elif case == 'producer-predictions-unreadable':
    def poison(value):
        if isinstance(value, dict):
            for key in list(value):
                if key in ['expected','plan']: value[key] = {'poison': 'Reviewer must not consume this object'}
                else: poison(value[key])
        elif isinstance(value, list):
            for item in value: poison(item)
    poison(rows)
else: raise AssertionError(case)
replacement = ('\n'.join(json.dumps(r,separators=(',',':')) for r in rows)+'\n').encode()
# Write exact mutated input bytes once, then read for both modes via an explicitly marked hook.
Path(sys.argv[4]).write_bytes(replacement)
def read(self):
    if self.name == 'command-samples.raw.jsonl' and self.parent.name in ['command-wasm-debug-20261022-n4','command-wasm-release-20261022-n4']:
        return replacement
    return original(self)
Path.read_bytes = read
script,output = sys.argv[1],sys.argv[5]
sys.argv=[script,output]
runpy.run_path(script,run_name='__main__')
'''
(out/'control-wrapper.py').write_text(wrapper)
cases=[]
for name,expected_exit in [('actual-velocity-corruption',1),('producer-predictions-unreadable',0)]:
    mutated=out/(name+'.mutated.jsonl');result_dir=out/(name+'-review');cmd=[sys.executable,str(out/'control-wrapper.py'),str(reviewer),str(base),name,str(mutated),str(result_dir)]
    with (out/(name+'.stdout.log')).open('wb')as so,(out/(name+'.stderr.log')).open('wb')as se:p=subprocess.run(cmd,stdout=so,stderr=se)
    review=json.loads((result_dir/'review.json').read_text());assert p.returncode==expected_exit
    if name=='actual-velocity-corruption':assert review['status']=='FAIL_RETAINED' and review['maximumAbsoluteError']>0.09
    else:assert review['status']=='PASS_FINITE_INDEPENDENT_COMMAND_ARITHMETIC'
    cases.append({'name':name,'command':cmd,'exitCode':p.returncode,'expectedExitCode':expected_exit,'reviewStatus':review['status'],'mutatedInputBytes':mutated.stat().st_size,'mutatedInputSha256':sha(mutated.read_bytes()),'reviewSha256':sha((result_dir/'review.json').read_bytes()),'note':'Synthetic identical substitution for both mode streams. Does not constitute fresh physics evidence.'})
r={'status':'PASS_TWO_REVIEWER_SENSITIVITY_CONTROLS','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':str(base.relative_to(root)),'baseSha256':sha(base.read_bytes()),'reviewerSha256':sha(reviewer.read_bytes()),'controlSha256':sha(Path(__file__).read_bytes()),'wrapperSha256':sha((out/'control-wrapper.py').read_bytes()),'cases':cases,'scope':'One altered actual observation must fail; unusable producer predictions must not affect independent arithmetic. All mutation bytes and outputs retained. In-memory file-read substitution is fixture-local and only for two named raw input paths.'}
(out/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
