from pathlib import Path
import subprocess,json,hashlib,collections,base64
root=Path('/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022');out=Path(__file__).resolve().parent
def git(*a):return subprocess.check_output(['git',*a],cwd=root)
def tree(rev):
 d={}
 for line in git('ls-tree','-rz',rev).split(b'\0'):
  if not line:continue
  h,n=line.split(b'\t');m,t,s=h.decode().split();d[n.decode()]={'mode':m,'type':t,'sha':s}
 return d
base='9df645b4a84e73c86ffd460b59cbd6e2ab732cbb';head=git('rev-parse','HEAD').decode().strip();assert head=='45b526f248575a0542af8eed591c0cf8c8a1ba8d';a,b=tree(base),tree(head);assert not(set(a)-set(b));known={x['sha']for x in a.values()};rows=[{'path':p,**v}for p,v in b.items()if a.get(p)!=v];counts=collections.Counter(r['sha']for r in rows);contents=[]
p=subprocess.Popen(['git','cat-file','--batch'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for sha in sorted({x['sha']for x in rows}-known):
 p.stdin.write((sha+'\n').encode());p.stdin.flush();hdr=p.stdout.readline().decode().split();assert hdr[:2]==[sha,'blob'];n=int(hdr[2]);data=p.stdout.read(n);assert p.stdout.read(1)==b'\n';assert hashlib.sha1(b'blob '+str(n).encode()+b'\0'+data).hexdigest()==sha
 try:text=data.decode('utf8');encoding='utf-8'
 except UnicodeDecodeError:text=base64.b64encode(data).decode();encoding='base64'
 payloadBytes=len(json.dumps({'repository_full_name':'oahc09/cocosairjs','encoding':encoding,'content':text},ensure_ascii=False).encode());assert payloadBytes<16*1024*1024-131072
 contents.append({'sha':sha,'bytes':n,'sha256':hashlib.sha256(data).hexdigest(),'encoding':encoding,'chars':len(text),'argumentBytes':payloadBytes,'transfer':'blob'if counts[sha]>1 or n>120000 or encoding=='base64'else'inline'})
p.stdin.close();assert p.wait()==0
bysha={x['sha']:x for x in contents}
for row in rows:row['transfer']='known-remote-sha'if row['sha']in known else bysha[row['sha']]['transfer']
d={'repository':'oahc09/cocosairjs','branch':'feat/box3d-rebuild-20261022','localBase':base,'localHead':head,'remoteParent':'9d7a4040ccf9e70b404d484ae741982f4a101074','baseTree':'06763d494a2faec3e5eb3fd95e6594131d22512d','rows':rows,'blobs':[x for x in contents if x['transfer']=='blob'],'contents':contents,'transport':'BOUNDED_GIT_OBJECT_READS_NO_DUPLICATE_PAYLOAD_OR_CHUNK_FILES'}
s=json.dumps(d,separators=(',',':'),ensure_ascii=False);(out/'metadata.json').write_text(s);m={'localHead':head,'rows':len(rows),'unknown':len(contents),'blobUploads':len(d['blobs']),'inlineRows':sum(x['transfer']=='inline'for x in rows),'metadataChars':len(s),'metadataSha256':hashlib.sha256(s.encode()).hexdigest(),'totalUniquePayloadBytes':sum(x['bytes']for x in contents),'noPayloadOrChunkFiles':True};(out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(m))
