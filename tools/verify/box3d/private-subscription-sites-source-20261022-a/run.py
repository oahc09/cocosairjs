# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
from pathlib import Path
import datetime, hashlib, json, subprocess, sys
root=Path(__file__).resolve().parent
label=sys.argv[1];args=sys.argv[2:]
if args and args[0]=='--':args=args[1:]
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
result=subprocess.run(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
for key,data in [('stdout',result.stdout),('stderr',result.stderr)]: (root/f'{label}.{key}.txt').write_bytes(data)
(root/f'{label}.exitcode').write_text(str(result.returncode)+'\n')
receipt={'argv':args,'cwd':str(root),'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'stdoutSha256':hashlib.sha256(result.stdout).hexdigest(),'stderrSha256':hashlib.sha256(result.stderr).hexdigest()}
(root/f'{label}.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);sys.exit(result.returncode)
