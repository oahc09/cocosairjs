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
"""Committed source bundle with mandatory scoped evidence closure and full Git-blob identity manifest."""
from pathlib import Path
import json,subprocess,hashlib,datetime,zipfile,argparse
parser=argparse.ArgumentParser();parser.add_argument("--root",default=".");parser.add_argument("--output",required=True);parser.add_argument("--expected-head",required=True);parser.add_argument("--evidence-manifest",required=True);args=parser.parse_args()
root=Path(args.root).resolve();out=Path(args.output).resolve();assert out!=root and root not in out.parents,'Output must be outside repository';assert not out.exists(),'Never overwrite prior source receipt'
qualified=json.loads(subprocess.check_output(['python',str(root/'tools/verify/box3d/evidence-closure.py'),'--root',str(root),'--manifest',args.evidence_manifest,'--require-commit']))
assert qualified['status']=='PASS_SCOPED_COMPLETED_EVIDENCE_CLOSURE';assert qualified['committedSnapshot']==args.expected_head
out.mkdir()
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
base='e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6';head=git('rev-parse','HEAD').decode().strip();assert head==args.expected_head;branch='feat/box3d-rebuild-20261022';assert git('symbolic-ref','--short','HEAD').decode().strip()==branch;git('merge-base','--is-ancestor',base,head)
bundle=out/'box3d-rebuild-incremental.bundle';git('bundle','create',str(bundle),f'{base}..refs/heads/{branch}');git('bundle','verify',str(bundle))
rows=[]
for line in git('ls-tree','-rz',head).split(b'\0'):
 if not line:continue
 header,path=line.split(b'\t');mode,kind,blob=header.decode().split();assert kind=='blob';rows.append({'path':path.decode(),'mode':mode,'gitBlobSha1':blob})
proc=subprocess.Popen(['git','cat-file','--batch'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE);identities={}
for blob in sorted({row['gitBlobSha1']for row in rows}):
 proc.stdin.write((blob+'\n').encode());proc.stdin.flush();h=proc.stdout.readline().decode().split();assert h[0]==blob and h[1]=='blob';size=int(h[2]);data=proc.stdout.read(size);assert len(data)==size and proc.stdout.read(1)==b'\n';assert hashlib.sha1(b'blob '+str(size).encode()+b'\0'+data).hexdigest()==blob;identities[blob]={'bytes':size,'sha256':hashlib.sha256(data).hexdigest()}
proc.stdin.close();assert proc.wait()==0
for row in rows:row.update(identities[row['gitBlobSha1']])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt={'schemaVersion':1,'kind':'INCREMENTAL_SOURCE_GIT_CHECKPOINT_REQUIRES_BASE_NOT_PHYSICAL_ACCEPTANCE','createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':head,'tree':git('rev-parse','HEAD^{tree}').decode().strip(),'branch':branch,'committedOnly':True,'bundleOnly':True,'evidenceClosure':{'manifest':args.evidence_manifest,'manifestSha256':hashlib.sha256((root/args.evidence_manifest).read_bytes()).hexdigest(),'verification':qualified},'prerequisite':{'commit':base,'libraryFileId':'libfile_10c86f5827f481919e3938fbb0c2670b','archive':'Box3D-unified-native-source-checkpoint-20261022.zip','archiveBytes':21016077,'archiveSha256':'9d8f9c238864c24fe97b43d6120575d0f694009c0973b0653dfa6a11d2c4871a','scope':'Requires independently verified full checkpoint22 object store; cannot restore standalone.'},'excludedWorkingTreeStatus':git('status','--porcelain').decode().strip().split('\n'),'refs':git('bundle','list-heads',str(bundle)).decode().strip().split('\n'),'history':git('log',f'{base}..{head}','--format=%H %P %s').decode().strip().split('\n'),'files':rows,'bundle':{'file':bundle.name,'bytes':bundle.stat().st_size,'sha256':sha(bundle)},'localRestore':{'status':'NOT_RUN','reason':'Actual Library download incremental restore verifies full resulting tree.'},'buildClosureVerified':False,'physicalAcceptance':'NOT_RUN','libraryRoundTrip':'PENDING_EXTERNAL_STEP','manifestMethod':'Streaming git cat-file --batch; each unique Git blob header and SHA-1 recomputed before SHA-256; all tracked rows mapped to verified object bytes.'}
(out/'checkpoint-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');manifest=[{'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p)}for p in [bundle,out/'checkpoint-receipt.json']];(out/'archive-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');archive=out/'Box3D-source-incremental-checkpoint.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in [bundle,out/'checkpoint-receipt.json',out/'archive-manifest.json']:z.write(p,p.name)
with zipfile.ZipFile(archive) as z:
 for row in manifest:
  b=z.read(row['path']);assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256']
print(json.dumps({'commit':head,'files':len(rows),'uniqueBlobs':len(identities),'archive':{'bytes':archive.stat().st_size,'sha256':sha(archive)},'bundle':receipt['bundle']}))
