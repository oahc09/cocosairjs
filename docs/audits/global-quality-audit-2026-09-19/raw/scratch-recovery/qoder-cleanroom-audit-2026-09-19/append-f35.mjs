import fs from 'node:fs';
const F = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/findings.jsonl';
const f35 = {
  findingId: 'F-35',
  requirementId: "PLAN §6 'Gallery 包必须含编译示例、可查看源码和明确静态依赖，不能依赖隐藏 TS 编译或 /__debug/ 服务' + §7 '全部声称 stable 的 Example' + 合同 'DevTools 是显式独立产物'; CORRECTS and EXTENDS F-34 scope",
  gate: 'galleryStandalone + exampleStableVerify (stable promotion) + devTools consumer boundary',
  category: 'self-correction of my own earlier wording + shipped-artifact scan (read-only, no repo modification)',
  blocking: true,
  location: "build/examples/automation/main.boot.js:76 `sessionModule = await import(\"/__debug/agent-session.js\")` with :79 `throw error` (NO guard); build/examples/rc-{capture-frame,create-node,error-report,inspect-scene}/main.boot.js:48 `var debugBase = window.__debugBase || \"/__debug\"`; examples/automation/example.json + the 4 rc-*/example.json all status=stable requiresDevTools=true; build/examples/index.html advertises these cards in the static gallery",
  repro: "Full sweep of all 45 shipped main.boot.js (raw/gallery-static/absolute-url-scan.txt): 5 files reference /__debug; 4 rc-* build the URL from `window.__debugBase || \"/__debug\"`, 1 (automation) hardcodes the absolute literal and rethrows on failure. Serve the artifact from its own root with no dev server: window.__debugBase is never injected, so the rc-* imports also resolve to /__debug/agent-session.js -> 404 -> rejected promise. My earlier probe's whole-file `__debugBase` skip is why F-34 first described all 5 as 'guarded, benign'.",
  expected: "A `stable` example shipped in the Gallery-static artifact must be self-contained under that profile (contract §6 forbids /__debug/ dependence), or be excluded/flagged as a DevTools-profile item rather than counted as stable in the static gallery",
  actual: "6/45 shipped examples are declared stable AND require the dev-server /__debug agent-session endpoint (automation unconditionally + with an uncaught rethrow). The `__debugBase` fallback only lets a HOST override the base; it does not make the dependency optional, so 'guarded' != 'static-safe'. Combined with F-34, the Gallery-static package cannot self-execute 6 stable examples offline.",
  evidence: 'raw/gallery-static/absolute-url-scan.txt (this-run sweep incl. per-file status/requiresDevTools), raw/gallery-static/offline-static-probe.txt (200/404/200 decoder triple + unguarded-URL list), source reads of the 6 boot.js files and their example.json',
  impact: "galleryStandalone and exampleStableVerify stay PARTIAL (not PASS) for the delivered artifact; the F-24 wording 'no /__debug/ in shipped build/examples/' is WRONG as stated and is superseded by this finding. Classification must be: 1 pure bug (gltf-meshopt absolute /build/ decoder URL 404s although the decoder IS shipped relatively -> F-34) + 5 profile-boundary violations (stable examples that need explicit DevTools -> this finding). Runtime npm tarball unaffected (F-32 clean).",
  minimalRecommendation: "Decide and document the Gallery-static contract in one place: either (a) the gallery manifest/gate marks requiresDevTools examples as DevTools-profile and excludes them from the static-only certification set (and the index labels them), or (b) the Gallery product ships a static agent-session/DevTools entry so those 6 run offline. Independently of (a)/(b), automation should use the same overridable base and degrade with an explicit 'requires DevTools' skip message instead of an uncaught throw.",
  retestScope: 'R1b/R7: re-run the boot.js absolute-URL sweep (expect 0 unguarded hits and every requiresDevTools item either excluded from the static profile or satisfiable offline), then a network-blocked gallery-static render sweep of the remaining examples; re-confirm the 40/40 example-stable set under the chosen profile split',
  verificationOwner: 'Gallery/DevTools owner + Example Reviewer',
  verdict: 'FAIL (6 stable examples in the shipped Gallery artifact depend on the dev-server /__debug endpoint; automation additionally hardcodes it and rethrows) -> corrects F-34 wording, keeps galleryStandalone + exampleStableVerify PARTIAL, blocks release'
};
fs.appendFileSync(F, JSON.stringify(f35) + '\n');
const lines = fs.readFileSync(F, 'utf8').trim().split('\n');
lines.forEach((l, i) => { try { JSON.parse(l); } catch (e) { console.log('BAD LINE', i + 1, e.message); process.exit(1); } });
console.log('findings.jsonl OK lines=' + lines.length, 'last=' + JSON.parse(lines[lines.length - 1]).findingId);
