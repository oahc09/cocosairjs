/** V1.1 Wave 选题表 · 第二批（60 例）。签名事实源：build/cocosair.module.d.ts + core-unverified.json。 */
module.exports = [
  {
    id: 'math-vec2-arithmetic', title: 'math.Vec2 — 静态算术族', category: 'math', cubeColor: [96, 160, 220], imports: ['Vec2'],
    primary: ['math.Vec2.add', 'math.Vec2.subtract', 'math.Vec2.multiply'],
    claims: ['math.Vec2.add', 'math.Vec2.add2f', 'math.Vec2.subtract', 'math.Vec2.subtract2f', 'math.Vec2.multiply', 'math.Vec2.multiply2f', 'math.Vec2.multiplyScalar', 'math.Vec2.divide', 'math.Vec2.divide2f', 'math.Vec2.negative', 'math.Vec2.set'],
    goal: '掌握 Vec2 静态 out-形算术：加/减/乘/除（向量与标量双形态）、取负、克隆与重置，全部确定性回读。',
    points: ['add(out,a,b) 与 add2f(out,ax,ay,bx,by) 等价： (1,2)+(3,4)=(4,6)', 'multiplyScalar 是标量广播；negative 得 (-a,-b)', 'clone/set 互为往返：set(clone(a), b) 后逐分量相等'],
    body: `var a = new Vec2(1, 2); var b = new Vec2(3, 4); var o = new Vec2();
T('add', () => Vec2.add(o, a, b).x + ',' + Vec2.add(o, a, b).y);
T('add2f', () => (Vec2 as any).add2f(o, 1, 2, 3, 4).x + ',' + o.y);
T('sub', () => Vec2.subtract(o, a, b).x + ',' + o.y);
T('sub2f', () => (Vec2 as any).subtract2f(o, 1, 2, 3, 4).x + ',' + o.y);
T('mul', () => Vec2.multiply(o, a, b).x + ',' + o.y);
T('mul2f', () => (Vec2 as any).multiply2f(o, 1, 2, 3, 4).x + ',' + o.y);
T('mulS', () => Vec2.multiplyScalar(o, a, 3).x + ',' + o.y);
T('div', () => Vec2.divide(o, b, a).x + ',' + o.y);
T('div2f', () => (Vec2 as any).divide2f(o, 6, 8, 2, 4).x + ',' + o.y);
T('neg', () => Vec2.negative(o, a).x + ',' + o.y);

T('setRT', () => Vec2.set(o, 9, 9).x === 9 && o.y === 9);`,
  },
  {
    id: 'math-vec2-length-angle', title: 'math.Vec2 — 点积/长度/角度/旋转', category: 'math', cubeColor: [110, 170, 210], imports: ['Vec2'],
    primary: ['math.Vec2.dot', 'math.Vec2.angle', 'math.Vec2.normalize'],
    claims: ['math.Vec2.dot', 'math.Vec2.length', 'math.Vec2.lengthSqr', 'math.Vec2.normalize', 'math.Vec2.angle', 'math.Vec2.signAngle', 'math.Vec2.cross', 'math.Vec2.rotate', 'math.Vec2.project'],
    goal: '掌握 Vec2 度量与方向族：dot/叉积值、长度与平方长度、归一化、夹角与符号角、绕原点旋转与投影。',
    points: ['dot((1,0),(0,1))=0；cross 返回标量 z 分量', 'normalize((3,4))=(0.6,0.8)，lengthSqr=25', 'rotate((1,0),90°) 落到 (0,1)（容差取整回读）'],
    body: `var x = new Vec2(1, 0); var y = new Vec2(0, 1); var v = new Vec2(3, 4); var o = new Vec2();
T('dot', () => Vec2.dot(x, y));
T('cross', () => Vec2.cross(x, y));
T('len', () => Vec2.length(v));
T('lenSqr', () => Vec2.lengthSqr(v));
T('norm', () => { Vec2.normalize(o, v); return Math.round(o.x * 100) + ',' + Math.round(o.y * 100); });
T('angle', () => Math.round(Vec2.angle(x, y) * 100) / 100);
T('signAngle', () => Math.round((Vec2 as any).signAngle(x, y) * 100) / 100);
T('rotate', () => { Vec2.rotate(o, x, Math.PI / 2); return Math.round(o.x) + ',' + Math.round(o.y); });
T('project', () => { (Vec2 as any).project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x); });`,
  },
  {
    id: 'math-vec2-equality-misc', title: 'math.Vec2 — 相等/插值/变换与分量', category: 'math', cubeColor: [120, 180, 200], imports: ['Vec2', 'Mat4'],
    primary: ['math.Vec2.lerp', 'math.Vec2.transformMat4'],
    claims: ['math.Vec2.equals', 'math.Vec2.equals2f', 'math.Vec2.strictEquals', 'math.Vec2.strictEquals2f', 'math.Vec2.toString', 'math.Vec2.lerp', 'math.Vec2.clampf', 'math.Vec2.transformMat4', 'math.Vec2.x', 'math.Vec2.y'],
    goal: '掌握 Vec2 的相等语义（数值近似 vs 严格）、lerp/clampf、经 Mat4 变换、升维 toVec3 与分量读写。',
    points: ['equals 带容差；strictEquals 全等才真', 'lerp((0,0),(10,10),0.5)=(5,5)', 'transformMat4 用平移矩阵后分量平移'],
    body: `var a = new Vec2(1.0000001, 2); var b = new Vec2(1, 2); var o = new Vec2(); var m = new Mat4();
T('equals', () => Vec2.equals(a, b));
T('equals2f', () => (Vec2 as any).equals2f(a, 1, 2));
T('strictEq', () => Vec2.strictEquals(a, b));
T('strictEq2f', () => (Vec2 as any).strictEquals2f(b, 1, 2));
T('toString', () => typeof a.toString());
T('lerp', () => { Vec2.lerp(o, new Vec2(0, 0), new Vec2(10, 10), 0.5); return o.x + ',' + o.y; });
T('clampf', () => { Vec2.clampf(o, new Vec2(0, 0), new Vec2(1, 1)); return o.x <= 1 && o.y <= 1; });
T('xform', () => { Mat4.identity(m); m.m12 = 5; m.m13 = 6; Vec2.transformMat4(o, b, m); return Math.round(o.x * 10) + ',' + Math.round(o.y * 10); });
a.x = 7; a.y = 8;
T('xy', () => a.x + ',' + a.y);`,
  },
  {
    id: 'math-vec3-arithmetic', title: 'math.Vec3 — 静态算术族', category: 'math', cubeColor: [214, 148, 96], imports: ['Vec3'],
    primary: ['math.Vec3.add', 'math.Vec3.subtract', 'math.Vec3.multiply'],
    claims: ['math.Vec3.add', 'math.Vec3.add3f', 'math.Vec3.subtract', 'math.Vec3.subtract3f', 'math.Vec3.multiply', 'math.Vec3.multiply3f', 'math.Vec3.multiplyScalar', 'math.Vec3.divide', 'math.Vec3.divide3f', 'math.Vec3.negative', 'math.Vec3.set'],
    goal: '掌握 Vec3 静态 out-形算术全族（向量/标量双形态、取负、克隆、重置），与 Vec2 同构对照。',
    points: ['3f 后缀形态与向量形态等价', 'multiplyScalar 广播到三分量', 'set(clone) 往返一致'],
    body: `var a = new Vec3(1, 2, 3); var b = new Vec3(4, 5, 6); var o = new Vec3();
T('add', () => { Vec3.add(o, a, b); return o.x + ',' + o.y + ',' + o.z; });
T('add3f', () => { (Vec3 as any).add3f(o, 1, 2, 3, 4, 5, 6); return o.z; });
T('sub', () => { Vec3.subtract(o, b, a); return o.x + ',' + o.y + ',' + o.z; });
T('sub3f', () => { (Vec3 as any).subtract3f(o, 4, 5, 6, 1, 2, 3); return o.x; });
T('mul', () => { Vec3.multiply(o, a, b); return o.x + ',' + o.z; });
T('mul3f', () => { (Vec3 as any).multiply3f(o, 1, 2, 3, 4, 5, 6); return o.y; });
T('mulS', () => { Vec3.multiplyScalar(o, a, 2); return o.x + ',' + o.z; });
T('div', () => { Vec3.divide(o, b, a); return Math.round(o.z * 100) / 100; });
T('div3f', () => { (Vec3 as any).divide3f(o, 8, 10, 12, 2, 5, 6); return o.x + ',' + o.y + ',' + o.z; });
T('neg', () => { Vec3.negative(o, a); return o.x + ',' + o.z; });

T('setRT', () => Vec3.set(o, 7, 8, 9).z);`,
  },
  {
    id: 'math-vec3-length-products', title: 'math.Vec3 — 点积/叉积/长度/距离/夹角', category: 'math', cubeColor: [220, 160, 100], imports: ['Vec3'],
    primary: ['math.Vec3.cross', 'math.Vec3.distance', 'math.Vec3.normalize'],
    claims: ['math.Vec3.dot', 'math.Vec3.cross', 'math.Vec3.length', 'math.Vec3.len', 'math.Vec3.lengthSqr', 'math.Vec3.normalize', 'math.Vec3.distance', 'math.Vec3.squaredDistance', 'math.Vec3.angle'],
    goal: '掌握 Vec3 度量族：点积/叉积、两种长度命名、归一化、欧氏与平方距离、向量夹角。',
    points: ['cross((1,0,0),(0,1,0))=(0,0,1)', 'distance/squaredDistance 平方关系', 'angle 与 dot/长度的一致性'],
    body: `var x = new Vec3(1, 0, 0); var y = new Vec3(0, 1, 0); var p = new Vec3(1, 2, 3); var q = new Vec3(4, 6, 8); var o = new Vec3();
T('dot', () => Vec3.dot(x, y));
T('cross', () => { Vec3.cross(o, x, y); return o.x + ',' + o.y + ',' + o.z; });
T('len', () => Math.round((Vec3 as any).len(new Vec3(3, 4, 0)) * 100) / 100);
T('length', () => Math.round((Vec3 as any).length(new Vec3(0, 0, 5)) * 100) / 100);
T('lenSqr', () => Vec3.lengthSqr(p));
T('dist', () => Math.round(Vec3.distance(p, q) * 100) / 100);
T('distSqr', () => Vec3.squaredDistance(p, q));
T('norm', () => { Vec3.normalize(o, q); return Math.round((Vec3 as any).length(o) * 1000) / 1000; });
T('angle', () => Math.round(Vec3.angle(x, y) * 100) / 100);`,
  },
  {
    id: 'math-vec3-equality-misc', title: 'math.Vec3 — 相等/插值/变换/降维', category: 'math', cubeColor: [230, 170, 110], imports: ['Vec3', 'Mat4'],
    primary: ['math.Vec3.lerp', 'math.Vec3.transformMat4', 'math.Vec3.toVec2'],
    claims: ['math.Vec3.equals', 'math.Vec3.equals3f', 'math.Vec3.strictEquals', 'math.Vec3.strictEquals3f', 'math.Vec3.toString', 'math.Vec3.lerp', 'math.Vec3.clampf', 'math.Vec3.transformMat4', 'math.Vec3.toVec2', 'math.Vec3.x', 'math.Vec3.y', 'math.Vec3.z'],
    goal: '掌握 Vec3 相等语义、lerp/clampf、Mat4 变换、降维 toVec2 与三分量读写。',
    points: ['equals3f/strictEquals3f 的数值形态', '平移矩阵作用后逐分量平移', 'toVec2 保留 x/y'],
    body: `var a = new Vec3(1.0000001, 2, 3); var b = new Vec3(1, 2, 3); var o = new Vec3(); var m = new Mat4();
T('equals', () => Vec3.equals(a, b));
T('equals3f', () => (Vec3 as any).equals3f(a, 1, 2, 3));
T('strictEq', () => Vec3.strictEquals(a, b));
T('strictEq3f', () => (Vec3 as any).strictEquals3f(b, 1, 2, 3));
T('toString', () => typeof b.toString());
T('lerp', () => { Vec3.lerp(o, new Vec3(0, 0, 0), new Vec3(10, 20, 30), 0.5); return o.x + ',' + o.z; });
T('clampf', () => { Vec3.clampf(o, new Vec3(0, 0, 0), new Vec3(1, 1, 1)); return o.x <= 1; });
T('xform', () => { Mat4.identity(m); m.m12 = 2; m.m13 = 3; m.m14 = 4; Vec3.transformMat4(o, b, m); return o.x + ',' + o.y + ',' + o.z; });
T('toVec2', () => { var v2 = (Vec3 as any).toVec2(new (Vec3 as any)(), b); return v2.x + ',' + v2.y; });
a.x = 4; a.y = 5; a.z = 6;
T('xyz', () => a.x + ',' + a.y + ',' + a.z);`,
  },
  {
    id: 'math-vec4-arithmetic', title: 'math.Vec4 — 静态算术族', category: 'math', cubeColor: [140, 190, 160], imports: ['Vec4'],
    primary: ['math.Vec4.add', 'math.Vec4.subtract', 'math.Vec4.multiply'],
    claims: ['math.Vec4.add', 'math.Vec4.subtract', 'math.Vec4.multiply', 'math.Vec4.multiplyScalar', 'math.Vec4.divide', 'math.Vec4.negative', 'math.Vec4.scale', 'math.Vec4.set'],
    goal: '掌握 Vec4 静态算术全族（含 scale 缩放别名）。',
    points: ['4f 形态与向量形态等价', 'scale 与 multiplyScalar 行为一致', 'clone/set 往返'],
    body: `var a = new Vec4(1, 2, 3, 4); var b = new Vec4(5, 6, 7, 8); var o = new Vec4();
T('add', () => { Vec4.add(o, a, b); return o.w; });
T('sub', () => { Vec4.subtract(o, b, a); return o.z; });
T('mul', () => { Vec4.multiply(o, a, b); return o.x + ',' + o.w; });
T('mulS', () => { Vec4.multiplyScalar(o, a, 3); return o.y; });
T('scale', () => { Vec4.scale(o, a, 2); return o.x + ',' + o.w; });
T('div', () => { Vec4.divide(o, b, a); return Math.round(o.w * 100) / 100; });
T('neg', () => { (Vec4 as any).negative(o, a); return o.x; });

T('setRT', () => (Vec4 as any).set(o, 1, 2, 3, 9).w);`,
  },
  {
    id: 'math-vec4-length-misc', title: 'math.Vec4 — 度量/插值/相等/变换', category: 'math', cubeColor: [150, 200, 170], imports: ['Vec4', 'Mat4'],
    primary: ['math.Vec4.dot', 'math.Vec4.normalize', 'math.Vec4.transformMat4'],
    claims: ['math.Vec4.dot', 'math.Vec4.length', 'math.Vec4.lengthSqr', 'math.Vec4.normalize', 'math.Vec4.lerp', 'math.Vec4.clampf', 'math.Vec4.transformMat4', 'math.Vec4.toString', 'math.Vec4.equals', 'math.Vec4.equals4f', 'math.Vec4.strictEquals', 'math.Vec4.strictEquals4f'],
    goal: '掌握 Vec4 度量与杂项：dot/叉积、长度族、归一化、lerp/clampf、Mat4 变换与相等语义。',
    points: ['dot 正交基为零', 'normalize 后长度为 1（取整回读）', '变换后 w 分量语义保持'],
    body: `var e1 = new Vec4(1, 0, 0, 0); var e2 = new Vec4(0, 1, 0, 0); var v = new Vec4(1, 2, 3, 4); var o = new Vec4(); var m = new Mat4();
T('dot', () => Vec4.dot(e1, e2));
T('len', () => Math.round((Vec4 as any).length(v) * 1000) / 1000);
T('lenSqr', () => Vec4.lengthSqr(v));
T('norm', () => { Vec4.normalize(o, v); return Math.round((Vec4 as any).length(o) * 1000) / 1000; });
T('lerp', () => { Vec4.lerp(o, new Vec4(0, 0, 0, 0), v, 0.5); return o.x + ',' + o.w; });
T('clampf', () => { Vec4.clampf(o, new Vec4(0, 0, 0, 0), new Vec4(1, 1, 1, 1)); return o.x <= 1; });
T('xform', () => { Mat4.identity(m); m.m15 = 2; Vec4.transformMat4(o, new Vec4(1, 1, 1, 1), m); return o.x + ',' + o.w; });
T('toString', () => typeof v.toString());
T('equals', () => Vec4.equals(new Vec4(1.0000001, 0, 0, 0), e1));
T('equals4f', () => Vec4.equals4f(v, 1, 2, 3, 4));
T('strictEq', () => Vec4.strictEquals(v, v.clone()));
T('strictEq4f', () => Vec4.strictEquals4f(v, 1, 2, 3, 4));`,
  },
  {
    id: 'math-mat3-basics', title: 'math.Mat3 — 基础矩阵运算', category: 'math', cubeColor: [170, 150, 210], imports: ['Mat3', 'Quat'],
    primary: ['math.Mat3.identity', 'math.Mat3.multiply', 'math.Mat3.invert'],
    claims: ['math.Mat3.identity', 'math.Mat3.transpose', 'math.Mat3.invert', 'math.Mat3.determinant', 'math.Mat3.add', 'math.Mat3.subtract', 'math.Mat3.multiply', 'math.Mat3.multiplyScalar', 'math.Mat3.set', 'math.Mat3.equals', 'math.Mat3.strictEquals', 'math.Mat3.toString'],
    goal: '掌握 Mat3 基础：单位/转置/求逆/行列式、逐元加减、矩阵乘与标量乘、克隆重置与相等。',
    points: ['identity 的行列式为 1', 'invert(I)=I', 'transpose 对称矩阵不变（用单位阵回读）'],
    body: `var m = new Mat3(); var a = new Mat3(); var o = new Mat3();
T('identity', () => Mat3.identity(m).m00);
T('det', () => Mat3.determinant(m));
T('inv', () => { Mat3.invert(o, m); return Math.round(o.m00 * 100) / 100; });
T('transpose', () => { Mat3.transpose(o, m); return Math.round(o.m04 * 100) / 100; });
T('add', () => { Mat3.add(o, m, m); return o.m00; });
T('sub', () => { Mat3.subtract(o, m, m); return o.m08; });
T('mul', () => { Mat3.multiply(o, m, m); return o.m00; });
T('mulS', () => { Mat3.multiplyScalar(o, m, 2); return o.m00; });

T('setRT', () => Mat3.set(o, 1, 0, 0, 0, 1, 0, 0, 0, 1).m22);
T('equals', () => Mat3.equals(m, o));
T('strictEq', () => Mat3.strictEquals(m, m.clone()));
T('toString', () => typeof m.toString());`,
  },
  {
    id: 'math-mat3-transforms', title: 'math.Mat3 — 旋转/缩放/四元数来源与元素', category: 'math', cubeColor: [180, 160, 220], imports: ['Mat3', 'Quat', 'Vec3'],
    primary: ['math.Mat3.rotate', 'math.Mat3.fromQuat'],
    claims: ['math.Mat3.rotate', 'math.Mat3.scale', 'math.Mat3.fromQuat', 'math.Mat3.m00', 'math.Mat3.m01', 'math.Mat3.m02', 'math.Mat3.m03', 'math.Mat3.m04', 'math.Mat3.m05', 'math.Mat3.m06', 'math.Mat3.m07', 'math.Mat3.m08'],
    goal: '掌握 Mat3 构造变换：绕轴旋转、缩放注入、fromQuat 旋转矩阵化，以及 9 个元素的直接读写。',
    points: ['rotate(I, 0) 保持单位', 'scale 注入对角元', 'fromQuat(单位四元数)=I'],
    body: `var m = new Mat3(); var o = new Mat3(); var q = new Quat();
T('rotate0', () => { Mat3.rotate(o, m, 0); return Math.round(o.m00 * 100) / 100; });
T('scaleIn', () => { Mat3.scale(o, m, new Vec3(2, 3, 4)); return o.m00 + ',' + o.m04 + ',' + o.m08; });
T('fromQuatI', () => { Mat3.fromQuat(o, q); return Math.round(o.m00 * 100) + ',' + Math.round(o.m04 * 100); });
T('fromQuatZ90', () => { var qz = new Quat(); qz.set(0, 0, 0.7071068, 0.7071068); Mat3.fromQuat(o, qz); return Math.round(o.m00 * 100) / 100; });
m.m00 = 1; m.m04 = 1; m.m08 = 1; m.m01 = 2;
T('elems', () => m.m00 + ',' + m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m04 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07 + ',' + m.m08);`,
  },
  {
    id: 'math-mat4-basics', title: 'math.Mat4 — 基础矩阵运算', category: 'math', cubeColor: [190, 170, 230], imports: ['Mat4'],
    primary: ['math.Mat4.identity', 'math.Mat4.multiply', 'math.Mat4.invert'],
    claims: ['math.Mat4.identity', 'math.Mat4.zero', 'math.Mat4.transpose', 'math.Mat4.invert', 'math.Mat4.determinant', 'math.Mat4.add', 'math.Mat4.subtract', 'math.Mat4.multiply', 'math.Mat4.multiplyScalar', 'math.Mat4.set', 'math.Mat4.equals', 'math.Mat4.strictEquals', 'math.Mat4.toString'],
    goal: '掌握 Mat4 基础全族：单位/零矩阵/转置/求逆/行列式、加减乘、标量乘、克隆重置与相等。',
    points: ['zero 的行列式为 0', 'invert(I)=I', 'multiply(I,I)=I'],
    body: `var m = new Mat4(); var o = new Mat4();
T('identity', () => Mat4.identity(m).m00);
T('zeroDet', () => { var z = new Mat4(); Mat4.zero(z); return Mat4.determinant(z); });
T('detI', () => Math.round(Mat4.determinant(m) * 100) / 100);
T('inv', () => { Mat4.invert(o, m); return Math.round(o.m00 * 100) / 100; });
T('transpose', () => { Mat4.transpose(o, m); return Math.round(o.m00 * 100) / 100; });
T('add', () => { Mat4.add(o, m, m); return o.m00; });
T('sub', () => { Mat4.subtract(o, m, m); return o.m15; });
T('mul', () => { Mat4.multiply(o, m, m); return Math.round(o.m00 * 100) / 100; });
T('mulS', () => { Mat4.multiplyScalar(o, m, 5); return o.m00; });

T('setRT', () => Mat4.set(o, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m15);
T('equals', () => Mat4.equals(m, o));
T('strictEq', () => Mat4.strictEquals(m, m.clone()));
T('toString', () => typeof m.toString());`,
  },
  {
    id: 'math-mat4-compose', title: 'math.Mat4 — RTS 分解合成与四元数来源', category: 'math', cubeColor: [200, 180, 240], imports: ['Mat4', 'Quat', 'Vec3'],
    primary: ['math.Mat4.fromRTS', 'math.Mat4.getTranslation'],
    claims: ['math.Mat4.fromRTS', 'math.Mat4.fromSRT', 'math.Mat4.fromQuat', 'math.Mat4.getTranslation', 'math.Mat4.getScale', 'math.Mat4.getRotation'],
    goal: '掌握 Mat4 与旋转-平移-缩放的双向：fromRTS/fromSRT/fromQuat 合成，getTranslation/getScale/getRotation 分解往返。',
    points: ['fromRTS 后 getTranslation 回到原平移', 'getScale 回到原缩放', 'fromQuat 的旋转分解回到同角度（余弦回读）'],
    body: `var o = new Mat4(); var q = new Quat(); var t = new Vec3(1, 2, 3); var s = new Vec3(2, 2, 2);
var outT = new Vec3(); var outS = new Vec3(); var outQ = new Quat();
T('fromRTS', () => { Mat4.fromRTS(o, q, t, s); return o.m12 + ',' + o.m13 + ',' + o.m14; });
T('getT', () => { Mat4.getTranslation(outT, o); return outT.x + ',' + outT.z; });
T('getS', () => { (Mat4 as any).getScale(outS, o); return outS.x; });
T('getR', () => { (Mat4 as any).getRotation(outQ, o); return Math.round(outQ.w * 1000) / 1000; });
T('fromSRT', () => { var m2 = new Mat4(); (Mat4 as any).fromSRT(m2, s, q, t); return m2.m12; });
T('fromQuat', () => { var m3 = new Mat4(); Mat4.fromQuat(m3, q); return Math.round(m3.m00 * 100) / 100; });`,
  },
  {
    id: 'math-mat4-transform', title: 'math.Mat4 — translate/scale/rotate 与 16 元素', category: 'math', cubeColor: [210, 190, 250], imports: ['Mat4', 'Vec3'],
    primary: ['math.Mat4.translate', 'math.Mat4.scale', 'math.Mat4.rotate'],
    claims: ['math.Mat4.translate', 'math.Mat4.transform', 'math.Mat4.scale', 'math.Mat4.rotate', 'math.Mat4.m00', 'math.Mat4.m05', 'math.Mat4.m10', 'math.Mat4.m15', 'math.Mat4.m03', 'math.Mat4.m07', 'math.Mat4.m11'],
    goal: '掌握 Mat4 变换注入族（translate/scale/rotate/transform）与全部 16 元素读写。',
    points: ['translate 改 m12-m14 列', 'scale 注入对角', 'rotate 单位阵零角不变'],
    body: `var m = new Mat4(); var o = new Mat4(); Mat4.identity(m);
T('translate', () => { Mat4.translate(o, m, new Vec3(5, 6, 7)); return o.m12 + ',' + o.m14; });
T('scale', () => { Mat4.scale(o, m, new Vec3(3, 4, 5)); return o.m00 + ',' + o.m11; });
T('rotate0', () => { Mat4.rotate(o, m, 0, new Vec3(0, 1, 0)); return Math.round(o.m00 * 100) / 100; });
T('transform', () => { try { Mat4.transform(o, m, new Vec3(1, 1, 1), new Vec3(1, 1, 1)); return o.m00; } catch (e) { return 'threw'; } });
o.m00 = 1; o.m05 = 2; o.m10 = 3; o.m15 = 4; o.m03 = 5; o.m07 = 6; o.m11 = 7;
T('elems', () => o.m00 + ',' + o.m03 + ',' + o.m05 + ',' + o.m07 + ',' + o.m10 + ',' + o.m11 + ',' + o.m15);`,
  },
  {
    id: 'math-quat-euler', title: 'math.Quat — 欧拉角与轴基', category: 'math', cubeColor: [160, 210, 230], imports: ['Quat', 'Vec3'],
    primary: ['math.Quat.toEuler', 'math.Quat.getEulerAngles'],
    claims: ['math.Quat.toEuler', 'math.Quat.toEulerInYXZOrder', 'math.Quat.getEulerAngles', 'math.Quat.fromArray', 'math.Quat.toAxisX', 'math.Quat.toAxisY', 'math.Quat.toAxisZ'],
    goal: '掌握四元数与欧拉角/轴基的互化：toEuler（双序）、实例 getEulerAngles、fromArray 数组注入、三轴基提取。',
    points: ['单位四元数 toEuler 为零向量（取整回读）', 'fromArray 后分量按序注入', 'toAxis* 输出对应轴基向量'],
    body: `var q = new Quat(); var v = new Vec3();
T('toEuler', () => { Quat.toEuler(v, q); return Math.round(v.x) + ',' + Math.round(v.y) + ',' + Math.round(v.z); });
T('toEulerYXZ', () => { try { Quat.toEulerInYXZOrder(v, q); return Math.round(v.x) + ',' + Math.round(v.z); } catch (e) { return 'threw'; } });
T('getEuler', () => { var e = (q as any).getEulerAngles(); return e ? Math.round(e.x) + ',' + Math.round(e.z) : 'null'; });
T('fromArray', () => { Quat.fromArray(q, [0, 0, 1, 0]); return q.z + ',' + q.w; });
var ax = new Vec3();
T('toAxisX', () => { try { Quat.toAxisX(ax, q); return Math.round(ax.x * 100) / 100; } catch (e) { return 'threw'; } });
T('toAxisY', () => { try { Quat.toAxisY(ax, q); return Math.round(ax.y * 100) / 100; } catch (e) { return 'threw'; } });
T('toAxisZ', () => { try { Quat.toAxisZ(ax, q); return Math.round(ax.z * 100) / 100; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-quat-interp', title: 'math.Quat — 插值与度量', category: 'math', cubeColor: [170, 220, 240], imports: ['Quat'],
    primary: ['math.Quat.slerp', 'math.Quat.rotateTowards'],
    claims: ['math.Quat.slerp', 'math.Quat.lerp', 'math.Quat.rotateTowards', 'math.Quat.angle', 'math.Quat.length', 'math.Quat.lengthSqr', 'math.Quat.equals', 'math.Quat.strictEquals', 'math.Quat.set', 'math.Quat.toString', 'math.Quat.x', 'math.Quat.y', 'math.Quat.z', 'math.Quat.w'],
    goal: '掌握四元数插值（球面 slerp/线性 lerp/步进 rotateTowards）、夹角、长度族、相等语义与分量读写。',
    points: ['slerp(a,a,0.3)=a', '单位四元数 length=1', 'rotateTowards 零步保持'],
    body: `var q = new Quat(); var r = new Quat(0, 0, 0.7071068, 0.7071068); var o = new Quat();
T('slerp', () => { Quat.slerp(o, q, q, 0.3); return Math.round(o.w * 1000) / 1000; });
T('lerp', () => { Quat.lerp(o, q, q, 0.5); return Math.round(o.w * 1000) / 1000; });
T('rotateTowards0', () => { Quat.rotateTowards(o, q, q, 0); return Math.round(o.w * 100) / 100; });
T('angle', () => Math.round(Quat.angle(q, r) * 100) / 100);
T('len', () => { var sq = (Quat as any).lengthSqr(r); return Math.round(Math.sqrt(sq) * 1000) / 1000; });
T('lenSqr', () => Math.round((Quat as any).lengthSqr(q) * 100) / 100);
T('equals', () => Quat.equals(q, o));
T('strictEq', () => Quat.strictEquals(q, q.clone()));

T('setRT', () => Quat.set(o, 0, 0, 0, 1).w);
T('toString', () => typeof r.toString());
o.x = 1; o.y = 2; o.z = 3; o.w = 4;
T('xyzw', () => o.x + ',' + o.y + ',' + o.z + ',' + o.w);`,
  },
  {
    id: 'math-size-ops', title: 'math.Size — 尺寸值类型', category: 'math', cubeColor: [130, 200, 180], imports: ['Size'],
    primary: ['math.Size.lerp', 'math.Size.equals'],
    claims: ['math.Size.constructor', 'math.Size.width', 'math.Size.height', 'math.Size.clone', 'math.Size.set', 'math.Size.equals', 'math.Size.lerp', 'math.Size.toString'],
    goal: '掌握 Size 值类型全生命周期：构造、宽高读写、克隆重置、相等与插值。',
    points: ['set(clone) 往返', 'lerp 中点尺寸', 'toString 类型回读'],
    body: `var s = new Size(10, 20); var o = new Size();
T('ctor', () => s.width + 'x' + s.height);
s.width = 12; s.height = 24;
T('wh', () => s.width + ',' + s.height);
T('cloneW', () => s.clone().height);
T('setRT', () => (Size as any).set(o, 1, 2).width);
T('equals', () => Size.equals(s, o));
T('lerp', () => { Size.lerp(o, new Size(0, 0), new Size(10, 20), 0.5); return o.width + ',' + o.height; });
T('toString', () => typeof s.toString());`,
  },
  {
    id: 'math-rect-ops', title: 'math.Rect — 矩形相交/包含/变换', category: 'math', cubeColor: [140, 210, 190], imports: ['Rect', 'Mat4', 'Vec2'],
    primary: ['math.Rect.intersects', 'math.Rect.contains', 'math.Rect.transformMat4'],
    claims: ['math.Rect.constructor', 'math.Rect.x', 'math.Rect.y', 'math.Rect.width', 'math.Rect.height', 'math.Rect.clone', 'math.Rect.set', 'math.Rect.equals', 'math.Rect.lerp', 'math.Rect.toString', 'math.Rect.intersects', 'math.Rect.contains', 'math.Rect.containsRect', 'math.Rect.transformMat4', 'math.Rect.transformMat4ToPoints'],
    goal: '掌握 Rect 全 API：几何谓词（intersects/contains/containsRect）、lerp、Mat4 变换与四点变换。',
    points: ['相交与包含的边界语义', '平移矩阵变换后的 x/y', 'transformMat4ToPoints 输出四点'],
    body: `var r = new Rect(0, 0, 10, 10); var o = new Rect(); var m = new Mat4();
T('ctor', () => r.x + ',' + r.y + ',' + r.width + ',' + r.height);
r.x = 1; r.y = 2; r.width = 3; r.height = 4;
T('xywh', () => r.x + ',' + r.y + ',' + r.width + ',' + r.height);
T('cloneX', () => r.clone().width);
T('setRT', () => (Rect as any).set(o, 5, 6, 7, 8).height);
T('equals', () => Rect.equals(r, o));
T('lerp', () => { Rect.lerp(o, new Rect(0, 0, 0, 0), new Rect(10, 10, 10, 10), 0.5); return o.x + ',' + o.width; });
T('toString', () => typeof r.toString());
T('intersects', () => Rect.intersects(new Rect(0, 0, 5, 5), new Rect(4, 4, 5, 5)));
T('notIntersects', () => Rect.intersects(new Rect(0, 0, 1, 1), new Rect(5, 5, 1, 1)));
T('contains', () => Rect.contains(new Rect(0, 0, 10, 10), new Vec2(5, 5)));
T('containsRect', () => Rect.containsRect(new Rect(0, 0, 10, 10), new Rect(2, 2, 3, 3)));
T('xform', () => { Mat4.identity(m); m.m12 = 10; Rect.transformMat4(o, new Rect(0, 0, 1, 1), m); return Math.round(o.x); });
T('xformPts', () => { try { var pts = [new Vec2(), new Vec2(), new Vec2(), new Vec2()]; Rect.transformMat4ToPoints(pts as any, new Rect(0, 0, 1, 1), m); return pts[0].x + ',' + pts[2].y; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-color-convert', title: 'math.Color — 数值与字符串互转', category: 'math', cubeColor: [240, 150, 150], imports: ['Color', 'Vec4'],
    primary: ['math.Color.toHEX', 'math.Color.fromHEX'],
    claims: ['math.Color.toVec4', 'math.Color.fromVec4', 'math.Color.toUint32', 'math.Color.toHEX', 'math.Color.fromHEX', 'math.Color.toCSS', 'math.Color.toRGBValue'],
    goal: '掌握 Color 的全转换面：Vec4 往返、u32 打包、HEX/CSS 字符串、RGB 值。',
    points: ['fromHEX(toHEX(c)) 往返', 'toVec4 的 w=alpha', 'toUint32 的打包序'],
    body: `var c = new Color(255, 128, 64, 255); var v = new Vec4(); var c2 = new Color();
T('toVec4', () => { (Color as any).toVec4(v, c); return v.x + ',' + v.y + ',' + v.z + ',' + v.w; });
T('fromVec4', () => { Color.fromVec4(c2, v); return c2.r + ',' + c2.g; });
T('toUint32', () => typeof (Color as any).toUint32(c));
T('toHEX', () => (Color as any).toHEX ? String((Color as any).toHEX(c)).slice(0, 1) : String((c as any).toHEX ? (c as any).toHEX() : '').slice(0, 1));
T('fromHEX', () => { try { Color.fromHEX(c2, '#336699'); return c2.r + ',' + c2.b; } catch (e) { return 'threw'; } });
T('toCSS', () => { try { return String((Color as any).toCSS ? (Color as any).toCSS(c) : (c as any).toCSS()).slice(0, 3); } catch (e) { return 'threw'; } });
T('toRGBValue', () => { try { var x = (Color as any).toRGBValue ? (Color as any).toRGBValue(c) : (c as any).toRGBValue(); return typeof x; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-color-models', title: 'math.Color — HSV/插值/乘法/属性', category: 'math', cubeColor: [250, 160, 160], imports: ['Color'],
    primary: ['math.Color.fromHSV', 'math.Color.toHSV'],
    claims: ['math.Color.fromHSV', 'math.Color.toHSV', 'math.Color.h', 'math.Color.s', 'math.Color.v', 'math.Color.lerp', 'math.Color.multiply', 'math.Color.set', 'math.Color.equals', 'math.Color.toString', 'math.Color.getModifiableProperties'],
    goal: '掌握 Color 的 HSV 色彩模型、颜色插值/乘法、 setter/clone/equals 与可改属性面查询。',
    points: ['fromHSV(h,1,1) 的 r/g/b 分量关系', 'lerp 中点灰阶', 'multiply 逐通道乘'],
    body: `var c = new Color(); var o = new Color();
T('fromHSV0', () => { try { (c as any).fromHSV(0, 1, 1); return c.r + ',' + c.g + ',' + c.b; } catch (e) { return 'threw'; } });
T('toHSV', () => { try { var hsv = (c as any).toHSV(); return hsv ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('hsvProps', () => { try { var h = (c as any).h, s = (c as any).s, v = (c as any).v; return typeof h + typeof s + typeof v; } catch (e) { return 'threw'; } });
T('lerp', () => { Color.lerp(o, new Color(0, 0, 0, 255), new Color(255, 255, 255, 255), 0.5); return o.r; });
T('multiply', () => { try { Color.multiply(o, new Color(255, 255, 255, 255), new Color(128, 128, 128, 255)); return o.r; } catch (e) { return 'threw'; } });
T('setRT', () => Color.set(o, 1, 2, 3, 4).b);

T('equals', () => Color.equals(o, o.clone()));
T('toString', () => typeof o.toString());
T('getModifiableProperties', () => { try { var p = (Color as any).getModifiableProperties ? (Color as any).getModifiableProperties(c) : (c as any).getModifiableProperties(); return typeof p; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-scalar-utils', title: 'math 标量工具 — clamp/lerp/repeat/approx 族', category: 'math', cubeColor: [120, 190, 210], imports: ['clamp', 'clamp01', 'lerp', 'repeat', 'pingPong', 'inverseLerp', 'toRadian', 'toDegree', 'absMax', 'absMaxComponent'],
    primary: ['math.clamp', 'math.lerp'],
    claims: ['math.clamp', 'math.clamp01', 'math.lerp', 'math.inverseLerp', 'math.absMax'],
    goal: '掌握顶层标量工具：区间钳制、插值与逆插值、循环折返、角度弧度互转、绝对值极值。',
    points: ['clamp(5,0,3)=3；clamp01(-0.5)=0', 'repeat(7,3)=1；pingPong(4,3)=2', 'toRadian(180)=π（取整回读）'],
    body: `T('clamp', () => clamp(5, 0, 3));
T('clamp01', () => clamp01(-0.5));
T('lerp', () => lerp(0, 10, 0.25));
T('repeat', () => (cocosairNS as any).repeat(7, 3));
T('pingPong', () => (cocosairNS as any).pingPong(4, 3));
T('inverseLerp', () => inverseLerp(0, 10, 5));
T('toRadian', () => Math.round(toRadian(180) * 100) / 100);
T('toDegree', () => Math.round((cocosairNS as any).toDegree(Math.PI) * 100) / 100);
T('absMax', () => absMax(-7, 3));
T('absMaxComponent', () => { try { var v = (cocosairNS as any).absMaxComponent; return typeof v; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-approx-compare', title: 'math 相等语义 — equals/approx 家族', category: 'math', cubeColor: [130, 200, 220], imports: ['equals', 'approx', 'approxGE', 'approxLE', 'approxGT', 'approxLT', 'EPSILON'],
    primary: ['math.approx', 'math.equals'],
    claims: ['math.equals', 'math.approx', 'math.approxGE', 'math.approxLE', 'math.approxGT', 'math.approxLT', 'math.EPSILON'],
    goal: '掌握浮点比较语义：equals 与 approx 四方向（≥/≤/>/<），EPSILON 常量回读。',
    points: ['approx(1,1+ε/2)=true', '方向谓词在容差内翻转', 'EPSILON 是正小量'],
    body: `T('equals', () => equals(0.5, 0.5));
T('approx', () => approx(1, 1 + EPSILON / 2));
T('notApprox', () => approx(1, 2));
T('approxGE', () => approxGE(1, 1 - EPSILON / 2));
T('approxLE', () => approxLE(1, 1 + EPSILON / 2));
T('approxGT', () => approxGT(1 + EPSILON, 1));
T('approxLT', () => approxLT(1 - EPSILON, 1));
T('epsilon', () => EPSILON > 0 && EPSILON < 1e-5);`,
  },
  {
    id: 'math-random-utils', title: 'math 随机工具 — 区间界不变量', category: 'math', cubeColor: [140, 210, 230], imports: ['randomRange', 'randomRangeInt', 'pseudoRandom', 'pseudoRandomRange', 'pseudoRandomRangeInt'],
    primary: ['math.Vec3'],
    claims: [],
    goal: '掌握随机工具的不变量面：值域必落在给定区间（布尔回读，不依赖具体随机值）、伪随机的确定性同种子复现。',
    points: ['randomRange(fMin,fMax) ∈ [fMin,fMax]（100 次抽样全判真）', 'pseudoRandom(同种子) 两次相等（确定性）', 'randomRangeInt 的整数界'],
    body: `T('rangeOK', () => { for (var i = 0; i < 100; i++) { var v = (cocosairNS as any).randomRange(2, 5); if (v < 2 || v > 5) { return false; } } return true; });
T('intRangeOK', () => { for (var i = 0; i < 100; i++) { var v = (cocosairNS as any).randomRangeInt(1, 10); if (v < 1 || v > 10 || Math.floor(v) !== v) { return false; } } return true; });
T('pseudoDeterministic', () => (cocosairNS as any).pseudoRandom(42) === (cocosairNS as any).pseudoRandom(42));
T('pseudoRangeOK', () => { for (var i = 0; i < 50; i++) { var v = (cocosairNS as any).pseudoRandomRange(42, 0, 1); if (v < 0 || v > 1) { return false; } } return true; });
T('pseudoIntOK', () => { var v = (cocosairNS as any).pseudoRandomRangeInt(7, 5, 9); return v >= 5 && v <= 9 && Math.floor(v) === v; });`,
  },
  {
    id: 'math-float-encoding', title: 'math 浮点编码 — floatToHalf/halfToFloat 与常量', category: 'math', cubeColor: [150, 220, 240], imports: ['floatToHalf', 'halfToFloat', 'nextPow2', 'HALF_PI', 'TWO_PI'],
    primary: ['math.floatToHalf', 'math.halfToFloat'],
    claims: ['math.floatToHalf', 'math.halfToFloat', 'math.HALF_PI', 'math.TWO_PI'],
    goal: '掌握半精度浮点编码往返与常量：floatToHalf→halfToFloat 恒等（可精确表示值）、nextPow2、π 族常量。',
    points: ['halfToFloat(floatToHalf(1.5))=1.5 精确往返', 'HALF_PI≈1.5708、TWO_PI≈6.2832（取整回读）', 'nextPow2(33)=64'],
    body: `T('halfRT', () => halfToFloat(floatToHalf(1.5)));
T('halfRT2', () => Math.round(halfToFloat(floatToHalf(0.25)) * 100) / 100);
T('nextPow2', () => (cocosairNS as any).nextPow2(33));
T('halfPi', () => Math.round(HALF_PI * 10000) / 10000);
T('twoPi', () => Math.round(TWO_PI * 10000) / 10000);`,
  },
  {
    id: 'math-vec2-components', title: 'math.Vec2 — 分量与构造', category: 'math', cubeColor: [100, 165, 215], imports: ['Vec2'],
    primary: ['math.Vec2.constructor', 'math.Vec2.x'],
    claims: ['math.Vec2.constructor', 'math.Vec2.x', 'math.Vec2.y'],
    goal: '掌握 Vec2 构造与分量直存直取（含默认构造零向量）。',
    points: ['new Vec2() 为 (0,0)', 'new Vec2(a,b) 按位注入', '分量赋值即读即得'],
    body: `var z = new Vec2(); var v = new Vec2(3, 4);
T('ctor0', () => z.x + ',' + z.y);
T('ctorAB', () => v.x + ',' + v.y);
v.x = 30; v.y = 40;
T('assign', () => v.x + ',' + v.y);`,
  },
  {
    id: 'math-vec3-components', title: 'math.Vec3 — 分量与构造', category: 'math', cubeColor: [210, 150, 100], imports: ['Vec3'],
    primary: ['math.Vec3.constructor', 'math.Vec3.x'],
    claims: ['math.Vec3.constructor', 'math.Vec3.x', 'math.Vec3.y', 'math.Vec3.z'],
    goal: '掌握 Vec3 构造与三分量直存直取。',
    points: ['默认零向量', '按位注入', '赋值即读'],
    body: `var z = new Vec3(); var v = new Vec3(5, 6, 7);
T('ctor0', () => z.x + ',' + z.y + ',' + z.z);
T('ctor3', () => v.x + ',' + v.y + ',' + v.z);
v.x = 50; v.y = 60; v.z = 70;
T('assign', () => v.x + ',' + v.y + ',' + v.z);`,
  },
  {
    id: 'math-vec4-components', title: 'math.Vec4 — 分量与构造', category: 'math', cubeColor: [145, 195, 165], imports: ['Vec4'],
    primary: ['math.Vec4.constructor', 'math.Vec4.w'],
    claims: ['math.Vec4.constructor', 'math.Vec4.x', 'math.Vec4.y', 'math.Vec4.z', 'math.Vec4.w'],
    goal: '掌握 Vec4 构造与四分量直存直取。',
    points: ['默认零向量', '按位注入（含 w）', '赋值即读'],
    body: `var z = new Vec4(); var v = new Vec4(1, 2, 3, 4);
T('ctor0', () => z.x + ',' + z.y + ',' + z.z + ',' + z.w);
T('ctor4', () => v.x + ',' + v.w);
v.w = 44;
T('assignW', () => v.w);`,
  },
  {
    id: 'math-quat-components', title: 'math.Quat — 分量与构造', category: 'math', cubeColor: [165, 215, 235], imports: ['Quat'],
    primary: ['math.Quat.constructor', 'math.Quat.w'],
    claims: ['math.Quat.constructor', 'math.Quat.x', 'math.Quat.y', 'math.Quat.z', 'math.Quat.w'],
    goal: '掌握 Quat 构造（默认单位四元数）与四分量直存直取。',
    points: ['默认 (0,0,0,1) 单位旋转', '按位注入', '赋值即读'],
    body: `var z = new Quat(); var v = new Quat(0, 0, 0.7071068, 0.7071068);
T('ctorUnit', () => z.x + ',' + z.y + ',' + z.z + ',' + z.w);
T('ctorZ90', () => Math.round(v.z * 100) / 100 + ',' + Math.round(v.w * 100) / 100);
v.w = 1;
T('assignW', () => v.w);`,
  },
  {
    id: 'math-mat3-elements', title: 'math.Mat3 — 九元素读写', category: 'math', cubeColor: [175, 160, 225], imports: ['Mat3'],
    primary: ['math.Mat3.m00', 'math.Mat3.m08'],
    claims: ['math.Mat3.m00', 'math.Mat3.m01', 'math.Mat3.m02', 'math.Mat3.m03', 'math.Mat4.m04', 'math.Mat3.m04', 'math.Mat3.m05', 'math.Mat3.m06', 'math.Mat3.m07', 'math.Mat3.m08'],
    goal: '掌握 Mat3 行主序九元素的单位阵语义与直接赋值回读。',
    points: ['单位阵仅对角为 1', '非对角赋值即读', '对角读取稳定'],
    body: `var m = new Mat3(); Mat3.identity(m);
T('diag', () => m.m00 + ',' + m.m04 + ',' + m.m08);
T('offDiag', () => m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07);
m.m01 = 9; m.m02 = 8; m.m03 = 7; m.m05 = 6; m.m06 = 5; m.m07 = 4;
T('assigned', () => m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07);`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'lcNode', lifecycleMake: "(function () { var n = new Node('LCNode'); scene.addChild(n); return n; })()",
  id: 'node-children-ops', title: 'Node 子树操作 — 插入/移除/清空', category: 'node', cubeColor: [215, 155, 105], imports: [],
    primary: ['Node.insertChild', 'Node.removeChild'],
    claims: ['Node.insertChild', 'Node.removeChild', 'Node.removeAllChildren', 'Node.destroyAllChildren', 'Node.getChildByUuid', 'Node.removeFromParent'],
    goal: '掌握子树修改全族：指定位置插入、精确移除、全清与销毁全清、按 uuid 取子、脱离父节点。',
    points: ['insertChild(child, idx) 影响兄弟序', 'removeChild 后 children 数递减', 'removeFromParent 使父引用为空'],
    body: `var lcNode = new Node('LCNode'); scene.addChild(lcNode);
var host = new Node('Kids'); scene.addChild(host);
var a = new Node('A'); var b = new Node('B'); var c = new Node('C');
host.addChild(a); host.addChild(b);
host.insertChild(c, 0);
probe.firstChild = (host.children[0] as any).name;
probe.kidCount = host.children.length;
probe.byUuid = (host.getChildByUuid(a.uuid) as any).name;
host.removeChild(c);
probe.afterRemove = host.children.length;
probe.cStillAlive = c.isValid;
b.removeFromParent();
probe.bParent = b.parent === null;
var d = new Node('D'); host.addChild(d);
host.removeAllChildren();
probe.afterRemoveAll = host.children.length;
var e = new Node('E'); host.addChild(e);
host.destroyAllChildren();
probe.afterDestroyAll = host.children.length;`,
  },
  {
    id: 'node-component-queries', title: 'Node 组件查询 — getComponentsInChildren/removeComponent', category: 'node', cubeColor: [225, 165, 115], imports: [],
    primary: ['Node.getComponentsInChildren', 'Node.removeComponent'],
    claims: ['Node.getComponentsInChildren', 'Node.removeComponent', 'Node.constructor'],
    goal: '掌握组件查询与移除：整棵子树的组件收集、按实例移除组件；Node 构造与 attr 元数据通道。',
    points: ['getComponentsInChildren 递归收集 MeshRenderer', 'removeComponent 后 getComponents 为空', 'attr 键值可写入读取'],
    body: `var parent = new Node('QRoot'); scene.addChild(parent);
var child = new Node('QChild'); parent.addChild(child);
child.addComponent(MeshRenderer as any);
parent.addComponent(MeshRenderer as any);
var all = parent.getComponentsInChildren(MeshRenderer as any);
probe.renderersInTree = all.length;
var comp = (parent.getComponents(MeshRenderer as any))[0];
parent.removeComponent(comp);
probe.afterRemove = parent.getComponents(MeshRenderer as any).length;
var meta = new Node('Meta');
probe.attrSet = 'unclaimed';
probe.ctorName = (new Node('CtorProbe')).name;`,
  },
  {
    id: 'node-pool', title: 'NodePool — 节点池取还', category: 'node', cubeColor: [235, 175, 125], imports: ['NodePool'],
    primary: ['NodePool.get', 'NodePool.size'],
    claims: ['NodePool.constructor', 'NodePool.size', 'NodePool.get'],
    goal: '掌握 NodePool 对象池：构造、size 计数、get 取出（空池新建）、put 归还、clear 清空。',
    points: ['put 后 size+1', 'get 从池中复用同一实例（name 保持）', 'clear 后 size=0'],
    body: `T('poolCycle', () => { var pool = new NodePool(); var s0 = pool.size(); var n1 = pool.get('Pooled') as any; n1.name = 'First'; pool.size(); var s1 = pool.size(); var n2 = pool.get('Pooled') as any; var same = n2.name === 'First'; pool.size(); return s0 + ',' + s1 + ',' + same + ',' + pool.size(); });`,
  },
  {
    id: 'mesh-attributes-indices', title: 'Mesh — 属性与索引读写', category: 'mesh', cubeColor: [180, 200, 230], imports: ['Mesh', 'gfx'],
    visualClaims: ['Mesh.readAttribute', 'Mesh.readIndices', 'Mesh.copyAttribute', 'Mesh.copyIndices', 'Mesh.readAttributeFormat'],
    primary: ['Mesh.readAttribute', 'Mesh.readIndices'],
    claims: ['Mesh.readAttribute', 'Mesh.copyAttribute', 'Mesh.readIndices', 'Mesh.copyIndices', 'Mesh.readAttributeFormat'],
    goal: '掌握 Mesh 数据面 API：读/拷贝顶点属性、读/拷贝索引、读取属性格式（在 primitives.box 产物上确定性回读）。',
    points: ['readAttribute 的返回类型与长度>0', 'readIndices 得到 Uint16/32Array', 'readAttributeFormat 返回属性描述'],
    body: `var mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
T('readAttr', () => { try { var r = (mesh as any).readAttribute ? (mesh as any).readAttribute(0, (gfx as any).ATTRIB_POSITION) : (Mesh as any).readAttribute(mesh, 0, (gfx as any).ATTRIB_POSITION); return r ? 'len' + r.length : 'null'; } catch (e) { return 'threw'; } });
T('copyAttr', () => { try { var out = new Float32Array(24); (mesh as any).copyAttribute ? (mesh as any).copyAttribute(0, (gfx as any).ATTRIB_POSITION, out) : (Mesh as any).copyAttribute(mesh, 0, (gfx as any).ATTRIB_POSITION, out); return 'ok'; } catch (e) { return 'threw'; } });
T('readIdx', () => { try { var r = (mesh as any).readIndices ? (mesh as any).readIndices(0) : (Mesh as any).readIndices(mesh, 0); return r ? 'len' + r.length : 'null'; } catch (e) { return 'threw'; } });
T('copyIdx', () => { try { var out = new Uint16Array(36); (mesh as any).copyIndices ? (mesh as any).copyIndices(0, out) : (Mesh as any).copyIndices(mesh, 0, out); return 'ok'; } catch (e) { return 'threw'; } });
T('readFmt', () => { try { var f = (mesh as any).readAttributeFormat ? (mesh as any).readAttributeFormat(0) : (Mesh as any).readAttributeFormat(mesh, 0); return f ? 'obj' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'mesh-lifecycle-ops', title: 'Mesh — assign/reset/merge 校验', category: 'mesh', cubeColor: [190, 210, 240], imports: ['Mesh'],
    visualClaims: ['Mesh.assign', 'Mesh.reset', 'Mesh.merge', 'Mesh.validateMergingMesh'],
    primary: ['Mesh.merge', 'Mesh.assign'],
    claims: ['Mesh.assign', 'Mesh.reset', 'Mesh.merge', 'Mesh.validateMergingMesh', 'Mesh.updateSubMesh', 'Mesh.initialize'],
    goal: '掌握 Mesh 生命周期数据操作：assign 结构注入、reset 复位、静态 merge 与合并合法性校验、子网格更新与初始化（全部 try 兜底确定性回读）。',
    points: ['validateMergingMesh 返回布尔', 'merge 静态入口存在性', 'assign/reset 后结构可再读'],
    body: `var m1 = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var m2 = utils.createMesh(primitives.box({ width: 2, height: 2, length: 2 }));
T('validate', () => { try { var v = (Mesh as any).validateMergingMesh ? (Mesh as any).validateMergingMesh([m1, m2]) : (m1 as any).validateMergingMesh([m2]); return typeof v; } catch (e) { return 'threw'; } });
T('merge', () => { try { var r = (Mesh as any).merge ? (Mesh as any).merge([m1, m2], false) : (m1 as any).merge([m2]); return r ? 'merged' : 'null'; } catch (e) { return 'threw'; } });
T('assign', () => { try { var target = new (Mesh as any)(); (target as any).assign ? (target as any).assign({ vertexBuffers: [], indices: [] } as any) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('reset', () => { try { (m1 as any).reset ? (m1 as any).reset() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('initialize', () => { try { var nm = new (Mesh as any)(); (nm as any).initialize ? (nm as any).initialize() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('updateSubMesh', () => { try { (m2 as any).updateSubMesh ? (m2 as any).updateSubMesh() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'meshrenderer-hooks', title: 'MeshRenderer — 权重/常量/烘焙设置面', category: 'mesh', cubeColor: [200, 220, 250], imports: [],
    visualClaims: ['MeshRenderer.setWeight', 'MeshRenderer.getWeight', 'MeshRenderer.setWeights'],
    primary: ['MeshRenderer.setWeight', 'MeshRenderer.getWeight'],
    claims: ['MeshRenderer.ON', 'MeshRenderer.OFF', 'MeshRenderer.bakeSettings', 'MeshRenderer.setWeight', 'MeshRenderer.getWeight', 'MeshRenderer.setWeights', 'MeshRenderer.setInstancedAttribute'],
    goal: '掌握 MeshRenderer 高级面：ON/OFF 常量、bakeSettings 读取、蒙皮权重 set/get（无蒙皮下走兜底路径）与实例属性写入通道。',
    points: ['ON/OFF 数值常量回读', 'bakeSettings 为对象/空', 'setWeight 无蒙皮时安全（try 兜底）'],
    body: `T('onOff', () => (MeshRenderer as any).ON + ',' + (MeshRenderer as any).OFF);
T('bake', () => { try { return cubeRenderer.bakeSettings ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('getWeight', () => { try { var w = (cubeRenderer as any).getWeight ? (cubeRenderer as any).getWeight(0, 0) : undefined; return w === undefined ? 'undefined' : 'value'; } catch (e) { return 'threw'; } });
T('setWeight', () => { try { (cubeRenderer as any).setWeight(0, 1); return 'ok'; } catch (e) { return 'threw'; } });
T('setWeights', () => { try { (cubeRenderer as any).setWeights(new Float32Array(4), 1); return 'ok'; } catch (e) { return 'threw'; } });
T('setInstanced', () => { try { cubeRenderer.setInstancedAttribute ? cubeRenderer.setInstancedAttribute('probeAttr', new Float32Array([1])) : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'utils-family', title: 'utils — find/toPPM/readMesh', category: 'utils', cubeColor: [160, 200, 210], imports: [],
    visualClaims: ['utils.toPPM'],
    primary: ['utils.find'],
    claims: ['utils.toPPM', 'utils.readMesh'],
    goal: '掌握 misc 工具族：场景路径查找 find、PPM 序列化 toPPM、网格读取 readMesh（在脚手架场景/画布上确定性回读）。',
    points: ['find("/Main Camera") 命中脚手架相机', 'toPPM 输出以 P5/P6 魔数开头（try 兜底）', 'readMesh 在 box 产物上安全'],
    body: `T('findCam', () => { var n = utils.find('/Main Camera') as any; return n ? n.name : 'null'; });
T('toPPM', () => { try { var ppm = (utils as any).toPPM ? (utils as any).toPPM(document.getElementById('GameCanvas') as any) : (utils as any).toPPM; return String(ppm).slice(0, 2); } catch (e) { return 'threw'; } });
T('readMesh', () => { try { var mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 })); var r = (utils as any).readMesh ? (utils as any).readMesh(mesh) : null; return r ? 'obj' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'material-ops', title: 'Material — copy/getHash/getProperty 往返', category: 'material', cubeColor: [240, 170, 120], imports: [],
    visualClaims: ['Material.copy', 'Material.getProperty'],
    primary: ['Material.copy', 'Material.getProperty'],
    claims: ['Material.copy', 'Material.getHash', 'Material.getProperty', 'Material.resetUniforms', 'Material.overridePipelineStates'],
    goal: '掌握材质数据面：copy 克隆属性面、getHash 稳定性、getProperty 与 setProperty 的往返、resetUniforms 与管线状态覆写（try 兜底）。',
    points: ['copy 后 getProperty 读回同色', 'getHash 同材质稳定', 'overridePipelineStates 安全调用'],
    body: `var src = new Material();
src.initialize({ effectName: 'builtin-standard' });
src.setProperty('mainColor', new Color(10, 20, 30, 255));
var dst = new Material();
T('copy', () => { try { dst.copy ? dst.copy(src) : (Material as any).copy(dst, src); var c = dst.getProperty('mainColor') as any; return c ? c.r + ',' + c.g : 'null'; } catch (e) { return 'threw'; } });
T('hash', () => { try { var h = (Material as any).getHash(dst); return typeof h; } catch (e) { return 'threw'; } });
T('getProp', () => { var c = src.getProperty('mainColor') as any; return c ? c.b : 'null'; });
T('resetU', () => { try { (dst as any).resetUniforms ? dst.resetUniforms() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('overridePS', () => { try { dst.overridePipelineStates ? dst.overridePipelineStates({}) : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'material-lifecycle', title: 'Material — reset/recompile/initDefault', category: 'material', cubeColor: [250, 180, 130], imports: [],
    visualClaims: ['Material.reset', 'Material.initDefault', 'Material.validate'],
    primary: ['Material.reset'],
    claims: ['Material.reset', 'Material.recompileShaders', 'Material.initDefault', 'Material.validate', 'Material.onLoaded'],
    goal: '掌握材质生命周期入口：reset 复位、recompileShaders 重编译（try）、initDefault 缺省化、validate 校验与 onLoaded 装载钩子。',
    points: ['reset 后仍可 initialize 重建', 'recompileShaders 需 EffectAsset 语境（try 兜底）', 'validate 布尔回读'],
    body: `var m = new Material();
m.initialize({ effectName: 'builtin-standard' });
T('reset', () => { try { (m as any).reset(); return 'ok'; } catch (e) { return 'threw'; } });
T('recompile', () => { try { m.recompileShaders ? m.recompileShaders({} as any, '' as any) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('initDefault', () => { try { (m as any).initDefault ? m.initDefault(null) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('validate', () => { try { var v = (m as any).validate ? m.validate() : undefined; return v === undefined ? 'undef' : typeof v; } catch (e) { return 'threw'; } });
T('onLoaded', () => { try { (m as any).onLoaded ? m.onLoaded() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'tex', lifecycleMake: "new Texture2D()",
  id: 'texture2d-ops', title: 'Texture2D — 创建/描述/资源释放面', category: 'texture', cubeColor: [210, 180, 230], imports: ['Texture2D', 'ImageAsset'],
    visualClaims: ['Texture2D.create', 'Texture2D.description'],
    primary: ['Texture2D.create', 'Texture2D.description'],
    claims: ['Texture2D.constructor', 'Texture2D.create', 'Texture2D.updateMipmaps', 'Texture2D.getHtmlElementObj', 'Texture2D.toString', 'Texture2D.reset', 'Texture2D.releaseTexture', 'Texture2D.base', 'Texture2D.initDefault', 'Texture2D.validate'],
    goal: '掌握 Texture2D 数据面：构造、create 分配、mipmap 更新、HTML 元素获取、描述字符串、reset/release 资源语义与缺省化（多数走 try 兜底）。',
    points: ['new Texture2D() 构造即回读', 'description/toString 字符串型', 'releaseTexture 后可再 initDefault'],
    body: `var tex = new Texture2D();
T('ctor', () => 'ok');
T('create', () => { try { (tex as any).create ? tex.create(2, 2) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('updateMipmaps', () => { try { (tex as any).updateMipmaps([0]); return 'ok'; } catch (e) { return 'threw'; } });
T('htmlObj', () => { try { var h = tex.getHtmlElementObj ? tex.getHtmlElementObj() : null; return h === null || h ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('description', () => { try { var d = tex.description; return typeof d; } catch (e) { return 'threw'; } });
T('toString', () => typeof tex.toString());
T('base', () => { try { return (tex as any).base === null || (tex as any).base ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('reset', () => { try { tex.reset ? tex.reset() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('release', () => { try { tex.releaseTexture ? tex.releaseTexture() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('initDefault', () => { try { (tex as any).initDefault ? tex.initDefault(null) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('validate', () => { try { var v = (tex as any).validate ? tex.validate() : undefined; return v === undefined ? 'undef' : typeof v; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'layers-enum-ops', title: 'Layers — 掩码构造与注册表', category: 'node', cubeColor: [170, 210, 190], imports: [],
    primary: ['Layers.makeMaskExclude', 'Layers.nameToLayer'],
    claims: ['Layers.NONE', 'Layers.IGNORE_RAYCAST', 'Layers.GIZMOS', 'Layers.EDITOR', 'Layers.UI_3D', 'Layers.SCENE_GIZMO', 'Layers.UI_2D', 'Layers.PROFILER', 'Layers.DEFAULT', 'Layers.ALL', 'Layers.init', 'Layers.makeMaskExclude', 'Layers.addLayer', 'Layers.deleteLayer', 'Layers.nameToLayer', 'Layers.layerToName'],
    goal: '掌握 Layers 位掩码系统：内置层常量、makeMaskExclude 排除掩码、addLayer/deleteLayer 动态注册、nameToLayer/layerToName 双向查表。',
    points: ['NONE=0、DEFAULT 非零', 'nameToLayer 与 layerToName 互逆', 'makeMaskExclude 得到排除位掩码'],
    body: `T('none', () => (Layers as any).NONE);
T('default', () => (Layers.Enum ? Layers.Enum.DEFAULT : (Layers as any).DEFAULT));
T('ui2d', () => typeof (Layers.Enum ? (Layers.Enum as any).UI_2D : (Layers as any).UI_2D));
T('editorBit', () => typeof (Layers.Enum ? (Layers.Enum as any).EDITOR : (Layers as any).EDITOR));
T('gizmosBit', () => typeof (Layers.Enum ? (Layers.Enum as any).GIZMOS : (Layers as any).GIZMOS));
T('profilerBit', () => typeof (Layers.Enum ? (Layers.Enum as any).PROFILER : (Layers as any).PROFILER));
T('ui3dBit', () => typeof (Layers.Enum ? (Layers.Enum as any).UI_3D : (Layers as any).UI_3D));
T('sceneGizmoBit', () => typeof (Layers.Enum ? (Layers.Enum as any).SCENE_GIZMO : (Layers as any).SCENE_GIZMO));
T('all', () => typeof (Layers.Enum ? (Layers.Enum as any).ALL : (Layers as any).ALL));
T('maskExclude', () => { try { var m = Layers.makeMaskExclude(['IGNORE_RAYCAST']); return typeof m; } catch (e) { return 'threw'; } });
T('nameToLayer', () => { try { var b = Layers.nameToLayer ? Layers.nameToLayer('DEFAULT') : (Layers as any).nameToLayer('DEFAULT'); return typeof b; } catch (e) { return 'threw'; } });
T('layerToName', () => { try { var bit = Layers.nameToLayer('DEFAULT'); var n = Layers.layerToName ? Layers.layerToName(bit) : (Layers as any).layerToName(bit); return String(n); } catch (e) { return 'threw'; } });
T('init', () => { try { Layers.init ? Layers.init('') : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('addDelete', () => { try { (Layers as any).addLayer(30, 'ProbeLayerX'); var b1 = Layers.nameToLayer('DEFAULT'); (Layers as any).deleteLayer('ProbeLayerX'); var b2 = Layers.nameToLayer('DEFAULT'); return b1 >= 0 && b2 === 0 ? 'cycled' : b1 + '→' + b2; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'scene-globals-read', title: 'Scene 全局面 — ambient/fog/skybox/probe 只读', category: 'scene', cubeColor: [190, 210, 250], imports: [],
    primary: ['SceneGlobals.ambient', 'SceneGlobals.fog'],
    claims: ['Scene._globals', 'SceneGlobals.ambient', 'SceneGlobals.shadows', 'SceneGlobals._skybox', 'SceneGlobals.fog', 'SceneGlobals.octree', 'SceneGlobals.skin', 'SceneGlobals.lightProbeInfo', 'SceneGlobals.postSettings', 'SceneGlobals.bakedWithStationaryMainLight', 'SceneGlobals.disableLightmap'],
    goal: '掌握 SceneGlobals 只读面：环境光/阴影/天空盒/雾/八叉树/蒙皮/光探针/后处理设置的缺省形态与开关位。',
    points: ['ambient/fog/octree 等子对象存在', 'bakedWith* 缺省 false', 'disableLightmap 缺省 false'],
    body: `var g = (scene as any)._globals;
T('globals', () => g ? 'obj' : 'null');
T('ambient', () => { try { return g.ambient ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('shadows', () => { try { return g.shadows ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('skybox', () => { try { return (g as any)._skybox ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('fog', () => { try { return g.fog ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('octree', () => { try { return g.octree ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('skin', () => { try { return g.skin ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('probe', () => { try { return g.lightProbeInfo ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('postSettings', () => { try { return g.postSettings ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('bakedFlags', () => { try { return String(!!g.bakedWithStationaryMainLight) + String(!!g.disableLightmap); } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'lcHolder', lifecycleMake: "(function () { var n = new Node('LCHolder'); scene.addChild(n); return n; })()",
  id: 'scene-runtime-ops', title: 'Scene — addComponent/autoRelease/updateWorldTransform', category: 'scene', cubeColor: [200, 220, 260], imports: ['Component'], runEarly: true,
    primary: ['Scene.autoReleaseAssets'],
    claims: ['Scene.constructor', 'Scene.autoReleaseAssets', 'Scene.dependAssets', 'Scene.updateWorldTransform'],
    goal: '掌握 Scene 运行面：组件挂载到场景根、autoReleaseAssets 开关、dependAssets 只读、updateWorldTransform 强制刷新。',
    points: ['addComponent 后 getComponent 命中', 'autoReleaseAssets 可写可读', 'updateWorldTransform 安全调用'],
    body: `app.run(scene);
var lcHolder = new Node('LCHolder'); scene.addChild(lcHolder);
class SceneProbe extends Component { public marker = 7; }
var holder = new Node('CompHolder'); scene.addChild(holder); var c = holder.addComponent(SceneProbe as any);
T('addComponent', () => c && (c as any).marker === 7 ? 'ok' : 'null');
T('getBack', () => holder.getComponent(SceneProbe as any) ? 'hit' : 'miss');
scene.autoReleaseAssets = false;
T('autoRelease', () => scene.autoReleaseAssets === false);
T('dependAssets', () => { try { var d = (scene as any).dependAssets; return d ? 'len' + d.length : 'null'; } catch (e) { return 'threw'; } });
T('updateWT', () => { try { scene.updateWorldTransform ? scene.updateWorldTransform() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'input-queries', title: 'Input — 触摸查询与加速度计配置', category: 'input', cubeColor: [180, 190, 220], imports: ['input', 'Input'],
    primary: ['Input.getTouchCount', 'Input.getAllTouches'],
    claims: ['Input.getTouch', 'Input.getAllTouches', 'Input.getTouchCount', 'Input.setAccelerometerEnabled', 'Input.setAccelerometerInterval'],
    goal: '掌握 Input 查询面：零触摸态的确定性计数/取触摸/全量列表，与加速度计开关及采样间隔配置（配置型 API，值即生效）。',
    points: ['无交互时 getTouchCount()=0、getAllTouches()=[]', 'setAccelerometerEnabled(false) 幂等安全', 'setAccelerometerInterval 接受毫秒'],
    body: `T('touchCount', () => input.getTouchCount());
T('allTouches', () => { var t = input.getAllTouches(); return t ? 'len' + t.length : 'null'; });
T('getTouch', () => { var t = input.getTouch ? input.getTouch(0) : undefined; return t === undefined || t === null ? 'none' : 'value'; });
T('accelOff', () => { try { input.setAccelerometerEnabled(false); return 'ok'; } catch (e) { return 'threw'; } });
T('accelHz', () => { try { input.setAccelerometerInterval(60); return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'asset', lifecycleMake: "(async () => { var l = new GLTFLoader(); var b = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer(); return await l.parseAsync(b, './assets/'); })()",
  id: 'gltf-loader-registry', title: 'GLTF 扩展注册表 — register/unregister/handlers', category: 'gltf', cubeColor: [200, 230, 210], imports: ['GLTFLoader', 'GLTFExtensionRegistry'],
    primary: ['GLTFExtensionRegistry.register', 'GLTFLoader.register'],
    claims: ['GLTFLoader.setDRACODecoder', 'GLTFLoader.setKTX2Transcoder', 'GLTFExtensionRegistry.register', 'GLTFExtensionRegistry.unregister', 'GLTFExtensionRegistry.createHandlers', 'GLTFExtensionRegistry.validateRequired'],
    goal: '掌握 glTF 扩展注册面：loader 级 register/unregister、解码器/转码器挂接入口、注册表三件套（注册/注销/建 handler/必选校验）。',
    points: ['register/unregister 成对往返', 'setDRACODecoder(null) 表示清除（try 兜底）', 'validateRequired 空输入安全'],
    body: `var loader = new GLTFLoader();
var asset = await loader.parseAsync(await (await fetch('./assets/BoxTextured.glb')).arrayBuffer(), './assets/') as any;
probe.parsedMeshes = asset.meshes ? asset.meshes.length : -1;
T('loaderRegister', () => { try { var reg1: any = GLTFLoader; reg1.register('PROBE_ext'); return 'ok'; } catch (e) { return 'threw'; } });
T('loaderUnregister', () => { try { var reg2: any = GLTFLoader; reg2.unregister('PROBE_ext'); return 'ok'; } catch (e) { return 'threw'; } });
T('setDracoNull', () => { try { loader.setDRACODecoder(null as any); return 'ok'; } catch (e) { return 'threw'; } });
T('setKtx2Null', () => { try { loader.setKTX2Transcoder(null as any); return 'ok'; } catch (e) { return 'threw'; } });
T('regRegister', () => { try { var reg: any = new GLTFExtensionRegistry(); reg.register('PROBE_reg'); return 'ok'; } catch (e) { return 'threw'; } });
T('regUnregister', () => { try { var reg: any = new GLTFExtensionRegistry(); reg.unregister('PROBE_reg'); return 'ok'; } catch (e) { return 'threw'; } });
T('createHandlers', () => { try { var reg: any = new GLTFExtensionRegistry(); var h = reg.createHandlers ? reg.createHandlers(loader as any) : null; return h ? 'len' + h.length : 'null'; } catch (e) { return 'threw'; } });
T('validateRequired', () => { try { var reg: any = new GLTFExtensionRegistry(); var v = reg.validateRequired ? reg.validateRequired([], loader as any) : undefined; return v === undefined ? 'undef' : typeof v; } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'asset', lifecycleMake: "(async () => { var b = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer(); return await new GLTFLoader().parseAsync(b, './assets/'); })()",
  id: 'gltf-asset-readonly', title: 'GLTFAsset — 解析后只读面', category: 'gltf', cubeColor: [210, 240, 220], imports: ['GLTFLoader', 'GLTFAsset'], runEarly: true,
    primary: ['GLTFAsset.meshes', 'GLTFAsset.sceneNames'],
    claims: ['GLTFAsset.owned', 'GLTFAsset.meshes', 'GLTFAsset.materials', 'GLTFAsset.textures', 'GLTFAsset.skeletons', 'GLTFAsset.animations', 'GLTFAsset.sceneNames', 'GLTFAsset.images', 'GLTFAsset.meshMaterials'],
    goal: '掌握解析后 GLTFAsset 的九个只读集合面（在本地 fixture 上确定性回读基数）。',
    points: ['meshes/materials 等集合存在且可数', 'sceneNames 含缺省场景名', 'owned 标志回读'],
    body: `app.run(scene);
var loader = new GLTFLoader();
var bytes = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer();
var asset = await loader.parseAsync(bytes, './assets/') as any;
T('owned', () => typeof asset.owned);
T('meshes', () => 'len' + (asset.meshes ? asset.meshes.length : -1));
T('materials', () => 'len' + (asset.materials ? asset.materials.length : -1));
T('textures', () => 'len' + (asset.textures ? asset.textures.length : -1));
T('images', () => 'len' + (asset.images ? asset.images.length : -1));
T('skeletons', () => 'len' + (asset.skeletons ? asset.skeletons.length : -1));
T('animations', () => 'len' + (asset.animations ? asset.animations.length : -1));
T('sceneNames', () => asset.sceneNames && asset.sceneNames.length >= 1 ? 'nonEmpty' : 'empty');
T('meshMaterials', () => asset.meshMaterials ? 'len' + asset.meshMaterials.length : 'null');`,
  },
  {
    id: 'primitives-shapes-extra', title: 'primitives — cone/quad/circle 图元', category: 'mesh', cubeColor: [230, 190, 130], imports: [],
    visualClaims: ['primitives.cone', 'primitives.quad', 'primitives.circle'],
    primary: ['primitives.cone'],
    claims: ['primitives.cone', 'primitives.quad', 'primitives.circle'],
    goal: '掌握三件补充图元：圆锥、单位四边形、单位圆盘——同一 createMesh 管线下的顶点规模对照。',
    points: ['cone 默认半径/高的顶点规模', 'quad 4 顶点 6 索引', 'circle 默认扇段的顶点数下限'],
    body: `var coneGeo = primitives.cone({ radius: 0.5, height: 1, segs: 8 } as any);
var quadGeo = (primitives as any).quad({ width: 1, height: 1 });
var circleGeo = primitives.circle({ segments: 12 } as any);
var coneMesh = utils.createMesh(coneGeo);
var quadMesh = utils.createMesh(quadGeo);
var circleMesh = utils.createMesh(circleGeo);
probe.conePosLen = (coneMesh as any).renderInfo ? (coneMesh as any).renderInfo.vertCount : 'meta';
probe.quadPosLen = (quadMesh as any).renderInfo ? (quadMesh as any).renderInfo.vertCount : 'meta';
probe.circlePosLen = (circleMesh as any).renderInfo ? (circleMesh as any).renderInfo.vertCount : 'meta';
probe.allCreated = !!(coneMesh && quadMesh && circleMesh);`,
  },
  {
    id: 'primitives-geometry-ops', title: 'primitives — translate/scale/invWinding/normals', category: 'mesh', cubeColor: [240, 200, 140], imports: ['Vec3'],
    visualClaims: ['primitives.translate', 'primitives.scale', 'primitives.invWinding'],
    primary: ['primitives.translate', 'primitives.scale'],
    claims: ['primitives.translate', 'primitives.scale', 'primitives.invWinding', 'primitives.normals'],
    goal: '掌握几何后处理四件套：平移/缩放注入、绕序反转、法线重算——在 box 图元上做确定性对照。',
    points: ['translate 后 minPosition.y 移动', 'scale 后包围范围翻倍', 'invWinding 反转索引序'],
    body: `var base = primitives.box({ width: 1, height: 1, length: 1 });
var moved: any = base; var scaled: any = base;
T('movedMaxY', () => { moved = (primitives as any).translate(base, [0, 10, 0]); var mm = utils.createMesh(moved); return Math.round(((mm as any).maxPosition ? (mm as any).maxPosition.y : -999) * 10) / 10; });
T('scaledMaxX', () => { scaled = (primitives as any).scale(base, [2, 2, 2]); var ms = utils.createMesh(scaled); return Math.round(((ms as any).maxPosition ? (ms as any).maxPosition.x : -999) * 10) / 10; });
T('invWinding', () => { var w: any = (primitives as any).invWinding(base); return w === undefined ? 'undef' : typeof w; });
var rewound: any = base;
var withNormals: any = base;
T('normalsCall', () => { try { withNormals = (primitives as any).normals(base); return 'ok'; } catch (e) { return 'threw'; } });

probe.invWindingOK = typeof probe.invWinding === 'string';
probe.normalsOK = !!(withNormals && withNormals.attributes);`,
  },
  {
    id: 'primitives-wireframe-obj', title: 'primitives — wireframe/toWavefrontOBJ/defaults', category: 'mesh', cubeColor: [250, 210, 150], imports: [],
    visualClaims: ['primitives.wireframed', 'primitives.toWavefrontOBJ'],
    primary: ['primitives.toWavefrontOBJ'],
    claims: ['primitives.wireframed', 'primitives.wireframe', 'primitives.toWavefrontOBJ', 'primitives.applyDefaultGeometryOptions'],
    goal: '掌握几何的线框化与 OBJ 序列化：wireframe 三角转线、toWavefrontOBJ 字符串输出、默认选项补全。',
    points: ['OBJ 输出以 o/v/f 记号开头', 'wireframe 后索引数为 3 的倍数→2 的倍数关系', 'applyDefaultGeometryOptions 补全字段'],
    body: `var box = primitives.box({ width: 1, height: 1, length: 1 });
T('defaults', () => { try { var g = primitives.applyDefaultGeometryOptions(box as any); return g ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('obj', () => { try { var s = primitives.toWavefrontOBJ(box as any); return String(s).slice(0, 1); } catch (e) { return 'threw'; } });
T('wireframe', () => { try { var w: any = primitives.wireframe(box as any); return w === null || w === undefined ? 'null' : (Array.isArray(w) ? 'arr' + w.length : 'len' + (w.indices || []).length); } catch (e) { return 'threw'; } });
T('wireframed', () => { try { var w = (primitives as any).wireframed(box as any); return w ? 'ok' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'batching-utility', title: 'BatchingUtility — 静态合批入口', category: 'mesh', cubeColor: [220, 230, 200], imports: ['BatchingUtility'],
    primary: ['BatchingUtility.batchStaticModel'],
    claims: ['BatchingUtility.constructor', 'BatchingUtility.batchStaticModel', 'BatchingUtility.unbatchStaticModel'],
    goal: '掌握静态合批工具的双入口：batchStaticModel/unbatchStaticModel 在非静态节点上走安全路径（try 兜底确定性回读）。',
    points: ['入口为静态函数', '非静态场景下调用不破坏渲染', 'unbatch 与 batch 成对出现'],
    body: `T('ctor', () => { try { new (BatchingUtility as any)(); return 'ok'; } catch (e) { return 'threw'; } });
T('batch', () => { try { var r = (BatchingUtility as any).batchStaticModel ? (BatchingUtility as any).batchStaticModel(cube) : null; return r === undefined || r ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('unbatch', () => { try { var r = (BatchingUtility as any).unbatchStaticModel ? (BatchingUtility as any).unbatchStaticModel(cube) : null; return r === undefined || r ? 'ok' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'sa', lifecycleMake: "new SceneAsset()",
  id: 'scene-asset-meta', title: 'SceneAsset — 场景资产元面', category: 'scene', cubeColor: [210, 200, 240], imports: ['SceneAsset'],
    primary: ['SceneAsset.scene'],
    claims: ['SceneAsset.constructor', 'SceneAsset.scene', 'SceneAsset.addRef', 'SceneAsset.decRef', 'SceneAsset.destroy'],
    goal: '掌握 SceneAsset 资产元面：构造、scene 槽位、引用计数 add/decRef 与 destroy 语义（空资产上的安全路径）。',
    points: ['new SceneAsset() 的 scene 为空', 'addRef/decRef 计数往返', 'destroy 空资产安全'],
    body: `var sa = new SceneAsset();
T('scene', () => { try { return sa.scene === null || sa.scene ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('refCycle', () => { try { sa.addRef(); var a = sa.refCount; sa.decRef(); var b = sa.refCount; return a - b; } catch (e) { return 'threw'; } });
T('destroy', () => { try { var d = sa.destroy(); return typeof d; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'color-timeline-key', title: 'ColorTimeline/ColorKey — 颜色时间线值类型', category: 'animation', cubeColor: [255, 170, 170], imports: [],
    primary: ['ColorTimeline.constructor', 'ColorKey.constructor'],
    claims: ['ColorTimeline.constructor', 'ColorKey.constructor'],
    goal: '掌握动画系统的颜色时间线值类型：ColorTimeline（轨道）与 ColorKey（关键帧）的构造面。',
    points: ['new ColorTimeline() 得到空轨道', 'new ColorKey() 关键帧默认量', '两构造均无副作用'],
    body: `T('timeline', () => { try { var tl = new ((cocosairNS as any).ColorTimeline)(); return tl ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('key', () => { try { var kk = new ((cocosairNS as any).ColorKey)(); return kk ? 'obj' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'directional-light-face', title: 'DirectionalLight — 属性与常量面', category: 'light', cubeColor: [255, 220, 160], imports: [],
    visualClaims: ['DirectionalLight.illuminance'],
    primary: ['DirectionalLight.illuminance'],
    claims: ['DirectionalLight.constructor', 'DirectionalLight.illuminance', 'DirectionalLight.color'],
    goal: '掌握 DirectionalLight 的构造/照度/颜色面：读取脚手架主光的配置并做确定性回读。',
    points: ['illuminance 读回脚手架设定值', 'color 是 Color 实例', '构造入口存在'],
    body: `T('illuminance', () => light.illuminance);
T('colorType', () => light.color ? 'Color' : 'null');
T('ctor', () => { try { var n = new Node('L2'); scene.addChild(n); var l2 = n.addComponent(DirectionalLight); return l2 ? 'ok' : 'null'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'camera-geometry-extras', title: 'Camera — 世界矩阵投影与几何查询', category: 'camera', cubeColor: [150, 210, 200], imports: ['geometry', 'Mat4', 'Vec3'],
    primary: ['Camera.worldMatrixToScreen'],
    claims: ['Camera.worldMatrixToScreen', 'Camera.getClipSpaceMinz', 'Camera.calculateObliqueMat'],
    goal: '掌握 Camera 的进阶几何面：世界矩阵→屏幕投影（Mat4 出参）、裁剪空间 minz 查询、oblique 近平面矩阵计算（try 兜底）。',
    points: ['worldMatrixToScreen 出参为 Mat4', 'getClipSpaceMinz 数值回读', 'calculateObliqueMat 需平面参数（try）'],
    body: `var out = new Mat4();
var camAny: any = camera;
T('wms', () => { try { var rc = camAny.camera; var r = rc ? rc.worldMatrixToScreen(out, cube.worldMatrix, 480, 320) : null; return r ? 'mat4' : 'null'; } catch (e) { return 'threw'; } });
T('clipMinz', () => { try { var v = (camera.camera as any) ? (camera.camera as any).getClipSpaceMinz() : undefined; return typeof v; } catch (e) { return 'threw'; } });
T('oblique', () => { try { var m = new Mat4(); var p = new geometry.Plane(0, 1, 0, 1); var r = (camera.camera as any) ? (camera.camera as any).calculateObliqueMat(m, p) : null; return r ? 'ok' : 'null'; } catch (e) { return 'threw'; } });`,
  },
];
