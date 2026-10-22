prior_bytes=prior_path.read_bytes()
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
