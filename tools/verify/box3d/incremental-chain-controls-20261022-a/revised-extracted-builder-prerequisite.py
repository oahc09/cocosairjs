base='e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6'
prerequisite={'commit':base,'libraryFileId':'libfile_10c86f5827f481919e3938fbb0c2670b','archive':'Box3D-unified-native-source-checkpoint-20261022.zip','archiveBytes':21016077,'archiveSha256':'9d8f9c238864c24fe97b43d6120575d0f694009c0973b0653dfa6a11d2c4871a','scope':'Requires independently verified full checkpoint22 object store; cannot restore standalone.'}
assert bool(args.prerequisite_source_receipt)==bool(args.prerequisite_library_receipt),'Both exact prerequisite receipts are mandatory for a chained increment'
if args.prerequisite_source_receipt:
 source_path=Path(args.prerequisite_source_receipt).resolve();library_path=Path(args.prerequisite_library_receipt).resolve()
 source_bytes=source_path.read_bytes();library_bytes=library_path.read_bytes();source=json.loads(source_bytes);library=json.loads(library_bytes)
 assert library['status']=='PASS_ACTUAL_LIBRARY_DOWNLOAD_INCREMENTAL_INDEPENDENT_STORE_FULL_FILE_VERIFICATION'
 assert source['commit']==library['commit'] and source['tree']==library['tree'] and source['bundle']==library['bundle']
 assert source['committedOnly'] is True and source['branch']=='feat/box3d-rebuild-20261022'
 assert library['afterVerification']['status']=='PASS' and library['afterVerification']['checkedFiles']==len(source['files'])
 assert library['evidenceClosure']['status']=='PASS_SCOPED_COMPLETED_EVIDENCE_CLOSURE'
 base=source['commit']
 assert source['prerequisite']['commit']=='e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6','This bounded chain currently supports an exact base22 cumulative prerequisite only'
 prerequisite={'commit':base,'tree':source['tree'],'ancestors':[source['prerequisite']],'libraryFileId':library['libraryFileId'],'fileId':library['fileId'],'archiveBytes':library['archive']['bytes'],'archiveSha256':library['archive']['sha256'],'sourceCheckpointReceiptSha256':hashlib.sha256(source_bytes).hexdigest(),'libraryRestoreReceiptPath':str(library_path.relative_to(root)),'libraryRestoreReceiptSha256':hashlib.sha256(library_bytes).hexdigest(),'scope':'Requires this exact independently Library-restored prerequisite checkpoint and its recorded predecessor chain. Not a standalone/full repository bundle.'}
