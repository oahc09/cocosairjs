from pathlib import Path
import json,hashlib,re
root=Path('.');cp=root/'tools/physics/box3d/output/snapshot-checkpoint-20261022-g';old=root/'tools/physics/box3d/output/patch-staged-checkpoint-20261022-e/inputs'
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def j(p):return json.loads(p.read_text())
# Verify archived e source inputs against its actual build receipt before comparing.
e=j(root/'tools/physics/box3d/output/wasm-patch-release-20261022-e/build-receipt.json')
for x in e['inputHashes']:assert h(old/x['path'])==x['sha256'],x['path']
a=j(old/'tools/physics/box3d/abi-schema.json');b=j(root/'tools/physics/box3d/abi-schema.json')
fields=['schemaVersion','coreSha','abiVersion','byteOrder','precision','worldId','bodyShapeId','bodyInput','bodyInputFloats','bodySnapshot','bodySnapshotFloats','worldCountsUint32','rayInputFloats','rayOutputFloats','shapeIdWords']
for f in fields:assert a[f]==b[f],f
for k,v in a['statuses'].items():assert b['statuses'][k]==v
ah=(old/'tools/physics/box3d/native/air_box3d.h').read_text();bh=(root/'tools/physics/box3d/native/air_box3d.h').read_text()
declarations=[s for s in ah.splitlines() if re.match(r'^(const char\*|uint32_t|int|void) air_b3_.*;',s)]
for d in declarations:assert d in bh,d
ac=(old/'tools/physics/box3d/native/air_box3d.c').read_text();bc=(root/'tools/physics/box3d/native/air_box3d.c').read_text()
start=bc.index('int air_b3_shape_sphere_ex(');end=bc.index('int air_b3_shape_box(',start)
assert bc[:start]+bc[end:]==ac,'Preexisting C shim bodies must remain byte identical'
ae=j(old/'tools/physics/box3d/exports.json');be=j(root/'tools/physics/box3d/exports.json');assert be[:len(ae)]==ae
r={'status':'PASS_SOURCE_ADDITIVE_REVIEW','scope':'Source/schema compatibility only, not proof of complete binary ABI or T07','oldSchemaSha256':h(old/'tools/physics/box3d/abi-schema.json'),'newSchemaSha256':h(root/'tools/physics/box3d/abi-schema.json'),'preservedSchemaFields':fields,'preservedStatusCodes':a['statuses'],'preservedCDeclarations':declarations,'preexistingCShimBodiesByteIdentical':True,'preservedExportCount':len(ae),'addedExports':be[len(ae):],'runnerSha256':h(Path(__file__))}
(cp/'additive-abi-review.raw.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'status':r['status'],'preservedCDeclarations':len(declarations),'addedExports':len(be)-len(ae)}))
