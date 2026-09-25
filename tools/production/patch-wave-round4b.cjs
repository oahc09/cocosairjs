const fs = require('fs');
function patch (file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!t.includes(from)) { console.log('MISS:', from.slice(0, 70)); continue; }
    t = t.split(from).join(to);
  }
  fs.writeFileSync(file, t);
}
patch('tools/production/wave-topics-2.cjs', [
  ["T('add2f', () => Vec2.add2f(o, 1, 2, 3, 4).x + ',' + o.y);", "T('add2f', () => (Vec2 as any).add2f(o, 1, 2, 3, 4).x + ',' + o.y);"],
  ["T('sub2f', () => Vec2.subtract2f(o, 1, 2, 3, 4).x + ',' + o.y);", "T('sub2f', () => (Vec2 as any).subtract2f(o, 1, 2, 3, 4).x + ',' + o.y);"],
  ["T('mul2f', () => Vec2.multiply2f(o, 1, 2, 3, 4).x + ',' + o.y);", "T('mul2f', () => (Vec2 as any).multiply2f(o, 1, 2, 3, 4).x + ',' + o.y);"],
  ["T('div2f', () => Vec2.divide2f(o, 6, 8, 2, 4).x + ',' + o.y);", "T('div2f', () => (Vec2 as any).divide2f(o, 6, 8, 2, 4).x + ',' + o.y);"],
  ["T('equals2f', () => Vec2.equals2f(a, 1, 2));", "T('equals2f', () => (Vec2 as any).equals2f(a, 1, 2));"],
  ["T('strictEq2f', () => Vec2.strictEquals2f(b, 1, 2));", "T('strictEq2f', () => (Vec2 as any).strictEquals2f(b, 1, 2));"],
  ["T('equals3f', () => Vec3.equals3f(a, 1, 2, 3));", "T('equals3f', () => (Vec3 as any).equals3f(a, 1, 2, 3));"],
  ["T('strictEq3f', () => Vec3.strictEquals3f(b, 1, 2, 3));", "T('strictEq3f', () => (Vec3 as any).strictEquals3f(b, 1, 2, 3));"],
  ["T('length', () => Math.round(Vec3.length(new Vec3(0, 0, 5)) * 100) / 100);", "T('length', () => Math.round((Vec3 as any).length(new Vec3(0, 0, 5)) * 100) / 100);"],
  ["T('project', () => { Vec2.project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x); });", "T('project', () => { (Vec2 as any).project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x); });"],
  ["Vec2.project(o, d, new Vec2(1, 0)); var pl = Vec2.length(o); return pl <= Vec2.length(d) + 1e-9;", "(Vec2 as any).project(o, d, new Vec2(1, 0)); var pl = (Vec2 as any).length(o); return pl <= (Vec2 as any).length(d) + 1e-9;"],
  ["var w = cubeRenderer.getWeight ? cubeRenderer.getWeight(0) : undefined; return w === undefined ? 'undefined' : 'value';", "var w = (cubeRenderer as any).getWeight ? (cubeRenderer as any).getWeight(0, 0) : undefined; return w === undefined ? 'undefined' : 'value';"],
  ["var b = (mesh as any).getBoneSpaceBounds ? mesh.getBoneSpaceBounds() : null;", "var b = (mesh as any).getBoneSpaceBounds ? (mesh as any).getBoneSpaceBounds(null) : null;"],
  ["T('wireframe', () => { try { var w: any = primitives.wireframe(box as any); return w === null || w === undefined ? 'null' : (Array.isArray(w) ? 'arr' + w.length : 'len' + (w.indices || []).length; } catch (e) { return 'threw'; } });",
   "T('wireframe', () => { try { var w: any = primitives.wireframe(box as any); return w === null || w === undefined ? 'null' : (Array.isArray(w) ? 'arr' + w.length : 'len' + (w.indices || []).length); } catch (e) { return 'threw'; } });"],
]);
console.log('round-4b done');
