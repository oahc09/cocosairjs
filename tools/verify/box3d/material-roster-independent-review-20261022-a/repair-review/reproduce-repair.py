from pathlib import Path
import subprocess, json, hashlib, datetime, sys
root=Path(__file__).resolve().parent
compiler='/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022/node_modules/typescript/bin/tsc'
expected='fb1be9f19ab526e8b1c0785446a387324b4d51930b90d7bfb105127fe8255b06'
assert hashlib.sha256((root/'inputs/src/physics-material-values-transaction.ts').read_bytes()).hexdigest()==expected
runs=[]
cases=[('tsc',root/'inputs',['node',compiler,'--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--noEmitOnError','--outDir','compiled','src/physics-material-values-transaction.ts'],0),('candidate-controls',root/'inputs',['node','controls.cjs','../evidence/candidate-controls.json'],0)]
for name,script in [('reviewer-controls','reviewer-controls.cjs'),('phase-controls','phase-controls.cjs'),('repair-controls','repair-controls.cjs'),('repaired-original-regression','probe-nochange-commit-repaired.cjs')]:
 cases.append((name,root,['node',script,'evidence/'+name+'.json'],0))
cases.append(('unchanged-original-probe-failstop',root,['node','unchanged-original-probe.cjs','evidence/unchanged-original-probe.json'],1))
for name,cwd,command,expectedExit in cases:
 p=subprocess.run(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 log=root/'evidence'/(name+'.log');log.write_bytes(p.stdout)
 runs.append(dict(name=name,cwd=str(cwd),command=command,exitCode=p.returncode,expectedExit=expectedExit,rawLog=str(log.relative_to(root))))
report={'schema':'independent-material-roster-repair-run/1','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':expected,'runs':runs,'qualification':'ISOLATED_PURE_PROTOCOL_ONLY','engineIntegration':False,'formalRequiredCellsUnchanged':{'NOT_RUN':2128}}
(root/'evidence/run.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
sys.exit(0 if all(x['exitCode']==x['expectedExit'] for x in runs) else 1)
