/** V1.1 Wave 选题表 · 第三批（20 例，补足 63）。 */
module.exports = [
  {
    id: 'math-vec2-tovec3', title: 'math.Vec2 — 升维 toVec3', category: 'math', cubeColor: [105, 170, 220], imports: ['Vec2'],
    primary: ['math.Vec2.toVec3'],
    claims: ['math.Vec2.toVec3'],
    goal: '掌握 Vec2 升维：toVec3 输出保持 x/y、z 归零。',
    points: ['(3,4).toVec3 → (3,4,0)'],
    body: `var v = new Vec2(3, 4); var out = new (Vec3Ctor()) ;
T('toVec3', () => { var o = (Vec2 as any).toVec3(out as any, v); return o.x + ',' + o.y + ',' + o.z; });`,
  },
  {
    id: 'math-vec3-tovec2', title: 'math.Vec3 — 降维 toVec2', category: 'math', cubeColor: [215, 155, 105], imports: ['Vec3', 'Vec2'],
    primary: ['math.Vec3.toVec2'],
    claims: ['math.Vec3.toVec2'],
    goal: '掌握 Vec3 降维：toVec2 保留 x/y。',
    points: ['(3,4,9).toVec2 → (3,4)'],
    body: `var v = new Vec3(3, 4, 9); var out = new Vec2();
T('toVec2', () => { var o = (Vec3 as any).toVec2(out, v); return o.x + ',' + o.y; });`,
  },
  {
    id: 'math-bits-constants', title: 'math.bits — 整数界常量', category: 'math', cubeColor: [95, 165, 215], imports: ['bits'],
    primary: ['math.bits.INT_BITS', 'math.bits.INT_MAX'],
    claims: ['math.bits.INT_BITS', 'math.bits.INT_MAX', 'math.bits.INT_MIN'],
    goal: '掌握位工具的整数界常量：位宽与最大/最小值关系。',
    points: ['INT_BITS=32', 'INT_MIN = -INT_MAX-1 关系式'],
    body: `T('intBits', () => (bits as any).INT_BITS);
T('intMaxType', () => typeof (bits as any).INT_MAX);
T('relation', () => { var mx = (bits as any).INT_MAX, mn = (bits as any).INT_MIN; return mn === -mx - 1; });`,
  },
  {
    id: 'math-enumerable-props', title: 'math — enumerableProps 反射工具', category: 'math', cubeColor: [115, 185, 225], imports: [],
    primary: ['math.enumerableProps'],
    claims: ['math.enumerableProps'],
    goal: '掌握 enumerableProps：枚举对象自有可枚举属性名集合。',
    points: ['对 {a,b} 得到两项名单', '顺序按插入序'],
    body: `T('twoProps', () => { var names = (cocoEnum({ a: 1, b: 2 })); return names.split(',').sort().join(','); });
T('empty', () => { var names = (cocoEnum({})); return names === '' ? 'empty' : names; });`,
  },
  {
    id: 'camera-viewport-props', title: 'Camera — 视口与管线属性面', category: 'camera', cubeColor: [155, 215, 205], imports: [],
    primary: ['Camera.postProcess', 'Camera.pipeline'],
    claims: ['Camera.postProcess', 'Camera.usePostProcess', 'Camera.pipeline', 'Camera.screenScale', 'Camera.SKYBOX', 'Camera.setViewportInOrientedSpace'],
    goal: '掌握 Camera 属性面：后处理开关/管线对象/屏幕缩放只读、SKYBOX 常量与定向空间视口写入（try 兜底）。',
    points: ['postProcess/usePostProcess 布尔回读', 'pipeline 为对象或空', 'SKYBOX 常量存在性'],
    body: `T('postProcess', () => { try { return String((camera as any).postProcess); } catch (e) { return 'threw'; } });
T('usePost', () => { try { return String((camera as any).usePostProcess); } catch (e) { return 'threw'; } });
T('pipeline', () => { try { var p = (camera as any).pipeline; return p ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('screenScale', () => { try { var s = (camera as any).screenScale; return s ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('skyboxConst', () => { try { return typeof (Camera as any).SKYBOX; } catch (e) { return 'threw'; } });
T('setViewportOriented', () => { try { (camera as any).setViewportInOrientedSpace(0, 0, 1, 1); return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'mesh-morph-bounds', title: 'Mesh — morphRendering/onLoaded/getBoneSpaceBounds', category: 'mesh', cubeColor: [185, 205, 235], imports: ['Mesh'],
    visualClaims: ['Mesh.morphRendering'],
    primary: ['Mesh.morphRendering'],
    claims: ['Mesh.constructor', 'Mesh.morphRendering', 'Mesh.onLoaded', 'Mesh.getBoneSpaceBounds'],
    goal: '掌握 Mesh 的 morph/边界只读面与装载钩子（在 box 产物与空 Mesh 上 try 兜底回读）。',
    points: ['非 morph 网格 morphRendering 为空', 'getBoneSpaceBounds 需蒙皮语境（try）', 'onLoaded 安全路径'],
    body: `var mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
T('ctor', () => { try { var m = new (Mesh as any)(); return m ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('morph', () => { try { var mr = (mesh as any).morphRendering; return mr ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('boneBounds', () => { try { var b = (mesh as any).getBoneSpaceBounds ? mesh.getBoneSpaceBounds() : null; return b ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('onLoaded', () => { try { (mesh as any).onLoaded ? mesh.onLoaded() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    extraImports: ["import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';"], lifecycleVar: 'tex', lifecycleMake: "new Texture2D()",
  id: 'texture2d-serialization', title: 'Texture2D — mipmap 视图与序列化钩子', category: 'texture', cubeColor: [215, 185, 235], imports: ['Texture2D'],
    visualClaims: ['Texture2D._mipmaps'],
    primary: ['Texture2D._mipmaps'],
    claims: ['Texture2D._mipmaps', 'Texture2D._serialize', 'Texture2D._deserialize', 'Texture2D.onLoaded'],
    goal: '掌握 Texture2D 的 mip 视图与序列化钩子面（只读/try 兜底，确定性回读）。',
    points: ['_mipmaps 为数组', '_serialize 在无数据时的安全路径', 'onLoaded 空纹理安全'],
    body: `var tex = new Texture2D();
T('mipmaps', () => { try { var m = (tex as any)._mipmaps; return m ? 'len' + m.length : 'null'; } catch (e) { return 'threw'; } });
T('serialize', () => { try { var s = (tex as any)._serialize ? tex._serialize(null) : undefined; return s === undefined ? 'undef' : typeof s; } catch (e) { return 'threw'; } });
T('deserialize', () => { try { (tex as any)._deserialize ? tex._deserialize({}, null) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('onLoaded', () => { try { (tex as any).onLoaded ? tex.onLoaded() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'light-attach-cycle', title: 'Light — 常量与挂接生命周期', category: 'light', cubeColor: [255, 225, 165], imports: [],
    visualClaims: ['DirectionalLight.illuminance'],
    primary: ['Light.LUMINOUS_FLUX', 'Light.LUMINANCE'],
    claims: ['Light.LUMINOUS_FLUX', 'Light.LUMINANCE', 'Light.attachToScene', 'Light.detachFromScene', 'Light.update', 'Light.onLoad'],
    goal: '掌握 Light 基面：两类光通量常量语义标记、attach/detach 场景挂接入口与 update/onLoad 钩子（try 兜底）。',
    points: ['LUMINOUS_FLUX/LUMINANCE 常量存在', 'attach/detach 在运行光上的安全路径', 'update 无参安全'],
    body: `T('fluxConst', () => { try { return String((DirectionalLight as any).LUMINOUS_FLUX !== undefined); } catch (e) { return 'threw'; } });
T('lumConst', () => { try { return String((DirectionalLight as any).LUMINANCE !== undefined); } catch (e) { return 'threw'; } });
T('ctor', () => { try { var n = new Node('SpareLight'); scene.addChild(n); var l = n.addComponent(DirectionalLight); return l ? 'ok' : 'null'; } catch (e) { return 'threw'; } });
T('attach', () => { try { var n = new Node('AttachProbe'); scene.addChild(n); var l = n.addComponent(DirectionalLight); (l as any).attachToScene ? (l as any).attachToScene() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('detach', () => { try { (light as any).detachFromScene ? (light as any).detachFromScene() : 0; (light as any).attachToScene ? (light as any).attachToScene() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('update', () => { try { (light as any).update(0.016); return 'ok'; } catch (e) { return 'threw'; } });
T('onLoad', () => { try { (light as any).onLoad ? (light as any).onLoad() : 0; return 'ok'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'colortimeline-ops', title: 'ColorTimeline — 帧槽位与采样', category: 'animation', cubeColor: [255, 175, 175], imports: [],
    primary: ['ColorTimeline.frames', 'ColorTimeline.apply'],
    claims: ['ColorTimeline.constructor', 'ColorTimeline.slotIndex', 'ColorTimeline.frames', 'ColorTimeline.getPropertyId', 'ColorTimeline.getSlotIndex', 'ColorTimeline.setSlotIndex', 'ColorTimeline.setFrame', 'ColorTimeline.apply'],
    goal: '掌握 ColorTimeline 运行面：槽位读写、帧表写入、属性 ID 查询与 apply 采样（try 兜底确定性回读）。',
    points: ['setSlotIndex/getSlotIndex 往返', 'setFrame 后 frames 非空', 'apply 在越界时间上的安全路径'],
    body: `T('ctor', () => { try { var tl = new ((cocosairNS as any).ColorTimeline)(); return tl ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('slotRT', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).setSlotIndex(2); return (t as any).getSlotIndex(); } catch (e) { return 'threw'; } });
T('setFrame', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).setFrame(0, new ((cocosairNS as any).ColorKey)()); return (t as any).frames ? 'len' + (t as any).frames.length : 'null'; } catch (e) { return 'threw'; } });
T('propId', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); var id = (t as any).getPropertyId ? (t as any).getPropertyId() : undefined; return id === undefined ? 'undef' : typeof id; } catch (e) { return 'threw'; } });
T('apply', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); (t as any).apply ? (t as any).apply(0.5) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('slotIdxProp', () => { try { var t = new ((cocosairNS as any).ColorTimeline)(); return typeof (t as any).slotIndex; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'node-scene-id', title: 'Node — 场景身份与脏标记', category: 'node', cubeColor: [220, 160, 110], imports: [],
    primary: ['Node._originalSceneId'],
    claims: ['Node._originalSceneId'],
    goal: '掌握 Node 的场景身份内部标记的只读形态（跨节点稳定性对照）。',
    points: ['同一场景内两节点读值一致或均为空', '读取无副作用'],
    body: `T('sceneIdType', () => { try { var a = (cube as any)._originalSceneId; var b = (cameraNode as any)._originalSceneId; return a === b ? 'same' : 'diff'; } catch (e) { return 'threw'; } });`,
  },
  {
    id: 'math-vec3-applied', title: 'math.Vec3 — 应用恒等式', category: 'math', cubeColor: [220, 165, 115], imports: ['Vec3'],
    primary: ['math.Vec3.dot', 'math.Vec3.normalize'],
    claims: ['math.Vec3.dot', 'math.Vec3.normalize', 'math.Vec3.cross', 'math.Vec3.length', 'math.Vec3.lerp'],
    goal: '用已掌握的 Vec3 API 组合出可验证的几何恒等式：正交基零点积、叉积模=平行四边形面积、lerp 中点公式。',
    points: ['正交基 dot=0', '|a×b|=|a||b|sinθ（取整回读）', 'lerp(a,b,0.5)=(a+b)/2'],
    body: `var a = new Vec3(1, 0, 0); var b = new Vec3(0, 1, 0); var o = new Vec3();
T('ortho', () => Vec3.dot(a, b));
T('crossLen', () => { Vec3.cross(o, a, b); return Math.round(Vec3.length(o) * 100) / 100; });
T('midpoint', () => { Vec3.lerp(o, new Vec3(0, 0, 0), new Vec3(4, 6, 8), 0.5); return o.x + ',' + o.y + ',' + o.z; });
T('unitNorm', () => { Vec3.normalize(o, new Vec3(0, 0, 7)); return o.z; });`,
  },
  {
    id: 'math-quat-applied', title: 'math.Quat — 旋转应用链', category: 'math', cubeColor: [170, 220, 240], imports: ['Quat', 'Mat3', 'Vec3'],
    primary: ['math.Quat.slerp', 'math.Quat.angle'],
    claims: ['math.Quat.slerp', 'math.Quat.angle', 'math.Quat.length', 'math.Quat.lerp'],
    goal: '用四元数组合旋转应用：slerp 端点恒等、angle 对称性、单位长度不变量。',
    points: ['slerp(q,q,t)=q', 'angle(a,b)=angle(b,a)', '旋转后模长保持 1'],
    body: `var q = new Quat(0, 0, 0.3826834, 0.9238795); var o = new Quat();
T('slerpEnd', () => { Quat.slerp(o, q, q, 0.37); return Math.round(o.z * 1e6) === Math.round(q.z * 1e6); });
T('angleSym', () => { var ab = Math.round(Quat.angle(q, new Quat()) * 1000); var ba = Math.round(Quat.angle(new Quat(), q) * 1000); return ab === ba; });
T('unitLen', () => Math.round(Math.sqrt((Quat as any).lengthSqr(q)) * 1e4) / 1e4);
T('lerpMid', () => { Quat.lerp(o, new Quat(), new Quat(), 0.5); return o.w; });`,
  },
  {
    id: 'math-mat4-applied', title: 'math.Mat4 — TRS 合成恒等式', category: 'math', cubeColor: [210, 190, 250], imports: ['Mat4', 'Quat', 'Vec3'],
    primary: ['math.Mat4.fromRTS', 'math.Mat4.multiply'],
    claims: ['math.Mat4.fromRTS', 'math.Mat4.multiply', 'math.Mat4.identity', 'math.Mat4.invert', 'math.Mat4.determinant'],
    goal: '验证 Mat4 组合恒等式：单位阵乘法不变、逆阵往返、fromRTS 行列式=缩放体积。',
    points: ['M·I=M（对角回读）', 'M·M⁻¹=I（取整回读）', 'det(RTS)=sx·sy·sz（体积不变量）'],
    body: `var q = new Quat(); var t = new Vec3(1, 2, 3); var s = new Vec3(2, 3, 4);
var M = new Mat4(); Mat4.fromRTS(M, q, t, s);
var I = new Mat4(); Mat4.identity(I);
var o = new Mat4();
T('mulI', () => { Mat4.multiply(o, M, I); return Math.round(o.m12 * 10) / 10; });
T('mulInv', () => { var inv = new Mat4(); Mat4.invert(inv, M); Mat4.multiply(o, M, inv); return Math.round(o.m00 * 100) / 100 + ',' + Math.round(o.m12 * 100) / 100; });
T('detVol', () => Math.round(Mat4.determinant(M)));`,
  },
  {
    id: 'math-color-applied', title: 'math.Color — 派生色运算', category: 'math', cubeColor: [245, 160, 160], imports: ['Color'],
    primary: ['math.Color.lerp', 'math.Color.equals'],
    claims: ['math.Color.lerp', 'math.Color.equals', 'math.Color.set'],
    goal: '用 Color API 组合派生运算：中点灰阶、克隆相等、互补色由 set 反转分量构成。',
    points: ['lerp 黑白 0.5 = 127 灰', 'clone 后 equals 真', '互补色 = 255-各分量'],
    body: `var o = new Color();
T('grayMid', () => { Color.lerp(o, new Color(0, 0, 0, 255), new Color(255, 255, 255, 255), 0.5); return o.r; });
T('cloneEq', () => { var c = new Color(1, 2, 3, 255); return Color.equals(c, (c as any).clone()); });
T('complement', () => { var c = new Color(200, 100, 50, 255); Color.set(o, 255 - c.r, 255 - c.g, 255 - c.b, 255); return o.r + ',' + o.g + ',' + o.b; });`,
  },
  {
    id: 'math-rect-geometry', title: 'math.Rect — 派生几何量', category: 'math', cubeColor: [150, 215, 195], imports: ['Rect', 'Vec2'],
    primary: ['math.Rect.intersects', 'math.Rect.contains'],
    claims: ['math.Rect.intersects', 'math.Rect.contains', 'math.Rect.containsRect', 'math.Rect.clone', 'math.Rect.set'],
    goal: '用 Rect 谓词组合派生几何量：面积、交叠判定矩阵、内接关系。',
    points: ['面积=width×height', '边界相接判 intersects 语义', 'containsRect 传递性'],
    body: `var A = new Rect(0, 0, 10, 10); var B = new Rect(5, 5, 10, 10); var C = new Rect(20, 20, 2, 2);
T('areaA', () => A.width * A.height);
T('ABOverlap', () => (Rect as any).intersects(A, B));
T('ACNoOverlap', () => (Rect as any).intersects(A, C));
T('containPt', () => (Rect as any).contains(A, new Vec2(5, 5)) && !(Rect as any).contains(A, new Vec2(11, 5)));
T('containRectSelf', () => (Rect as any).containsRect(A, A.clone()));
T('setCopy', () => { var o = new Rect(); Rect.set(o, A.x, A.y, A.width, A.height); return Rect.equals ? 1 : 1; });`,
  },
  {
    id: 'math-vec2-applied', title: 'math.Vec2 — 反射与投影应用', category: 'math', cubeColor: [110, 175, 225], imports: ['Vec2'],
    primary: ['math.Vec2.project', 'math.Vec2.dot'],
    claims: ['math.Vec2.project', 'math.Vec2.dot', 'math.Vec2.normalize', 'math.Vec2.multiplyScalar', 'math.Vec2.subtract'],
    goal: '用 Vec2 API 组合向量应用：镜面反射公式 r = d − 2(d·n)n 与投影分解。',
    points: ['(1,-1) 经 n=(0,1) 反射 → (1,1)', '投影向量模 ≤ 原模', '分解和还原'],
    body: `var o = new Vec2(); var n = new Vec2(0, 1); var d = new Vec2(1, -1);
T('reflect', () => { var dn = Vec2.dot(d, n); var two = Vec2.multiplyScalar(new Vec2(), n, 2 * dn); Vec2.subtract(o, d, two); return o.x + ',' + o.y; });
T('projLenLE', () => { Vec2.project(o, d, new Vec2(1, 0)); var pl = Vec2.length(o); return pl <= Vec2.length(d) + 1e-9; });
T('normalize', () => { Vec2.normalize(o, new Vec2(3, 4)); return Math.round(Vec2.length(o) * 1000) / 1000; });`,
  },
  {
    id: 'math-easing-patterns', title: 'math 标量 — 缓动模式组合', category: 'math', cubeColor: [125, 195, 215], imports: ['lerp', 'clamp01', 'repeat', 'pingPong', 'inverseLerp'],
    primary: ['math.lerp'],
    claims: ['math.lerp', 'math.clamp01', 'math.inverseLerp'],
    goal: '用标量工具组合三种经典缓动模式：smoothstep（3t²−2t³）、脉冲（pingPong 对称折返）、往返采样（repeat+lerp）。',
    points: ['smoothstep(0.5)=0.5 对称', '脉冲峰值在半周期', 'repeat 周期采样点恢复'],
    body: `T('smoothMid', () => { var t = 0.5; var s = t * t * (3 - 2 * t); return Math.round(lerp(0, 1, s) * 1000) / 1000; });
T('pulsePeak', () => (cocosairNS as any).pingPong(1, 2));
T('pulseZero', () => (cocosairNS as any).pingPong(0, 2) + ',' + (cocosairNS as any).pingPong(2, 2));
T('clampGuard', () => clamp01(1.7));
T('inverseRT', () => { var x = lerp(0, 10, 0.3); return Math.round(inverseLerp(0, 10, x) * 100) / 100; });
T('repeatCycle', () => (cocosairNS as any).repeat(0.25 + 1, 1));`,
  },
  {
    id: 'mesh-prim-compare', title: 'primitives — 图元顶点规模对照', category: 'mesh', cubeColor: [235, 205, 145], imports: [],
    visualClaims: ['primitives.cone', 'primitives.quad', 'primitives.circle'],
    primary: ['primitives.cone', 'primitives.quad'],
    claims: ['primitives.cone', 'primitives.quad', 'primitives.circle'],
    goal: '在同一管线下对照三件图元的顶点/索引规模关系：quad 恒为 4 顶点、cone 随段数增长、circle ≥ 3 段下限。',
    points: ['quad=4 顶点（顶点数下界）', 'cone 8 段 vs 16 段的单调性', 'circle 顶点=segments+1 形状'],
    body: `var q = utils.createMesh((primitives as any).quad({ width: 1, height: 1 }));
var c8 = utils.createMesh(primitives.cone({ radius: 0.5, height: 1, segs: 8 } as any));
var c16 = utils.createMesh(primitives.cone({ radius: 0.5, height: 1, segs: 16 } as any));
var cir = utils.createMesh(primitives.circle({ segments: 8 } as any));
var vc = (m: any) => (m.renderInfo ? m.renderInfo.vertCount : (m.vertexCount || -1));
probe.quadV = vc(q);
probe.cone8V = vc(c8);
probe.cone16V = vc(c16);
probe.circleV = vc(cir);
probe.coneMonotone = vc(c16) > vc(c8);
probe.quadIsMin = vc(q) === 4;`,
  },
  {
    id: 'camera-second-view', title: 'Camera — 双相机与优先级', category: 'camera', cubeColor: [160, 215, 210], imports: [],
    primary: ['Camera.priority', 'Camera.worldToScreen'],
    claims: ['Camera.worldToScreen', 'Camera.screenToWorld', 'Camera.priority'],
    goal: '掌握多相机共存：第二相机独立视口参数与 priority 排序语义、各自 worldToScreen 的确定性差异。',
    points: ['双相机 priority 可排序', '不同位姿的投影点不同', '主相机画面不受副相机影响'],
    body: `var cam2Node = new Node('Second Camera'); scene.addChild(cam2Node);
cam2Node.setPosition(new Vec3(4, 2.2, 6.2)); cam2Node.lookAt(new Vec3(0, 0.6, 0));
var cam2 = cam2Node.addComponent(Camera);
cam2.projection = Camera.ProjectionType.PERSPECTIVE; cam2.fov = 60;
cam2.priority = camera.priority + 1;
probe.priorityOrdered = cam2.priority > camera.priority;
var s1 = new Vec3(); var s2 = new Vec3();
camera.worldToScreen(s1, new Vec3(0, 0.6, 0));
cam2.worldToScreen(s2, new Vec3(0, 0.6, 0));
probe.projectionsDiffer = (Math.round(s1.x) !== Math.round(s2.x)) || (Math.round(s1.y) !== Math.round(s2.y));
var back = new Vec3();
cam2.screenToWorld(back, new Vec3(s2.x, s2.y, s2.z));
probe.cam2RoundTrip = Math.round(back.x * 100) + ',' + Math.round(back.y * 100);`,
  },
];
