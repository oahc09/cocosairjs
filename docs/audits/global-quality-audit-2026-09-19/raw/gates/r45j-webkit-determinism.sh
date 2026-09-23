#!/bin/bash
# r45j-k：webkit 两例红格的「结构性 vs 时序性」判定批次（同签名：resource-released + api-executed）
# 判据：结构性缺陷（如在册 F-100）应每次同样 FAIL；时序竞态应出现 PASS/FAIL 混合。
# 只写 docs/evidence/v12/v11chain-r45j/ 下 diag-* 前缀（非正典、--out 触发 [skip-promote]）。
set -u
cd "E:/AIProMax/github/cocosair.js" || exit 9
export NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules
node -e "require('playwright')" || { echo "ABORT: playwright 未解析（NODE_PATH 未生效）"; exit 8; }
LOG=E:/AIProMax/cocosair-scratch/v12-logs/r45j-webkit-determinism.log
: > "$LOG"
for id in audio-basic video-basic; do
  for n in 1 2 3; do
    out=docs/evidence/v12/v11chain-r45j/diag-$id-wk-d$n.json
    art=docs/evidence/v12/v11chain-r45j/diag-$id-wk-d$n
    echo "=== $id run$n $(date -u +%H:%M:%S)" | tee -a "$LOG"
    node tools/verify/v11-examples-verify.cjs --ids=$id --browser=webkit --out=$out --artifact-dir=$art 2>&1 | tee -a "$LOG" | grep -E "^(PASS|FAIL) " || true
    echo "EXIT_${id}_$n=${PIPESTATUS[0]}" | tee -a "$LOG"
  done
done
echo "=== DONE $(date -u +%H:%M:%S)" | tee -a "$LOG"
