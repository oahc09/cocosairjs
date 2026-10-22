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
