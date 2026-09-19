import fs from 'node:fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const SCR = 'E:/qoder-rebuild-audit-2026-09-19';

fs.mkdirSync(DIR + '/raw/rebuild', { recursive: true });
for (const f of ['original-build-hashes.txt', 'build-before.txt', 'rebuild.log', 'rebuild2.log', 'rebuild3.log', 'rebuild-min.log', 'rebuild-dts.log', 'L1', 'L2']) {
  const src = SCR + '/' + f;
  if (fs.existsSync(src)) fs.copyFileSync(src, DIR + '/raw/rebuild/' + f);
}
console.log('raw/rebuild files:', fs.readdirSync(DIR + '/raw/rebuild').join(', '));

const f36 = {
  findingId: 'F-36',
  requirementId: "PLAN §6 '在干净环境重建并审计实际打包字节' + §1 候选身份 + §9 发布目录",
  gate: 'cleanRoomRebuildReproducibility (NEW) + publishDir hygiene + runtimePackageBoundary (R0 sub-item closed)',
  category: 'isolated full-copy rebuild outside the repo (original tree untouched; read-only run of the pinned toolchain)',
  blocking: false,
  location: "E:/qoder-rebuild-audit-2026-09-19/repo = full copy of the working tree (incl. all uncommitted files) + node_modules copied from the repo (no new tool downloads); build/ deleted, then npm-build commands run; shipped artifact hashes in raw/rebuild/original-build-hashes.txt",
  repro: "rm -rf build && node tools/build/build.cjs --format esm (EXIT 0, 23.3s) && --format esm --min (EXIT 0) && node tools/build/build-dts.cjs (EXIT 0, 12.4s). Re-ran the base build a 3rd time after clearing build/.tmp-rollup-cache.",
  expected: "Public runtime artifacts reproducible from source with the pinned toolchain, identical across runs, and reproducible by the documented build entry",
  actual: "POSITIVE: all four shipped runtime artifacts came out BYTE-IDENTICAL to the shipped bytes -- cocosair.module.js c75d5961a6f8.., cocosair.module.min.js 1c41316ba85a.., cocosair.module.d.ts ff987a513ddb.., cocosair.module.js.map ca3e56d50ef4..; run#2 vs run#3 cmp-identical (deterministic, no host-absolute path baked in because the copy was on a different drive/path). SECONDARY (non-blocking) observations: (a) `npm run build` alone emits only module.js/.map/build/package.json -- min and .d.ts need the separate documented scripts build:min and build:dts, so no single command regenerates everything listed in package.json `files`; (b) the repo's build/ directory holds 1520 files of which the documented build regenerates 13: the rest are committed intermediates/byproducts -- `.dts-before-bundle/` (787 files), three `.tmp-v03-site-<timestamp>/nested` dirs (78 each), plus `examples/` (gallery artifact incl. 45 thumbnails + gltf-viewer) and `.tmp-rollup-cache/`. The npm tarball is unaffected (F-32: 73 files, junk excluded), so this is repo/publish-dir hygiene, not a consumer defect. build:dts prints 'Failed to resolve type import('pal/input/input-source').InputSourcePosition...' warnings yet exits 0 and reproduces the identical .d.ts -> pre-existing, non-material.",
  evidence: 'raw/rebuild/{original-build-hashes.txt,build-before.txt,rebuild.log,rebuild2.log,rebuild3.log,rebuild-min.log,rebuild-dts.log,L1,L2} + cmp/awk hashes this-run',
  impact: "Closes the 'rebuild-from-src byte reproducibility not run' caveat in F-32/R0 for the RUNTIME artifacts: the shipped build/ is honestly derived from the current source, so candidate-drift risk is about evidence freshness binding, not fabricated artifacts. Publish-dir hygiene is a cleanup candidate only (auditor must not delete).",
  minimalRecommendation: "Optional: add a `build:all` (esm + min + dts [+ gallery artifact]) release script or document the exact sequence in the release doc; add `.dts-before-bundle/`, `.tmp-*/`, `.tmp-rollup-cache/` to a cleanup candidate list (report only, no deletion) and decide whether build/examples should be git-ignored and produced by the gallery gate instead.",
  retestScope: 'R0: after freezing a candidate, re-run this rebuild and compare against the frozen artifact hashes (expect identical). No consumer-facing retest required.',
  verificationOwner: 'Build/Release owner',
  verdict: 'PASS (clean-room rebuild from source reproduces the shipped runtime artifacts byte-identically and deterministically) with a non-blocking PARTIAL publish-dir hygiene note'
};
fs.appendFileSync(DIR + '/findings.jsonl', JSON.stringify(f36) + '\n');
const lines = fs.readFileSync(DIR + '/findings.jsonl', 'utf8').trim().split('\n');
lines.forEach((l, i) => { try { JSON.parse(l); } catch (e) { console.log('BAD', i + 1); process.exit(1); } });
console.log('findings OK lines=' + lines.length);

const v = JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
v.gates.cleanRoomRebuild = "PASS (F-36: full working-tree copy OUTSIDE repo with the repo's pinned node_modules; build/ deleted; `build.cjs --format esm` + `--min` + `build-dts.cjs` all EXIT 0 and produced cocosair.module.js/.min.js/.d.ts/.js.map BYTE-IDENTICAL to the shipped artifacts (c75d5961a6f8 / 1c41316ba85a / ff987a513ddb / ca3e56d50ef4); third run cmp-identical => deterministic and path-independent. Non-blocking PARTIAL: no single command regenerates all shipped `files` (needs build + build:min + build:dts) and committed build/ holds 1520 files of which only 13 are generated by the documented build (.dts-before-bundle 787, .tmp-v03-site-* dirs, .tmp-rollup-cache; tarball unaffected per F-32)";
v.gates.runtimePackageBoundary = v.gates.runtimePackageBoundary.replace('Still OPEN -> R0: build-from-src reproducibility byte-diff not run (used current build/ artifacts);', 'CLOSED by F-36: rebuild-from-src byte-diff run in an isolated full copy -> shipped runtime artifacts reproduced byte-identically and deterministically (remaining R0 need is only hash-binding of evidence while the tree mutates);');
fs.writeFileSync(DIR + '/global-verdict.json', JSON.stringify(v, null, 2) + '\n');
JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
console.log('verdict updated; cleanRoomRebuild gate added');

const idx = JSON.parse(fs.readFileSync(DIR + '/evidence-index.json', 'utf8'));
idx.evidence.push({
  id: 'REBUILD-2026-09-19',
  findings: ['F-36'],
  raw: ['raw/rebuild/original-build-hashes.txt', 'raw/rebuild/build-before.txt', 'raw/rebuild/rebuild.log', 'raw/rebuild/rebuild2.log', 'raw/rebuild/rebuild3.log', 'raw/rebuild/rebuild-min.log', 'raw/rebuild/rebuild-dts.log', 'raw/rebuild/L1', 'raw/rebuild/L2'],
  scratch: 'E:/qoder-rebuild-audit-2026-09-19/repo (deleted after hashing to reclaim 7.1GB)',
  summary: 'Clean-room full-copy rebuild: build/ removed, three documented build steps EXIT 0, all four runtime artifacts byte-identical to shipped + deterministic across runs; publish-dir hygiene note (only 13/1520 build files are generated)'
});
fs.writeFileSync(DIR + '/evidence-index.json', JSON.stringify(idx, null, 2) + '\n');
console.log('evidence-index entries=' + idx.evidence.length);
