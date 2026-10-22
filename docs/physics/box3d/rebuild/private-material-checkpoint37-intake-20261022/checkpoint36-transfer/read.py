from pathlib import Path
import sys,json,subprocess,hashlib,base64
here=Path(__file__).resolve().parent;root=here.parent/'box3d-rebuild-20261022';mode,key,offset,length=sys.argv[1:];offset=int(offset);length=int(length);assert 0<=offset and 0<length<=240000
if mode=='metadata':s=(here/'metadata.json').read_text()
else:
 assert mode=='blob';meta=json.loads((here/'metadata.json').read_text());v=next(x for x in meta['contents']if x['sha']==key);data=subprocess.check_output(['git','cat-file','blob',key],cwd=root);assert len(data)==v['bytes']and hashlib.sha256(data).hexdigest()==v['sha256'];assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==key;s=data.decode('utf8')if v['encoding']=='utf-8'else base64.b64encode(data).decode();assert len(s)==v['chars']
print(json.dumps({'offset':offset,'total':len(s),'part':s[offset:offset+length]},ensure_ascii=False))
