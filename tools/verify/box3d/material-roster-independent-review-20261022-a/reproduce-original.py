from pathlib import Path
import subprocess, json, hashlib, datetime, sys
root=Path(__file__).resolve().parent
compiler='/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022/node_modules/typescript/bin/tsc'
source=root/'inputs/src/physics-material-values-transaction.ts'
expected='382c459f2116383d9acd7eddec737d7a9dd213f5a2c1371475aa024020666cd4'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected
runs=[]
cases=[('tsc',root/'inputs',['node',compiler,'--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--noEmitOnError','--outDir','compiled','src/physics-material-values-transaction.ts'],0),('original-controls',root/'inputs',['node','controls.cjs','../evidence/frozen-original-controls.json'],0),('reviewer-controls',root,['node','reviewer-controls.cjs','evidence/frozen-reviewer-controls.json'],0),('phase-controls',root,['node','phase-controls.cjs','evidence/frozen-phase-controls.json'],0),('nochange-commit-red',root,['node','probe-nochange-commit.cjs','evidence/frozen-nochange-commit-red.json'],1)]
for name,cwd,command,expectedExit in cases:
 p=subprocess.run(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 log=root/'evidence'/('frozen-'+name+'.log');log.write_bytes(p.stdout)
 runs.append(dict(name=name,cwd=str(cwd),command=command,exitCode=p.returncode,expectedExit=expectedExit,rawLog=str(log.relative_to(root))))
versions={tool:subprocess.check_output(command,text=True).strip() for tool,command in [('node',['node','--version']),('typescript',['node',compiler,'--version'])]}
report={'schema':'independent-material-roster-review-run/1','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':expected,'versions':versions,'runs':runs,'qualification':'ISOLATED_PURE_PROTOCOL_ONLY','engineIntegration':False,'formalRequiredCellsUnchanged':{'NOT_RUN':2128}}
(root/'evidence/frozen-run.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
sys.exit(0 if all(x['exitCode']==x['expectedExit'] for x in runs) else 1)
