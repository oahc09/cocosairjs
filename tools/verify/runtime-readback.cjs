/* 运行期读回（readback）：从页面把场景图的真实数值取出来给门禁比对。
 *
 * 为什么单独成模块：Example Spec 的 transform-equals / material-property 必须与**声明的期望值**
 * 比较（总审查 item 2），而 agent-session 的 inspectNode 只给变换、inspectAsset 只给资源清单
 * （`{id,kind,name,valid}`，没有属性值）。材质属性值只能经公开的 `Material.getProperty()` 读，
 * 所以这里做一次页面内遍历，返回每个节点的名字、局部变换、渲染组件与材质属性。
 *
 * 只读引擎公开面：不 import 引擎内部符号，不改场景。插桩版（api-trace）与真实 bundle 是同一个
 * 模块实例，因此这里读到的对象与示例创建的完全一致。
 */
const TOLERANCE = 1e-3;

/** 数值向量比较：a 至少覆盖 b 的分量，逐量在容差内相等。 */
function nearly (a, b, tol) {
  return Array.isArray(a) && Array.isArray(b) && a.length >= b.length && b.every((v, i) => Math.abs(a[i] - v) <= (tol === undefined ? TOLERANCE : tol));
}

/** 在页面里遍历场景，返回 { nodes: [{name, path, position, rotationEuler, scale, active, renderers}], error }。
 *  propertyNames：需要读值的材质属性（由期望值决定，避免无意义的全属性扫描）。 */
async function readScene (page, propertyNames, realUrl) {
  return page.evaluate(async (props) => {
    const cc = await import('/build/cocosair.module.js');
    // 窗口只包同步遍历：await 期间让出的帧循环（示例动画、引擎渲染）不能被算成门禁调用。
    const trace = window.__apiTrace;
    if (trace) { trace.observing = (trace.observing || 0) + 1; }
    try {
    const app = window.__airApp;
    const scene = app && (app.getScene ? app.getScene() : app.scene);
    if (!scene) { return { nodes: [], error: 'no running scene' }; }
    const flat = (v) => {
      if (v === null || v === undefined) { return null; }
      if (typeof v === 'number') { return [v]; }
      if (Array.isArray(v)) { return v.reduce((acc, x) => acc.concat(flat(x)), []); }
      if (typeof v === 'object' && v.x !== undefined) { return [v.x, v.y, v.z, v.w].filter((n) => typeof n === 'number'); }
      try { if (ArrayBuffer.isView(v)) { return Array.from(v); } } catch (e) { /* ignore */ }
      return null;
    };
    const out = [];
    const walk = (node, parentPath) => {
      const path = parentPath ? parentPath + '/' + (node.name || '?') : String(node.name || '?');
      const e = node.eulerAngles || { x: 0, y: 0, z: 0 };
      const p = node.position || { x: 0, y: 0, z: 0 };
      const s = node.scale || { x: 1, y: 1, z: 1 };
      const entry = {
        name: node.name, path,
        position: [p.x, p.y, p.z],
        rotationEuler: [e.x, e.y, e.z],
        scale: [s.x, s.y, s.z],
        active: !!node.active,
        renderers: [],
      };
      for (const type of [cc.MeshRenderer, cc.SkinnedMeshRenderer]) {
        if (!type) { continue; }
        const comp = node.getComponent(type);
        if (!comp) { continue; }
        const mat = comp.material;
        const r = { type: type === cc.SkinnedMeshRenderer ? 'SkinnedMeshRenderer' : 'MeshRenderer', mesh: comp.mesh && comp.mesh.name || null, material: null };
        const summarize = (m) => {
          const propsOut = {};
          const kindsOut = {};
          for (const name of props) {
            try {
              const raw = m.getProperty(name);
              propsOut[name] = flat(raw);
              // 非数值属性（贴图/缓冲）无法靠数组比较证明，但"绑定了什么对象"是可判定的
              kindsOut[name] = raw === null || raw === undefined ? 'null'
                : (Array.isArray(raw) || typeof raw === 'number' || (typeof raw === 'object' && raw.x !== undefined)
                  || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(raw)) ? 'value' : 'object');
            } catch (err) { propsOut[name] = null; kindsOut[name] = 'error'; }
          }
          return { name: m.name || null, effect: m.effectAsset && m.effectAsset.name || null, props: propsOut, propKinds: kindsOut,
            textureNames: (() => {
              const t = {};
              for (const name of props) { try { const raw = m.getProperty(name); const tex = raw && (raw.texture || raw); t[name] = tex && tex.name ? String(tex.name) : null; } catch (err) { t[name] = null; } }
              return t;
            })() };
        };
        // 多材质网格：一个 MeshRenderer 可以按图元绑多个材质，只读 slot 0 会把
        // "两个材质槽各自生效"降级成"至少有一个材质"。逐槽读回，material-property 才能按 slot 断言。
        // 值取自实例（若存在）——示例可只对 comp.material 赋值，共享材质上看不到；
        // 名字取自共享材质——MaterialInstance.name 是空串且无 root 访问器（审计 F-69），
        // 但 getMaterial(i) 的 Material.name 保住了导入器赋的名字，故材质名仍可判定。
        const slots = [];
        for (let i = 0; i < 8; i++) {
          let shared = null;
          try { shared = typeof comp.getMaterial === 'function' ? comp.getMaterial(i) : (i === 0 ? mat : null); } catch (err) { shared = null; }
          const primary = i === 0 && mat ? mat : shared;
          if (!primary) { break; }
          const s = summarize(primary);
          if (shared && !s.name && s.name === null) { s.name = shared.name || null; }
          s.nameFrom = primary === shared ? 'material' : (shared ? 'shared-material-name+instance-props' : 'instance');
          slots.push(s);
        }
        r.materials = slots;
        r.material = slots.length ? slots[0] : null;
        entry.renderers.push(r);
      }
      out.push(entry);
      for (const child of node.children || []) { walk(child, path); }
    };
    for (const child of scene.children || []) { walk(child, ''); }
    return { nodes: out, error: null };
    } finally {
      if (trace) { trace.observing -= 1; }
    }
  }, propertyNames || []);
}

module.exports = { nearly, readScene, TOLERANCE };
