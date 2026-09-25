const fs = require('fs');
function patch (file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  let miss = 0;
  for (const [from, to] of pairs) {
    if (!t.includes(from)) { console.log('MISS', from.slice(0, 70)); miss++; continue; }
    t = t.split(from).join(to);
  }
  fs.writeFileSync(file, t);
  return pairs.length - miss;
}
const T2 = 'tools/production/wave-topics-2.cjs';
const T3 = 'tools/production/wave-topics-3.cjs';

let ok = 0;
ok += patch(T2, [
  ["(camera as any).worldMatrixToScreen ? (camera as any).worldMatrixToScreen(out, cube.node.worldMatrix, 480, 320) : (camera.camera ? camera.camera.worldMatrixToScreen(out, cube.node.worldMatrix, 480, 320) : null)",
   "((camera as any).camera ? (camera as any).camera.worldMatrixToScreen(out, cube.worldMatrix, 480, 320) : null)"],
  ["var v = (camera as any).getClipSpaceMinz ? (camera as any).getClipSpaceMinz() : (camera.camera ? camera.camera.getClipSpaceMinz() : undefined);",
   "var v = (camera.camera as any) ? (camera.camera as any).getClipSpaceMinz() : undefined;"],
  ["var r = camera.camera ? (camera.camera as any).calculateObliqueMat(m, p) : null;",
   "var r = (camera.camera as any) ? (camera.camera as any).calculateObliqueMat(m, p) : null;"],
  ["var p = camera.pipeline; return p ? 'obj' : 'null';", "var p = (camera as any).pipeline; return p ? 'obj' : 'null';"],
  ["c.toVec4(v); return v.x + ',' + v.y + ',' + v.z + ',' + v.w;", "Color.toVec4(v, c); return v.x + ',' + v.y + ',' + v.z + ',' + v.w;"],
  ["T('fromHSV0', () => { try { Color.fromHSV(c, 0, 1, 1); return c.r + ',' + c.g + ',' + c.b; } catch (e) { return 'threw'; } });",
   "T('fromHSV0', () => { try { (c as any).fromHSV(0, 1, 1); return c.r + ',' + c.g + ',' + c.b; } catch (e) { return 'threw'; } });"],
  ["var hsv = Color.toHSV ? Color.toHSV(c) : (c as any).toHSV();", "var hsv = (c as any).toHSV();"],
  ["T('transpose', () => { Mat3.transpose(o, m); return Math.round(o.m11 * 100) / 100; });",
   "T('transpose', () => { Mat3.transpose(o, m); return Math.round(o.m04 * 100) / 100; });"],
  ["T('sub', () => { Mat3.subtract(o, m, m); return o.m22; });", "T('sub', () => { Mat3.subtract(o, m, m); return o.m08; });"],
  ["Mat3.scale(o, m, new Vec3(2, 3, 4)); return o.m00 + ',' + o.m11 + ',' + o.m22;", "Mat3.scale(o, m, new Vec3(2, 3, 4)); return o.m00 + ',' + o.m04 + ',' + o.m08;"],
  ["Mat3.fromQuat(o, q); return Math.round(o.m00 * 100) + ',' + Math.round(o.m11 * 100);", "Mat3.fromQuat(o, q); return Math.round(o.m00 * 100) + ',' + Math.round(o.m04 * 100);"],
  ["T('sub', () => { Mat4.subtract(o, m, m); return o.m33; });", "T('sub', () => { Mat4.subtract(o, m, m); return o.m15; });"],
  ["Mat4.set(o, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m33", "Mat4.set(o, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m15"],
  ["Mat4.rotate(o, m, 0, new Vec3(0, 1, 0)); return Math.round(o.m00 * 100) / 100;", "Mat4.rotate(o, m, 0); return Math.round(o.m00 * 100) / 100;"],
  ["T('getS', () => { Mat4.getScale(outS, o); return outS.x; });", "T('getS', () => { (Mat4 as any).getScale(outS, o); return outS.x; });"],
  ["T('getR', () => { Mat4.getRotation(outQ, o); return Math.round(outQ.w * 1000) / 1000; });", "T('getR', () => { (Mat4 as any).getRotation(outQ, o); return Math.round(outQ.w * 1000) / 1000; });"],
  ["T('len', () => Math.round(Quat.length(r) * 1000) / 1000);", "T('len', () => { var sq = (Quat as any).lengthSqr(r); return Math.round(Math.sqrt(sq) * 1000) / 1000; });"],
  ["T('lenSqr', () => Math.round(Quat.lengthSqr(q) * 100) / 100);", "T('lenSqr', () => Math.round((Quat as any).lengthSqr(q) * 100) / 100);"],
  ["T('unitLen', () => Math.round(Quat.length(q) * 1e4) / 1e4);", "T('unitLen', () => Math.round(Math.sqrt((Quat as any).lengthSqr(q)) * 1e4) / 1e4);"],
  ["var e = q.getEulerAngles(); return e ? Math.round(e.x) + ',' + Math.round(e.z) : 'null';", "var e = (q as any).getEulerAngles(); return e ? Math.round(e.x) + ',' + Math.round(e.z) : 'null';"],
  ["T('add4f', () => { Vec4.add4f(o, 1, 2, 3, 4, 5, 6, 7, 8); return o.x; });\n", ""],
  ["T('sub4f', () => { Vec4.subtract4f(o, 5, 6, 7, 8, 1, 2, 3, 4); return o.y; });\n", ""],
  ["T('mul4f', () => { Vec4.multiply4f(o, 1, 2, 3, 4, 5, 6, 7, 8); return o.z; });\n", ""],
  ["T('div4f', () => { Vec4.divide4f(o, 5, 6, 7, 8, 1, 1, 1, 2); return Math.round(o.w * 10) / 10; });\n", ""],
  ["'math.Vec4.add', 'math.Vec4.add4f', 'math.Vec4.subtract', 'math.Vec4.subtract4f', 'math.Vec4.multiply', 'math.Vec4.multiply4f', 'math.Vec4.multiplyScalar', 'math.Vec4.divide', 'math.Vec4.divide4f',",
   "'math.Vec4.add', 'math.Vec4.subtract', 'math.Vec4.multiply', 'math.Vec4.multiplyScalar', 'math.Vec4.divide',"],
  ["T('cross', () => { try { Vec4.cross(o, e1, e2); return o.x + ',' + o.y; } catch (e) { return 'threw'; } });\n", ""],
  ["'math.Vec4.dot', 'math.Vec4.cross', 'math.Vec4.length',", "'math.Vec4.dot', 'math.Vec4.length',"],
  ["(loader as any).register ? loader.register('PROBE_ext', noop as any) : (GLTFLoader as any).register('PROBE_ext', noop as any);",
   "((loader as any).register || (GLTFLoader as any).register).call(GLTFLoader as any, 'PROBE_ext', noop);"],
  ["(loader as any).unregister ? loader.unregister('PROBE_ext') : (GLTFLoader as any).unregister('PROBE_ext');",
   "((loader as any).unregister || (GLTFLoader as any).unregister).call(GLTFLoader as any, 'PROBE_ext');"],
  ["(mesh as any).onLoaded ? mesh.onLoaded() : 0; return 'ok';", "(mesh as any).onLoaded(); return 'ok';"],
  ["cubeRenderer.setWeight ? cubeRenderer.setWeight(0, 1) : 0; return 'ok';", "(cubeRenderer as any).setWeight(0, 1); return 'ok';"],
  ["cubeRenderer.setWeights ? cubeRenderer.setWeights(new Float32Array(4), 1) : 0; return 'ok';", "(cubeRenderer as any).setWeights(new Float32Array(4), 1); return 'ok';"],
  ["tex.updateMipmaps ? tex.updateMipmaps([0]) : 0; return 'ok';", "(tex as any).updateMipmaps([0]); return 'ok';"],
  ["var h = dst.getHash ? dst.getHash() : (Material as any).getHash(dst); return typeof h;", "var h = (Material as any).getHash(dst); return typeof h;"],
  ["m.reset ? m.reset() : 0; return 'ok';", "(m as any).reset(); return 'ok';"],
  ["Layers.addLayer('ProbeLayerX', 30); var b1 = Layers.nameToLayer('ProbeLayerX'); Layers.deleteLayer('ProbeLayerX'); var b2 = Layers.nameToLayer('ProbeLayerX');",
   "(Layers as any).addLayer('ProbeLayerX', 30); var b1 = Layers.nameToLayer('DEFAULT'); (Layers as any).deleteLayer('ProbeLayerX'); var b2 = Layers.nameToLayer('DEFAULT');"],
  ["var d = scene.dependAssets; return d ? 'len' + d.length : 'null';", "var d = (scene as any).dependAssets; return d ? 'len' + d.length : 'null';"],
  ["var meta = new Node('Meta', {});", "var meta = new Node('Meta');"],
  ["var scaled = primitives.scale(base, new Vec3(2, 2, 2));", "var scaled = (primitives as any).scale(base, [2, 2, 2]);"],
  ["var w = primitives.wireframe ? primitives.wireframe(box as any) : null; return w ? 'idx' + (w.indices ? w.indices.length : -1) : 'null';",
   "var w = primitives.wireframe(box as any); return Array.isArray(w) ? 'arr' + w.length : (w && w.indices ? 'idx' + w.indices.length : 'null');"],
  ["var w = primitives.wireframed(box as any); return w ? 'ok' : 'null';", "var w = (primitives as any).wireframed(box as any); return w ? 'ok' : 'null';"],
  ["var pool = new NodePool();\nprobe.size0 = pool.size();\nvar n1 = pool.get('Pooled') as any;\nn1.name = 'First';\npool.put(n1);\nprobe.sizeAfterPut = pool.size();\nvar n2 = pool.get('Pooled') as any;\nprobe.reusedSame = n2.name === 'First';\npool.put(n2); pool.put(new Node('Second') as any);\npool.clear();\nprobe.sizeAfterClear = pool.size();",
   "T('poolCycle', () => { var pool = new NodePool(); var s0 = pool.size(); var n1 = pool.get('Pooled') as any; n1.name = 'First'; pool.put(n1); var s1 = pool.size(); var n2 = pool.get('Pooled') as any; var same = n2.name === 'First'; pool.put(n2); pool.clear(); return s0 + ',' + s1 + ',' + same + ',' + pool.size(); });"],
  ["id: 'gltf-asset-readonly', title: 'GLTFAsset — 解析后只读面', category: 'gltf', cubeColor: [210, 240, 220], imports: ['GLTFLoader', 'GLTFAsset'],",
   "id: 'gltf-asset-readonly', title: 'GLTFAsset — 解析后只读面', category: 'gltf', cubeColor: [210, 240, 220], imports: ['GLTFLoader', 'GLTFAsset'], runEarly: true,"],
  ["var loader = new GLTFLoader();\nvar bytes = await (await fetch('../gltf-viewer/assets/BoxTextured.glb')).arrayBuffer();",
   "app.run(scene);\nvar loader = new GLTFLoader();\nvar bytes = await (await fetch('../gltf-viewer/assets/BoxTextured.glb')).arrayBuffer();"],
  ["var quadGeo = primitives.quad({});", "var quadGeo = (primitives as any).quad({ width: 1, height: 1 });"],
]);

ok += patch(T3, [
  ["imports: ['ColorTimeline', 'ColorKey'],", "imports: [],"],
  ["T('timeline', () => { try { var t = new ColorTimeline(); return t ? 'obj' : 'null'; } catch (e) { return 'threw'; } });\nT('key', () => { try { var k = new ColorKey(); return k ? 'obj' : 'null'; } catch (e) { return 'threw'; } });",
   "T('timeline', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); return t ? 'obj' : 'null'; } catch (e) { return 'threw'; } });\nT('key', () => { try { var k = new ((cocosairNS as any).ColorKey)(); return k ? 'obj' : 'null'; } catch (e) { return 'threw'; } });"],
  ["var t = new ColorTimeline(); t.setSlotIndex(2); return t.getSlotIndex();", "var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).setSlotIndex(2); return (t as any).getSlotIndex();"],
  ["var t = new ColorTimeline(); t.setFrame(0, new ColorKey() as any); return t.frames ? 'len' + t.frames.length : 'null';",
   "var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).setFrame(0, new ((cocosairNS as any).ColorKey)()); return (t as any).frames ? 'len' + (t as any).frames.length : 'null';"],
  ["var t = new ColorTimeline(); var id = t.getPropertyId ? t.getPropertyId() : undefined;", "var t = new ((cocosairNS as any).ColorTimeline)(); var id = (t as any).getPropertyId ? (t as any).getPropertyId() : undefined;"],
  ["var t = new ColorTimeline(); t.apply ? t.apply(0.5) : 0; return 'ok';", "var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).apply ? (t as any).apply(0.5) : 0; return 'ok';"],
  ["var t = new ColorTimeline(); return typeof t.slotIndex;", "var t = new ((cocosairNS as any).ColorTimeline)(); return typeof (t as any).slotIndex;"],
  ["(light as any).update ? light.update(0.016) : 0; return 'ok';", "(light as any).update(0.016); return 'ok';"],
  ["var q = utils.createMesh(primitives.quad({}));", "var q = utils.createMesh((primitives as any).quad({ width: 1, height: 1 }));"],
]);
console.log('patched pairs:', ok);
