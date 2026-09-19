import fs from 'node:fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';

const block = `

---
## UPDATE 6 — F-34/F-35 Gallery-static clean-room (executed offline, artifact served from its OWN root)
Reproduced with a captured raw log (not a paraphrase): plain node http static server rooted at build/examples, no /build/ host route and no /__debug/ endpoint -> raw/gallery-static/offline-static-probe.txt:
- 200 /gltf-meshopt/main.boot.js | **404 /build/gltf-decoders/meshopt/meshopt_decoder.mjs** | 200 /gltf-decoders/meshopt/meshopt_decoder.mjs | 200 /gltf-meshopt/assets/meshopt-khr.glb | 200 /cocosair.module.js
So the meshopt decoder FILE ships but the compiled boot.js asks for a host-absolute URL -> **F-34 FAIL (blocking)**. Root cause is the artifact builder rewrite guard (v11-gallery-artifact.cjs:46 requires a trailing slash) vs the example's concatenated source literal. My earlier green 13/13 gallery run was a false negative: the dev server silently supplies /build/.
Full sweep of all 45 shipped main.boot.js (raw/gallery-static/absolute-url-scan.txt) -> exactly **2 unguarded absolute URLs, both in status=stable examples**: gltf-meshopt (/build/ decoder) and **automation (/__debug/agent-session.js, unconditional import + uncaught rethrow)**. 4 rc-* files use window.__debugBase || "/__debug".
- **F-35 self-correction:** F-34 first described all 5 rc-*/automation hits as "guarded = disclosed boundary, not a leak". Wrong for automation (no guard, rethrows), and the guard is only a base OVERRIDE (a host must inject __debugBase) — it does not make the dependency optional. Correct statement: 6 shipped examples are stable AND require the dev-server debug endpoint, so the Gallery-static artifact cannot self-execute them offline. This supersedes F-24's "no /__debug/ in shipped build/examples" clause.
Net: galleryStandalone PASS->PARTIAL, exampleStableVerify PASS->PARTIAL, blockingForRelease gains a gallery-static self-containment item. Overall stays **NOT_READY**. Runtime npm tarball result (F-32) is unaffected. Remediation + retest: R1b.
`;
fs.appendFileSync(DIR + '/verification-summary.md', block);

const idx = JSON.parse(fs.readFileSync(DIR + '/evidence-index.json', 'utf8'));
const key = Object.keys(idx).find(k => Array.isArray(idx[k]) && idx[k].some(e => e && e.id === 'CLEANROOM-2026-09-19'));
idx[key].push({
  id: 'GALLERY-STATIC-2026-09-19',
  findings: ['F-34', 'F-35'],
  raw: ['raw/gallery-static/offline-static-probe.txt', 'raw/gallery-static/absolute-url-scan.txt'],
  scratch: 'E:/qoder-cleanroom-audit-2026-09-19 (gallery-probe.mjs, abs-url-scan.mjs)',
  summary: 'Artifact served from its own root offline: gltf-meshopt absolute /build/ decoder URL 404 while the shipped relative decoder 200 (F-34); 45-boot.js absolute-URL sweep = 2 unguarded hits, both stable (gltf-meshopt, automation /__debug rethrow) -> galleryStandalone + exampleStableVerify downgraded to PARTIAL (F-35)'
});
fs.writeFileSync(DIR + '/evidence-index.json', JSON.stringify(idx, null, 2) + '\n');

for (const f of ['global-verdict.json', 'evidence-index.json']) {
  JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'));
  console.log(f + ' JSON OK');
}
console.log('summary appended; entries in ' + key + ' = ' + idx[key].length);
