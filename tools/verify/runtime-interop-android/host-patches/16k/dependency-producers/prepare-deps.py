"""Materialize isolated 16KB inputs without modifying previous candidates."""
from pathlib import Path, PurePosixPath
import hashlib, json, shutil, zipfile
from datetime import datetime, timezone

DEPS=Path(__file__).resolve().parent
BASE=DEPS.parent
OLD=BASE/'deps-static-attempt-1'
SDL=BASE/'16k-assessment-sdl-1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for name in ['v8','dawn','skia']:
    target=DEPS/name
    assert not target.exists(),target
    shutil.copytree(OLD/name,target)
    for p in sorted((OLD/name).rglob('*')):
        if not p.is_file():continue
        rel=p.relative_to(OLD)
        expected=sha(p)
        assert sha(DEPS/rel)==expected
        rows.append(dict(file=str(rel).replace('\\','/'),bytes=p.stat().st_size,sha256=expected,source='../deps-static-attempt-1/'+str(rel).replace('\\','/')))
downloads=DEPS/'downloads';downloads.mkdir()
for filename in ['published-metadata.json','download-receipt.json','final-assessment.json','SDL3-devel-3.2.30-android.zip']:
    src=SDL/filename
    shutil.copyfile(src,downloads/filename)
    assert sha(src)==sha(downloads/filename)
assert sha(downloads/'SDL3-devel-3.2.30-android.zip')=='0525e4bc9cc1370e6d664ec93c927846e311c19a819de05a232bca452b0e3a7a'
sdlroot=DEPS/'sdl3';sdlroot.mkdir()
aar=SDL/'attempt-2/candidate/SDL3-3.2.30.aar'
assert sha(aar)=='ac582807f04c82a8cb80140ce6321598848da4a632fd4531874c60df8e019837'
shutil.copyfile(aar,sdlroot/aar.name)
extracted=sdlroot/'extracted';extracted.mkdir()
with zipfile.ZipFile(sdlroot/aar.name) as z:
    for entry in z.infolist():
        part=PurePosixPath(entry.filename)
        assert not part.is_absolute() and '..' not in part.parts
        target=extracted.joinpath(*part.parts)
        if entry.is_dir():target.mkdir(parents=True,exist_ok=True);continue
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(z.read(entry))
        assert sha(target)==hashlib.sha256(z.read(entry)).hexdigest()
    assert json.loads(z.read('description.json'))['version']=='3.2.30'
for p in sorted(sdlroot.rglob('*')):
    if p.is_file():rows.append(dict(file=str(p.relative_to(DEPS)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p),source='Official SDL 3.2.30 AAR / ac582807f04c82a8cb80140ce6321598848da4a632fd4531874c60df8e019837'))
originals=DEPS/'original-receipts';originals.mkdir()
receipt_names=['download-manifest.json','download-manifest-x64.json','v8-download-receipt.json','v8-download-receipt-x64.json','x64-header-equivalence.json','reused-dependencies.json','reused-dependencies-x64.json']
receipt_rows=[]
for name in receipt_names:
    shutil.copyfile(OLD/name,originals/name)
    assert sha(OLD/name)==sha(originals/name)
    receipt_rows.append(dict(file='original-receipts/'+name,sha256=sha(originals/name),source='../deps-static-attempt-1/'+name))
report=dict(schema='mystral-android-16kb-materialized-inputs-v1',completed=True,passVerified=True,createdAt=datetime.now(timezone.utc).isoformat(),
    sourceDeps='../deps-static-attempt-1',sdlVersion='3.2.30',sdlZipSha256=sha(downloads/'SDL3-devel-3.2.30-android.zip'),sdlAarSha256=sha(sdlroot/aar.name),files=rows,originalReceipts=receipt_rows)
with (DEPS/'dependency-inputs.json').open('x',encoding='utf-8') as f:json.dump(report,f,indent=2);f.write('\n')
print(json.dumps(dict(passVerified=True,files=len(rows),bytes=sum(r['bytes'] for r in rows),sdlAarSha256=report['sdlAarSha256'])))
