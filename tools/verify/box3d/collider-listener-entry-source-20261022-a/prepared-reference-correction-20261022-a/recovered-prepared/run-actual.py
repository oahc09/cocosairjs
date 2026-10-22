# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""Read-only actual-engine overlay run; output must be a fresh directory outside the engine."""
import datetime, hashlib, json, os, subprocess, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path(os.environ.get('BOX3D_ENGINE_ROOT',str(HERE.parent/'box3d-rebuild-20261022'))).resolve()
variant=sys.argv[1]; assert variant in ['before','source']
OUT=(HERE/sys.argv[2]).resolve(); assert not OUT.exists() and not OUT.is_relative_to(ROOT)
OUT.mkdir(parents=True)
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,data):p.write_text(json.dumps(data,indent=2)+'\n')
fixtures=['run-actual.py','actual-engine.test.cjs','actual-engine.jest.cjs','overlay-resolver.cjs']
start=now(); inputs={str(HERE/p):sha(HERE/p) for p in fixtures}
for base in [ROOT/'src',ROOT/'test',HERE/'before',HERE/'source']:
 for p in base.rglob('*'):
  if p.is_file():inputs[str(p)]=sha(p)
for p in [ROOT/'jest.config.js',ROOT/'babel.config.js',ROOT/'tsconfig.json',ROOT/'package.json',ROOT/'package-lock.json']:
 inputs[str(p)]=sha(p)
save(OUT/'inputs-before.json',inputs)
env=dict(os.environ,BOX3D_ENGINE_ROOT=str(ROOT),BOX3D_LISTENER_VARIANT=variant,BOX3D_LISTENER_OUT=str(OUT))
cmd=['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(HERE/'actual-engine.jest.cjs'),'--runInBand','--no-cache','--json','--outputFile',str(OUT/'jest-result.json')]
with (OUT/'stdout.txt').open('wb') as stdout,(OUT/'stderr.txt').open('wb') as stderr:
 result=subprocess.run(cmd,cwd=HERE,env=env,stdout=stdout,stderr=stderr,check=False)
raw=json.loads((OUT/'raw.json').read_text()) if (OUT/'raw.json').exists() else {}
loaded=raw.get('loadedSources',[])
changed=[v['path'] for v in loaded if inputs.get(v['path'])!=v['sha256'] or sha(v['path'])!=v['sha256']]
rows=raw.get('rows',[])
receipt={'scope':raw.get('scope'),'variant':variant,'startedAt':start,'completedAt':now(),'command':cmd,'exitCode':result.returncode,'cases':len(rows),'failedCases':sum(any(not c['passed'] for c in r['checks']) for r in rows),'failedChecks':sum(not c['passed'] for r in rows for c in r['checks']),'fixtureFailures':[r['name'] for r in rows if r.get('fixtureError')],'loadedSources':len(loaded),'loadedSourceDrift':changed,'fixtureSourceDrift':[p for p in fixtures if inputs[str(HERE/p)]!=sha(HERE/p)],'rawSha256':sha(OUT/'raw.json') if raw else None}
save(OUT/'receipt.json',receipt);print(json.dumps(receipt));sys.exit(result.returncode or bool(changed))
