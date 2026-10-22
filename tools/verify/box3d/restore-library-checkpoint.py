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
"""Restore one pinned Library incremental into an already verified independent Git store.
The receipt output must be new. No source repository checkout or receipt overwrite.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, os, subprocess, zipfile

def validate_prerequisite(receipt, prior, prior_bytes, root):
 sha=lambda b:hashlib.sha256(b).hexdigest()
 prerequisite=receipt['prerequisite']
 if 'sourceCheckpointReceiptSha256' in prerequisite:
  assert prerequisite['commit']==prior['commit'] and prior['tree']==prerequisite['tree'] and sha(prior_bytes)==prerequisite['sourceCheckpointReceiptSha256'],'Chained increment requires the exact prior source receipt'
  proof_name=prerequisite['libraryRestoreReceiptPath'];assert not Path(proof_name).is_absolute() and '..'not in Path(proof_name).parts
  proof_bytes=(root/proof_name).read_bytes();assert sha(proof_bytes)==prerequisite['libraryRestoreReceiptSha256']
  proof=json.loads(proof_bytes)
  assert proof['status']=='PASS_ACTUAL_LIBRARY_DOWNLOAD_INCREMENTAL_INDEPENDENT_STORE_FULL_FILE_VERIFICATION'
  assert proof['commit']==prior['commit'] and proof['tree']==prior['tree'] and proof['bundle']==prior['bundle']
  assert proof['libraryFileId']==prerequisite['libraryFileId'] and proof['fileId']==prerequisite['fileId']
  assert proof['archive']['bytes']==prerequisite['archiveBytes'] and proof['archive']['sha256']==prerequisite['archiveSha256']
  assert prerequisite['ancestors']==[prior['prerequisite']]
 else:
  assert prerequisite['commit']=='e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6'
  assert prerequisite['libraryFileId']=='libfile_10c86f5827f481919e3938fbb0c2670b'
 return prerequisite

def validate_bundle_header(stream, receipt):
 # A metadata downgrade must not disguise a chain's actual Git prerequisite.
 assert stream.readline(128)==b'# v2 git bundle\n','Expected the emitted Git bundle v2 format'
 prerequisites=[];refs=[];read_bytes=16
 while True:
  line=stream.readline(65537);read_bytes+=len(line)
  assert line and len(line)<=65536 and read_bytes<=65536,'Invalid or excessive bundle header'
  if line==b'\n':break
  text=line.decode('utf-8').rstrip('\n')
  if text.startswith('-'):
   value=text[1:].split(' ',1)[0];assert len(value)==40 and all(c in '0123456789abcdef'for c in value)
   prerequisites.append(value)
  else:
   value,name=text.split(' ',1);assert len(value)==40 and all(c in '0123456789abcdef'for c in value)
   refs.append((value,name))
 assert prerequisites==[receipt['prerequisite']['commit']],'Actual bundle prerequisite differs from declared recovery chain'
 assert refs==[(receipt['commit'],'refs/heads/'+receipt['branch'])],'Actual bundle branch/head differs from receipt'
 return {'prerequisites':prerequisites,'refs':refs,'headerBytes':read_bytes}

p=argparse.ArgumentParser()
for name in ['archive','archive-sha256','previous-receipt','restore-directory','receipt','library-file-id','file-id']:
 p.add_argument('--'+name,required=True)
p.add_argument('--archive-bytes',required=True,type=int)
p.add_argument('--root',default='.')
a=p.parse_args()
root=Path(a.root).resolve();archive=Path(a.archive).resolve();prior_path=Path(a.previous_receipt).resolve();restored=Path(a.restore_directory).resolve();output=Path(a.receipt).resolve()
# Guard first, before extraction, fetch, checkout, or touching any historical receipt.
assert not output.exists(),'Receipt already exists; never overwrite prior restore evidence'
assert output.parent.is_dir() and output!=prior_path
assert restored!=root and root not in restored.parents,'Restoration must use independent Git store'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert archive.stat().st_size==a.archive_bytes and sha(archive.read_bytes())==a.archive_sha256
prior_bytes=prior_path.read_bytes();prior=json.loads(prior_bytes);directory=archive.parent
with zipfile.ZipFile(archive) as z:
 candidate=json.loads(z.read('checkpoint-receipt.json'))
 validate_prerequisite(candidate,prior,prior_bytes,root)  # reject before extraction or Git mutation
 assert candidate['bundle']['file']=='box3d-rebuild-incremental.bundle'
 with z.open(candidate['bundle']['file']) as stream:bundle_header=validate_bundle_header(stream,candidate)
 rows=json.loads(z.read('archive-manifest.json'))
 assert set(z.namelist())=={r['path']for r in rows}|{'archive-manifest.json'}
 for row in rows:
  assert Path(row['path']).name==row['path'] and not (directory/row['path']).exists()
  data=z.read(row['path']);assert len(data)==row['bytes'] and sha(data)==row['sha256']
 for row in rows:(directory/row['path']).write_bytes(z.read(row['path']))
receipt_path=directory/'checkpoint-receipt.json';receipt=json.loads(receipt_path.read_bytes());bundle=directory/receipt['bundle']['file']
assert bundle.name=='box3d-rebuild-incremental.bundle'
assert bundle.stat().st_size==receipt['bundle']['bytes'] and sha(bundle.read_bytes())==receipt['bundle']['sha256']
prerequisite=validate_prerequisite(receipt,prior,prior_bytes,root)
commands=[]
def run(args):
 r=subprocess.run(args,capture_output=True,text=True);commands.append({'command':args,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
for args in [['status','--porcelain','--untracked-files=all'],['ls-files','--others','--ignored','--exclude-standard']]:
 assert not run(['git','-C',str(restored),*args]).strip()
code="const fs=require('fs');const {verifyRestored}=require(process.argv[1]);console.log(JSON.stringify(verifyRestored(process.argv[3],JSON.parse(fs.readFileSync(process.argv[2])))));"
def verify(path):return json.loads(run(['node','-e',code,str(root/'tools/verify/box3d/rebuild-checkpoint.cjs'),str(path),str(restored)]))
before=verify(prior_path)
for args in [['bundle','verify',str(bundle)],['fetch',str(bundle),'refs/heads/feat/box3d-rebuild-20261022'],['merge-base','--is-ancestor',prior['commit'],receipt['commit']],['checkout','--detach',receipt['commit']]]:
 run(['git','-C',str(restored),*args])
after=verify(receipt_path)
manifest=receipt['evidenceClosure']['manifest'];assert not Path(manifest).is_absolute() and '..'not in Path(manifest).parts
assert sha((restored/manifest).read_bytes())==receipt['evidenceClosure']['manifestSha256']
closure=json.loads(run(['python',str(restored/'tools/verify/box3d/evidence-closure.py'),'--root',str(restored),'--manifest',manifest,'--require-commit']))
assert closure['status']=='PASS_SCOPED_COMPLETED_EVIDENCE_CLOSURE'and closure['committedSnapshot']==receipt['commit']
assert not run(['git','-C',str(restored),'status','--porcelain','--untracked-files=all']).strip()
assert prior_path.read_bytes()==prior_bytes and not output.exists()
result={'status':'PASS_ACTUAL_LIBRARY_DOWNLOAD_INCREMENTAL_INDEPENDENT_STORE_FULL_FILE_VERIFICATION','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'libraryFileId':a.library_file_id,'fileId':a.file_id,'archive':{'bytes':a.archive_bytes,'sha256':a.archive_sha256},'commit':receipt['commit'],'tree':receipt['tree'],'bundle':receipt['bundle'],'reusedRestoreDirectory':str(restored),'previousVerifiedCommit':prior['commit'],'exactPrerequisite':prerequisite,'bundleHeader':bundle_header,'beforeVerification':before,'afterVerification':after,'evidenceClosure':closure,'newFullCloneCreated':False,'priorReceiptPreserved':True,'priorReceiptSha256':sha(prior_bytes),'commands':commands,'scope':'Honest partial-main local Git source restoration and explicit completed evidence inventory, no physical acceptance.'}
with output.open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
os.setxattr(archive,'user.library-file-version',b'0')
print(json.dumps({'status':result['status'],'commit':receipt['commit'],'receipt':str(output),'files':len(receipt['files']),'evidenceClosure':closure}))
