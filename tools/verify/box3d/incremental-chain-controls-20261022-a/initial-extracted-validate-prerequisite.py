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
