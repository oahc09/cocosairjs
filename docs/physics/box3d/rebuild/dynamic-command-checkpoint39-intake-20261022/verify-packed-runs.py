# Copyright (c) 2026-2027 oahc09@gmail.com
# SPDX-License-Identifier: MIT
"""Read named actual-run receipts, inputs, raw observations and stream/exit links from CAS bytes.
The complete all-object verifier is separate. Native binaries stay explicitly external.
"""
from pathlib import Path
import argparse,zipfile,json,hashlib
p=argparse.ArgumentParser();p.add_argument('--archive',required=True);a=p.parse_args();archive=Path(a.archive);sha=lambda b:hashlib.sha256(b).hexdigest();count=0;runs=0;inputs=0
with zipfile.ZipFile(archive)as z:
 manifest=json.loads(z.read('inventory.json'));files={r['path']:r for r in manifest['files']}
 def read(name):
  global count
  row=files[name];b=z.read('objects/'+row['sha256']);assert len(b)==row['bytes']and sha(b)==row['sha256'];count+=1;return b
 def doc(name):return json.loads(read(name))
 def asserted(name,h):
  b=read(name);assert sha(b)==h,(name,h);return b
 dynamic=doc('evidence-review/verification-a.json');material=doc('evidence-review/material-verification.json');current=None
 for row in dynamic['attempts']:
  base='actual/'+row['attempt']+'/';r=json.loads(asserted(base+'receipt.json',row['receipt']['sha256']));n=json.loads(asserted(base+'native-and-app.raw.json',row['raw']['sha256']));assert sha(read(base+'native-and-app.raw.json'))==r['nativeReportSha256']
  for rel,h in r['sourceHashesBefore'].items():asserted(base+'inputs/'+rel,h);inputs+=1
  assert r['sourceHashesBefore']==r['sourceHashesAfter']and r['inputsUnchanged']
  for log in row['logs']:
   name='actual/'+str(Path(log['path']).relative_to('/tmp/box3d-actual-command-fixture-20261022'));assert len(asserted(name,log['sha256']))==log['bytes']
  if row['currentFinalHarness']:
   if current is None:current=r['sourceHashesBefore']
   else:assert current==r['sourceHashesBefore']
   assert r['status']==row['status']and n['status']==r['status']
  runs+=1
 for row in material['cases']:
  base='material-regression/'+row['attempt']+'/';r=json.loads(asserted(base+'receipt.json',row['receiptSha256']));asserted(base+'native-and-app.raw.json',row['rawSha256']);assert r['nativeReportSha256']==row['rawSha256']
  for rel,h in r['sourceHashesBefore'].items():asserted(base+'inputs/'+rel,h);inputs+=1
  for log in row['logs']:
   name='material-regression/'+str(Path(log['path']).relative_to('/tmp/box3d-dynamic-material-regression-20261022'));assert len(asserted(name,log['sha256']))==log['bytes']
  assert r['status']=='PASS_LIMITED_PRIVATE_MATERIAL'and r['sourceHashesBefore']==r['sourceHashesAfter'];runs+=1
 freeze=doc('owner/frozen-f/source-manifest.json')
 for row in freeze['files']:
  assert current[row['path']]==row['sha256'];asserted('owner/frozen-f/'+row['path'],row['sha256'])
 assert read('material-regression/frozen-product-before.json')==read('material-regression/frozen-product-after.json')
print(json.dumps({'status':'PASS_ALL_NAMED_ACTUAL_RUN_HASH_LINKS_FROM_PACKED_BYTES','archiveSha256':sha(archive.read_bytes()),'runs':runs,'inputCopies':inputs,'namedReadsAndHashAssertions':count,'currentDynamicPassCases':dynamic['currentPassCases'],'currentDynamicBlockedCases':dynamic['currentBlockedCases'],'currentDynamicAssertions':dynamic['currentPassRawAssertions'],'materialCases':len(material['cases']),'materialAssertions':material['rawAssertions'],'scope':'Exact named actual-run references and frozen-f product bytes. All-object/mode verification separate. Native binary/toolchain external archive explicit; no blanket closure of every arbitrary JSON string or historical external reference.'}))
