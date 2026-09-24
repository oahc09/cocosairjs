#!/usr/bin/env bash
set -u
REPO=E:/AIProMax/github/cocosair.js
cd "$REPO" || exit 9
NP=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules
D=docs/evidence/v12/mesh-sphere-r45m
L=docs/audits/global-quality-audit-2026-09-19/raw/gates
mkdir -p "$D"
echo "== pre-flight: sentinel / candidate currency"
grep -c not-a-real-validator examples/mesh-sphere/example.json || echo "sentinel_absent=1"
node -e 'const t=require("./tools/verify/api-trace.cjs");const s=t.candidateFingerprint?t.candidateFingerprint():t.fingerprint?t.fingerprint():"?";console.log("live candidate:",s)' 2>/dev/null || echo "candidate probe skipped"
echo "== lock: canonical sha16 BEFORE"
for f in docs/evidence/v11-examples-verified.json docs/evidence/examples/mesh-sphere.png examples/mesh-sphere/example.json examples/files.json; do
  node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('$f');console.log(b.length, c.createHash('sha256').update(b).digest('hex').slice(0,16), '$f')"
done
for BR in firefox webkit; do
  echo "== leg $BR start $(date -u +%FT%TZ)"
  NODE_PATH="$NP" node tools/verify/v11-examples-verify.cjs --ids=mesh-sphere --browser=$BR \
    --out=$D/v11-chain-$BR-mesh-sphere.json --artifact-dir=$D/$BR-mesh-sphere > "$L/r45m-$BR-mesh-sphere.log" 2>&1
  echo "LEG_${BR}_EXIT=$?"
  echo "== leg $BR end $(date -u +%FT%TZ)"
done
echo "== lock: canonical sha16 AFTER"
for f in docs/evidence/v11-examples-verified.json docs/evidence/examples/mesh-sphere.png examples/mesh-sphere/example.json examples/files.json; do
  node -e "const c=require('crypto'),f=require('fs');const b=f.readFileSync('$f');console.log(b.length, c.createHash('sha256').update(b).digest('hex').slice(0,16), '$f')"
done
echo "all legs done"
