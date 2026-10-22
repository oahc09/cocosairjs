from pathlib import Path
import subprocess,json,datetime,hashlib,shutil
root=Path.cwd();artifact='tools/physics/box3d/output/command-wasm-release-20261022-n4';summary=root.parent/'box3d-material-cleanup-seven-run-20261022-a';summary.mkdir(exist_ok=False)
if shutil.disk_usage(root).free<800_000_000:raise RuntimeError('Disk low-water stop')
cases=[('owner-material-real-wasm.mjs',x,'owner-material-real-release-20261022-'+x+'-cleanup-b') for x in ['clone-callback','collider-listener-failure','default-listener-failure']]+[('owner-material-native-failure.mjs','default-readback-failure','owner-material-native-release-20261022-readback-cleanup-b')]+[('owner-material-cleanup-real-wasm.mjs',x,'owner-material-cleanup-release-20261022-'+x+'-a') for x in ['collider-cleanup','observer-lease-cleanup','public-default-cleanup']]
rows=[]
for script,case,name in cases:
 if shutil.disk_usage(root).free<800_000_000:raise RuntimeError('Disk low-water stop')
 out='docs/physics/box3d/rebuild/'+name;cmd=['node','tools/verify/box3d/'+script,artifact,out,case];assert not Path(out).exists()
 with (summary/(case+'.stdout.txt')).open('wb') as so,(summary/(case+'.stderr.txt')).open('wb') as se:p=subprocess.run(cmd,stdout=so,stderr=se)
 row={'case':case,'command':cmd,'exitCode':p.returncode,'receipt':out+'/receipt.json'};rows.append(row);(summary/'run-summary.json').write_text(json.dumps({'startedSourceCommit':'4e1cb31336dee13c549d8ec94ab71e64072e93e2','rows':rows},indent=2)+'\n');print(json.dumps(row),flush=True)
print('SEVEN_FINISHED',flush=True)
