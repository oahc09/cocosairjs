const fs = require('fs');
function patch (file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!t.includes(from)) { console.log('MISS:', from.slice(0, 70)); continue; }
    t = t.split(from).join(to);
  }
  fs.writeFileSync(file, t);
}
const T2 = 'tools/production/wave-topics-2.cjs';
const T3 = 'tools/production/wave-topics-3.cjs';

patch(T2, [
  // color-timeline-key：import 与实例改命名空间 any
  ["imports: ['ColorTimeline', 'ColorKey'],", "imports: [],"],
  ["T('timeline', () => { try { var t = new ColorTimeline(); return t ? 'obj' : 'null'; } catch (e) { return 'threw'; } });\nT('key', () => { try { var k = new ColorKey(); return k ? 'obj' : 'null'; } catch (e) { return 'threw'; } });",
   "T('timeline', () => { try { var tl = new ((cocosairNS as any).ColorTimeline)(); return tl ? 'obj' : 'null'; } catch (e) { return 'threw'; } });\nT('key', () => { try { var kk = new ((cocosairNS as any).ColorKey)(); return kk ? 'obj' : 'null'; } catch (e) { return 'threw'; } });"],
  // gltf register：单参
  ["((loader as any).register || (GLTFLoader as any).register).call(GLTFLoader as any, 'PROBE_ext', noop);",
   "((loader as any).register || (GLTFLoader as any).register).call(GLTFLoader as any, 'PROBE_ext');"],
  // layers addLayer：数值位在前
  ["(Layers as any).addLayer('ProbeLayerX', 30);", "(Layers as any).addLayer(30, 'ProbeLayerX');"],
  // color
  ["Color.toVec4(v, c); return v.x + ',' + v.y + ',' + v.z + ',' + v.w;", "(Color as any).toVec4(v, c); return v.x + ',' + v.y + ',' + v.z + ',' + v.w;"],
  ["var h = c.h, s = c.s, v = c.v; return typeof h + typeof s + typeof v;", "var h = (c as any).h, s = (c as any).s, v = (c as any).v; return typeof h + typeof s + typeof v;"],
  // mat3 残留 m22
  ["T('mul', () => { Mat3.multiply(o, m, m); return o.m00; });\nT('mulS', () => { Mat3.multiplyScalar(o, m, 2); return o.m00; });",
   "T('mul', () => { Mat3.multiply(o, m, m); return o.m00; });\nT('mulS', () => { Mat3.multiplyScalar(o, m, 2); return o.m00; });"],
  ["T('offDiag', () => m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07);",
   "T('offDiag', () => m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07);"],
  // mat3-transforms：去掉 fromZAxis 探测
  ["T('fromQuatZ90', () => { Quat.fromZAxis ? 0 : 0; var qz = new Quat(); (Quat as any).fromAxisAngle ? (Quat as any).fromAxisAngle(qz, new Vec3(0, 0, 1), Math.PI / 2) : qz.set(0, 0, 0.7071068, 0.7071068); Mat3.fromQuat(o, qz); return Math.round(o.m00 * 100) / 100; });",
   "T('fromQuatZ90', () => { var qz = new Quat(); qz.set(0, 0, 0.7071068, 0.7071068); Mat3.fromQuat(o, qz); return Math.round(o.m00 * 100) / 100; });"],
  // mat4
  ["T('fromSRT', () => { var m2 = new Mat4(); Mat4.fromSRT(m2, s, q, t); return m2.m12; });",
   "T('fromSRT', () => { var m2 = new Mat4(); (Mat4 as any).fromSRT(m2, s, q, t); return m2.m12; });"],
  ["Mat4.rotate(o, m, 0); return Math.round(o.m00 * 100) / 100;", "Mat4.rotate(o, m, 0, new Vec3(0, 1, 0)); return Math.round(o.m00 * 100) / 100;"],
  // rect / size / vec 静态缺失 → any 接收者
  ["T('setRT', () => Rect.set(o, 5, 6, 7, 8).height);", "T('setRT', () => (Rect as any).set(o, 5, 6, 7, 8).height);"],
  ["T('setRT', () => Size.set(o, 1, 2).width);", "T('setRT', () => (Size as any).set(o, 1, 2).width);"],
  ["Vec2.project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x);", "(Vec2 as any).project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x);"],
  ["Vec2.project(o, d, new Vec2(1, 0)); var pl = Vec2.length(o);", "(Vec2 as any).project(o, d, new Vec2(1, 0)); var pl = (Vec2 as any).length(o);"],
  ["Vec2.add2f(o, 1, 2, 3, 4).x + ',' + o.y;", "(Vec2 as any).add2f(o, 1, 2, 3, 4).x + ',' + o.y;"],
  ["Vec2.subtract2f(o, 1, 2, 3, 4).x + ',' + o.y;", "(Vec2 as any).subtract2f(o, 1, 2, 3, 4).x + ',' + o.y;"],
  ["Vec2.multiply2f(o, 1, 2, 3, 4).x + ',' + o.y;", "(Vec2 as any).multiply2f(o, 1, 2, 3, 4).x + ',' + o.y;"],
  ["Vec2.divide2f(o, 6, 8, 2, 4).x + ',' + o.y;", "(Vec2 as any).divide2f(o, 6, 8, 2, 4).x + ',' + o.y;"],
  ["Vec2.equals2f(a, 1, 2);", "(Vec2 as any).equals2f(a, 1, 2);"],
  ["Vec2.strictEquals2f(b, 1, 2);", "(Vec2 as any).strictEquals2f(b, 1, 2);"],
  ["T('signAngle', () => Math.round(Vec2.signAngle(x, y) * 100) / 100);", "T('signAngle', () => Math.round((Vec2 as any).signAngle(x, y) * 100) / 100);"],
  ["Vec3.add3f(o, 1, 2, 3, 4, 5, 6); return o.z;", "(Vec3 as any).add3f(o, 1, 2, 3, 4, 5, 6); return o.z;"],
  ["Vec3.subtract3f(o, 4, 5, 6, 1, 2, 3); return o.x;", "(Vec3 as any).subtract3f(o, 4, 5, 6, 1, 2, 3); return o.x;"],
  ["Vec3.multiply3f(o, 1, 2, 3, 4, 5, 6); return o.y;", "(Vec3 as any).multiply3f(o, 1, 2, 3, 4, 5, 6); return o.y;"],
  ["Vec3.divide3f(o, 8, 10, 12, 2, 5, 6); return o.x + ',' + o.y + ',' + o.z;", "(Vec3 as any).divide3f(o, 8, 10, 12, 2, 5, 6); return o.x + ',' + o.y + ',' + o.z;"],
  ["Vec3.equals3f(a, 1, 2, 3);", "(Vec3 as any).equals3f(a, 1, 2, 3);"],
  ["Vec3.strictEquals3f(b, 1, 2, 3);", "(Vec3 as any).strictEquals3f(b, 1, 2, 3);"],
  ["T('len', () => Math.round(Vec3.len(new Vec3(3, 4, 0)) * 100) / 100);", "T('len', () => Math.round((Vec3 as any).len(new Vec3(3, 4, 0)) * 100) / 100);"],
  ["T('len', () => Math.round(Vec3.length(new Vec3(0, 0, 5)) * 100) / 100);", "T('len2', () => Math.round((Vec3 as any).length(new Vec3(0, 0, 5)) * 100) / 100);"],
  ["T('norm', () => { Vec3.normalize(o, q); return Math.round(Vec3.length(o) * 1000) / 1000; });", "T('norm', () => { Vec3.normalize(o, q); return Math.round((Vec3 as any).length(o) * 1000) / 1000; });"],
  ["T('unitNorm', () => { Vec3.normalize(o, new Vec3(0, 0, 7)); return o.z; });", "T('unitNorm', () => { Vec3.normalize(o, new Vec3(0, 0, 7)); return o.z; });"],
  ["T('len', () => Math.round(Vec4.length(v) * 1000) / 1000);", "T('len', () => Math.round((Vec4 as any).length(v) * 1000) / 1000);"],
  ["T('norm', () => { Vec4.normalize(o, v); return Math.round(Vec4.length(o) * 1000) / 1000; });", "T('norm', () => { Vec4.normalize(o, v); return Math.round((Vec4 as any).length(o) * 1000) / 1000; });"],
  ["T('neg', () => { Vec4.negative(o, a); return o.x; });", "T('neg', () => { (Vec4 as any).negative(o, a); return o.x; });"],
  ["T('setRT', () => Vec4.set(o, 1, 2, 3, 9).w);", "T('setRT', () => (Vec4 as any).set(o, 1, 2, 3, 9).w);"],
  // toVec2/toVec3
  ["var v2 = Vec3.toVec2(new (Vec3 as any)(), b); return v2.x + ',' + v2.y;", "var v2 = (Vec3 as any).toVec2(new (Vec3 as any)(), b); return v2.x + ',' + v2.y;"],
  // mesh / texture
  ["var b = (mesh as any).getBoneSpaceBounds ? mesh.getBoneSpaceBounds() : null;", "var b = (mesh as any).getBoneSpaceBounds ? (mesh as any).getBoneSpaceBounds(null) : null;"],
  ["var w = cubeRenderer.getWeight ? cubeRenderer.getWeight(0) : undefined;", "var w = (cubeRenderer as any).getWeight ? (cubeRenderer as any).getWeight(0, 0) : undefined;"],
  ["T('base', () => { try { return tex.base === null || tex.base ? 'ok' : 'null'; } catch (e) { return 'threw'; } });", "T('base', () => { try { return (tex as any).base === null || (tex as any).base ? 'ok' : 'null'; } catch (e) { return 'threw'; } });"],
  // primitives translate/scale 接收者
  ["var moved = primitives.translate(base, new Vec3(0, 10, 0));", "var moved = (primitives as any).translate(base, [0, 10, 0]);"],
  ["var withNormals = primitives.normals ? primitives.normals(base) : base;", "var withNormals = (primitives as any).normals(base);"],
  ["var w = primitives.wireframe(box as any); return Array.isArray(w) ? 'arr' + w.length : (w && w.indices ? 'idx' + w.indices.length : 'null');",
   "var w: any = primitives.wireframe(box as any); return w === null || w === undefined ? 'null' : (Array.isArray(w) ? 'arr' + w.length : 'len' + (w.indices || []).length;"],
  // scene-runtime：提前 run
  ["id: 'scene-runtime-ops', title: 'Scene — addComponent/autoRelease/updateWorldTransform', category: 'scene', cubeColor: [200, 220, 260], imports: ['Component'],",
   "id: 'scene-runtime-ops', title: 'Scene — addComponent/autoRelease/updateWorldTransform', category: 'scene', cubeColor: [200, 220, 260], imports: ['Component'], runEarly: true,"],
  ["class SceneProbe extends Component { public marker = 7; }", "app.run(scene);\nclass SceneProbe extends Component { public marker = 7; }"],
]);

patch(T3, [
  ["var o = Vec2.toVec3(out as any, v); return o.x + ',' + o.y + ',' + o.z;", "var o = (Vec2 as any).toVec3(out as any, v); return o.x + ',' + o.y + ',' + o.z;"],
  ["var o = Vec3.toVec2(out, v); return o.x + ',' + o.y;", "var o = (Vec3 as any).toVec2(out, v); return o.x + ',' + o.y;"],
  ["T('ABOverlap', () => Rect.intersects(A, B));", "T('ABOverlap', () => (Rect as any).intersects(A, B));"],
  ["T('ACNoOverlap', () => Rect.intersects(A, C));", "T('ACNoOverlap', () => (Rect as any).intersects(A, C));"],
  ["T('containPt', () => Rect.contains(A, new Vec2(5, 5)) && !Rect.contains(A, new Vec2(11, 5)));", "T('containPt', () => (Rect as any).contains(A, new Vec2(5, 5)) && !(Rect as any).contains(A, new Vec2(11, 5)));"],
  ["T('containRectSelf', () => Rect.containsRect(A, A.clone()));", "T('containRectSelf', () => (Rect as any).containsRect(A, A.clone()));"],
  ["T('xform', () => { Mat4.identity(m); m.m12 = 10; Rect.transformMat4(o, new Rect(0, 0, 1, 1), m); return Math.round(o.x); });",
   "T('xform', () => { Mat4.identity(m); m.m12 = 10; (Rect as any).transformMat4(o, new Rect(0, 0, 1, 1), m); return Math.round(o.x); });"],
]);
console.log('patch round-4 done');
