# Copyright (c) 2026-2027 oahc09@gmail.com
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
"""Reconstructible local Git fixtures; no network and no product tests."""
from pathlib import Path
import importlib.util, tempfile, subprocess, json, hashlib
module_path=Path(__file__).with_name('evidence-closure.py');spec=importlib.util.spec_from_file_location('closure',module_path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
with tempfile.TemporaryDirectory(prefix='box3d-closure-control-') as d:
 root=Path(d);subprocess.run(['git','init','-q',d],check=True);(root/'evidence').mkdir();(root/'.gitignore').write_text('*.log\n*.pyc\n');(root/'evidence/raw.json').write_text('{"truth":true}\n');(root/'evidence/stdout.log').write_text('original raw stdout\n');cfg={'requiredRoots':['evidence'],'additionalFiles':[], 'exceptions':[],'manifestReferences':[]};manifest_name='delivery.json'
 def add(*paths):subprocess.run(['git','add','-f','--',*paths],cwd=root,check=True)
 def rejects(name,fn,fragment):
  try:fn()
  except Exception as e:assert fragment in str(e),(name,str(e));results.append({'case':name,'status':'PASS_EXPECTED_REJECTION','error':str(e)})
  else:raise AssertionError('Expected rejection: '+name)
 add('.gitignore','evidence/raw.json')
 rejects('ignored stdout must not silently disappear',lambda:m.freeze(root,cfg,manifest_name),'Ignored required evidence')
 add('evidence/stdout.log');manifest=m.freeze(root,cfg,manifest_name);(root/manifest_name).write_text(json.dumps(manifest,indent=2)+'\n');add(manifest_name);result=m.verify(root,manifest,manifest_name);results.append({'case':'force-retained exact raw closure','status':result['status']})
 (root/'evidence/stdout.log').write_text('changed raw stdout\n');rejects('raw changed after staging',lambda:m.verify(root,manifest,manifest_name),'differs from staged');add('evidence/stdout.log');rejects('raw restaged after freeze',lambda:m.verify(root,manifest,manifest_name),'inventory changed')
 (root/'evidence/stdout.log').write_text('original raw stdout\n');add('evidence/stdout.log');(root/'evidence/stderr.txt').write_text('untracked stderr\n');rejects('untracked raw refused',lambda:m.freeze(root,cfg,manifest_name),'Untracked required evidence');add('evidence/stderr.txt')
 (root/'evidence/receipt.json').write_text(json.dumps({'rawSha':hashlib.sha256((root/'evidence/stdout.log').read_bytes()).hexdigest()}));add('evidence/receipt.json');cfg['manifestReferences']=[{'manifestPath':'evidence/receipt.json','sha256Pointer':'/rawSha','retainedPath':'evidence/stdout.log'}];good=m.freeze(root,cfg,manifest_name);assert len(good['references'])==1;results.append({'case':'declared receipt pointer resolves exact bytes','status':'PASS'})
 cfg['manifestReferences'][0]['retainedPath']='evidence/missing.log';rejects('missing referenced file refused',lambda:m.freeze(root,cfg,manifest_name),'not in explicit delivery inventory');cfg['manifestReferences'][0]['retainedPath']='evidence/stderr.txt';rejects('wrong referenced bytes refused',lambda:m.freeze(root,cfg,manifest_name),'hash does not match');cfg['manifestReferences']=[]
 cfg['exceptions']=[{'path':'evidence/stdout.log','sha256':hashlib.sha256((root/'evidence/stdout.log').read_bytes()).hexdigest(),'kind':'REGENERABLE_PYTHON_CACHE','reason':'incorrect raw exemption'}];rejects('cache exemption cannot hide stdout',lambda:m.freeze(root,cfg,manifest_name),'cannot cover raw evidence')
 cache=root/'evidence/__pycache__/fixture.pyc';cache.parent.mkdir();cache.write_bytes(b'regenerable fixture cache');cfg['exceptions']=[{'path':cache.relative_to(root).as_posix(),'sha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'kind':'REGENERABLE_PYTHON_CACHE','reason':'Exact test Python bytecode; original test source retained separately'}];good=m.freeze(root,cfg,manifest_name);assert len(good['exceptionsObserved'])==1;results.append({'case':'exact cache separated from raw','status':'PASS'})
 cache.write_bytes(b'changed cache');rejects('exception drift refused',lambda:m.freeze(root,cfg,manifest_name),'Exception changed')
 cache.write_bytes(b'regenerable fixture cache');manifest=m.freeze(root,cfg,manifest_name);(root/manifest_name).write_text(json.dumps(manifest,indent=2)+'\n');add(manifest_name);subprocess.run(['git','-c','user.name=Box3D fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture original bytes'],cwd=root,check=True);assert m.verify(root,manifest,manifest_name,True)['committedSnapshot'];results.append({'case':'actual committed delivery closure','status':'PASS'})
 (root/'evidence/added.txt').write_text('new staged evidence\n');add('evidence/added.txt');manifest=m.freeze(root,cfg,manifest_name);(root/manifest_name).write_text(json.dumps(manifest,indent=2)+'\n');add(manifest_name);rejects('staged but absent from bundle HEAD refused',lambda:m.verify(root,manifest,manifest_name,True),'staged but not in source checkpoint HEAD')

print(json.dumps({'status':'PASS_SCOPED_GIT_CLOSURE_CONTROLS','cases':len(results),'results':results},indent=2))
