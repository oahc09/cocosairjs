/* V1.1 G1 — DevTools 示例证据：requiresDevTools 示例（automation）经会话桥的当期运行验证。
 *
 * automation 的教学合同（E012）：显式绑定 __airApp 后，DevTools/Agent Session 以冻结合同
 * （inspectScene / dispatch / captureFrame）观察并受控修改运行中的场景；Runtime-only
 * bundle 不含 DevTools——本验证通过 bench 会话桥（/__debug/agent-session.js）模拟宿主 attach。
 *
 * 执行：NODE_PATH=<playwright> node tools/verify/v11-devtools-examples.cjs
 * 证据：docs/evidence/v11-devtools-examples.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const REPO = path.resolve(__dirname, '..', '..');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'v11-devtools-examples.json');

function copyTree (from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); } else { fs.copyFileSync(src, dst); }
  }
}

async function verifyAutomation () {
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v11-devtools-'));
  const workspace = path.join(workRoot, 'workspace');
  const runtime = new BrowserRuntime({ esbuild, repo: REPO });
  const results = [];
  const check = (id, ok, detail) => { results.push({ id, state: ok ? 'PASS' : 'FAIL', detail: String(detail || '').slice(0, 200) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail || ''}`); return ok; };
  try {
    copyTree(path.join(REPO, 'examples', 'automation'), workspace);
    const sharedSrc = path.join(REPO, 'examples', 'shared');
    copyTree(sharedSrc, path.join(workspace, 'shared'));
    const htmlPath = path.join(workspace, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>');
    fs.writeFileSync(htmlPath, html.replace(/(\.\.\/)shared\//g, './shared/'));
    // main.ts 的 ../shared/ 引用改写（与批量验证器一致）
    const mainPath = path.join(workspace, 'main.ts');
    if (fs.existsSync(mainPath)) {
      fs.writeFileSync(mainPath, fs.readFileSync(mainPath, 'utf8').replace(/(\.\.\/)shared\//g, './shared/'));
    }
    const channel = await runtime.start({ paths: { workspace } });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 1) 场景观察合同
    const scene = await channel.inspect({ kind: 'inspectScene' });
    check('inspectScene', !!scene && scene.nodeCount > 0, `sceneId=${scene && scene.sceneId} nodeCount=${scene && scene.nodeCount}`);

    // 2) 受控修改合同（dispatch createNode → 核对在场）
    const root = scene.nodes[scene.nodes.length - 1];
    const created = await channel.inspect({
      kind: 'dispatch', requestId: 'devtools-evidence-1', action: 'createNode', targetId: root.id, params: { name: 'devtools-evidence-node' },
    });
    const after = await channel.inspect({ kind: 'inspectScene' });
    const present = (after.nodes || []).some((n) => n.name === 'devtools-evidence-node');
    check('dispatch:createNode', !!created && !!created.nodeId && present, `nodeId=${created && created.nodeId} present=${present} nodeCount ${scene.nodeCount}→${after.nodeCount}`);

    // 3) 帧捕获合同
    const cap = await channel.captureFrame();
    check('captureFrame', !!cap.png && cap.png.length > 512, `bytes=${cap.png ? cap.png.length : 0}`);

    // 4) 错误报告合同
    const errors = await channel.errorReport({ limit: 50 });
    check('getRuntimeErrors', errors.errors.length === 0, `${errors.errors.length} runtime errors`);

    const specFile = path.join(REPO, 'examples', 'automation', 'example.json');
    const specRaw = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    delete specRaw.status;
    delete specRaw.promotionEvidence;
    const specFingerprint = crypto.createHash('sha256').update(JSON.stringify(specRaw)).digest('hex').slice(0, 12);
    const pass = results.every((r) => r.state === 'PASS');
    const evidence = {
      measuredAt: new Date().toISOString(),
      runner: 'tools/verify/v11-devtools-examples.cjs',
      contract: 'V0.5.1 DevTools/Agent Session 冻结合同（inspectScene/dispatch/captureFrame/getRuntimeErrors）',
      examples: [{ id: 'automation', requiresDevTools: true, result: pass ? 'PASS' : 'FAIL', specFingerprint, validatorResults: results }],
      total: results.length,
      pass: results.filter((r) => r.state === 'PASS').length,
    };
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`[devtools-examples] automation ${pass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    return pass;
  } finally {
    await runtime.stop().catch(() => {});
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

(async () => {
  process.exit((await verifyAutomation()) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
