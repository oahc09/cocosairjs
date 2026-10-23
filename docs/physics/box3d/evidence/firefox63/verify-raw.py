from pathlib import Path
import gzip,hashlib,json
p=Path(__file__).resolve().parent
m=json.loads((p/'manifest.json').read_text())
for x in m['files']:
 b=(p/x['path']).read_bytes()
 assert len(b)==x['bytes'] and hashlib.sha256(b).hexdigest()==x['sha256'],x['path']
 if 'uncompressedSha256' in x:
  raw=gzip.decompress(b)
  assert len(raw)==x['uncompressedBytes'] and hashlib.sha256(raw).hexdigest()==x['uncompressedSha256']
  assert json.loads(raw)['acceptancePassed'] is False
print(json.dumps({'status':'PASS_RAW_BYTE_CLOSURE_ONLY','files':len(m['files']),'formalGate':'NOT_RUN'}))
