/** V1.1 Wave 选题表（r50）。试点 3 例先行；批量阶段在本文件继续追加。 */
module.exports = [
  {
    id: 'math-bits',
    title: 'math.bits — 位运算工具集',
    category: 'math',
    cubeColor: [96, 170, 220],
    imports: ['bits'],
    primary: ['math.bits.sign', 'math.bits.nextPow2', 'math.bits.popCount'],
    claims: ['math.bits.sign', 'math.bits.abs', 'math.bits.min', 'math.bits.max', 'math.bits.isPow2', 'math.bits.log2', 'math.bits.log10', 'math.bits.popCount', 'math.bits.countTrailingZeros', 'math.bits.nextPow2', 'math.bits.prevPow2', 'math.bits.parity', 'math.bits.reverse', 'math.bits.interleave2', 'math.bits.deinterleave2', 'math.bits.interleave3', 'math.bits.deinterleave3', 'math.bits.nextCombination'],
    goal: '掌握 core 数学位工具 math.bits 的全部纯函数：符号/绝对值/极值、2 的幂判定与取整、位计数与翻转、2/3 路 interleave 与 Morton 解交织，全部以确定性整数回读。',
    points: [
      'isPow2/nextPow2/prevPow2 构成 2 的幂三件套：65 → 非 2 幂，nextPow2(65)=128，prevPow2(65)=64',
      'interleave2/deinterleave2 是 Morton 编码往返：x=5,y=9 编码后解回 (5,9)',
      'popCount/parity/reverse 的结果都可手算核对（输入取 ≤16 位避免符号位干扰）',
    ],
    body: `probe.signNeg = bits.sign(-7);
probe.signPos = bits.sign(12);
probe.absNeg = bits.abs(-9);
probe.minPair = bits.min(3, 11);
probe.maxPair = bits.max(3, 11);
probe.isPow2_64 = bits.isPow2(64);
probe.isPow2_65 = bits.isPow2(65);
probe.nextPow2_65 = bits.nextPow2(65);
probe.prevPow2_65 = bits.prevPow2(65);
probe.log2_64 = bits.log2(64);
probe.log10_1000 = bits.log10(1000);
probe.popCount_255 = bits.popCount(255);
probe.trailingZ_96 = bits.countTrailingZeros(96);
probe.parity_7 = bits.parity(7);
probe.reverse_b101 = bits.reverse(0b101);
probe.morton2 = bits.interleave2(5, 9);
probe.unmortonX = bits.deinterleave2(bits.interleave2(5, 9) , 0);
probe.unmortonY = bits.deinterleave2(bits.interleave2(5, 9) , 1);
probe.morton3 = bits.interleave3(1, 2, 3);
probe.unmorton3_1 = bits.deinterleave3(bits.interleave3(1, 2, 3) , 1);
probe.combo5 = bits.nextCombination(5);
`,
  },
  {
    id: 'node-events',
    title: 'Node 事件 — on/once/emit/hasEventListener/off/targetOff',
    category: 'node',
    cubeColor: [214, 148, 96],
    imports: ['Event'],
    primary: ['Node.emit', 'Node.on', 'Node.hasEventListener'],
    claims: ['Node.on', 'Node.once', 'Node.emit', 'Node.off', 'Node.hasEventListener', 'Node.targetOff', 'Node.dispatchEvent', 'Node.walk', 'Node.getComponents', 'Node.getChildByPath', 'Node.setParent', 'Node.getParent', 'Node.isChildOf', 'Node.getSiblingIndex', 'Node.setSiblingIndex'],
    goal: '掌握 Node 自定义事件生命周期的全链：注册/单次/派发/查询/精确移除/按目标清空，以及 dispatchEvent 走事件对象路径；附带层级查询与兄弟序 API 的确定性回读。',
    points: [
      'on+emit：计数器精确累加；once 只响一次；off 后计数冻结',
      'hasEventListener 在 off 前后翻转；targetOff 一次清空该目标全部监听',
      'getChildByPath/isChildOf/getSiblingIndex 提供层级事实，全部可静态核对',
    ],
    body: `var host = new Node('EventHost'); scene.addChild(host);
var n = { on: 0, once: 0 };
var onCb = () => { n.on++; };
host.on('ping', onCb);
host.once('ping-once', () => { n.once++; });
host.emit('ping'); host.emit('ping'); host.emit('ping-once'); host.emit('ping-once');
probe.onCount = n.on;
probe.onceCount = n.once;
probe.hasPing = host.hasEventListener('ping');
host.off('ping', onCb);
probe.hasPingAfterOff = host.hasEventListener('ping');
host.on('gone-a', () => { n.on++; });
host.on('gone-b', () => { n.on++; });
host.targetOff(host);
probe.hasGoneAAfterTargetOff = host.hasEventListener('gone-a');
probe.hasGoneBAfterTargetOff = host.hasEventListener('gone-b');
var dispCount = 0; host.on('disp', () => { dispCount++; });
host.dispatchEvent(new (Event as any)('disp'));
probe.dispatchCount = dispCount;
var child = new Node('ChildA'); host.addChild(child);
var child2 = new Node('ChildB'); host.addChild(child2);
probe.childByPath = (host.getChildByPath('ChildA') as any).name;
probe.isChild = host.isChildOf(scene) && child.isChildOf(host);
probe.siblingOfB = child2.getSiblingIndex();
child2.setSiblingIndex(0);
probe.siblingOfBAfter = child2.getSiblingIndex();
probe.parentName = (child.getParent() as any).name;
var detached = new Node('Detached'); child.setParent(detached);
probe.reparented = detached.children.length === 1 && child.getParent() === detached;
var comps = cube.getComponents(MeshRenderer as any);
probe.cubeRendererCount = comps.length;
var names: string[] = [];
scene.walk((nd: any) => { names.push(nd.name); });
probe.walkFoundCube = names.indexOf('Cube') >= 0;
`,
  },
  {
    id: 'camera-screen-world',
    title: 'Camera — worldToScreen / screenToWorld / screenPointToRay',
    category: 'camera',
    cubeColor: [130, 200, 140],
    imports: ['geometry'],
    primary: ['Camera.worldToScreen', 'Camera.screenToWorld', 'Camera.screenPointToRay'],
    claims: ['Camera.worldToScreen', 'Camera.screenToWorld', 'Camera.screenPointToRay'],
    goal: '掌握 Camera 的屏幕↔世界换算族：立方体中心的 worldToScreen 投影、同一点的 screenToWorld 往返一致性、screenPointToRay 的方向语义，以及 resize/setFixedSize 的视口行为。',
    points: [
      'worldToScreen(cube 中心) 与 screenToWorld 往返：反投影点的 x/y 分量回到同一屏幕坐标（z 轴按深度另计）',
      'screenPointToRay：屏幕中心射线方向与相机前向一致（朝向 -Z 族符号核对）',
      'resize 后相机仍可出图（视口适配内部处理），probe 以 cameraUp 哨兵确认执行路径无异常',
    ],
    body: `var world = new Vec3(0, 0.6, 0);
var screen = new Vec3();
camera.worldToScreen(screen, world);
probe.screenX = Math.round(screen.x); probe.screenY = Math.round(screen.y);
var back = new Vec3();
camera.screenToWorld(back, new Vec3(screen.x, screen.y, screen.z));
probe.roundTripXY = Math.round(back.x * 100) + ',' + Math.round(back.y * 100);
var ray = new geometry.Ray(0, 0, 0, 0, 0, 0);
camera.screenPointToRay(screen.x, screen.y, ray);
probe.rayDx = Math.round(ray.d.x * 100) / 100;
probe.rayDy = Math.round(ray.d.y * 100) / 100;
probe.rayDz = Math.round(ray.d.z * 100) / 100;
`,
  },
];
