#!/usr/bin/env bash
# r45j: V1.1 规格链余下 41 例 × firefox/webkit（非正典落点，零回写）。串行四腿，各自 EXIT 记录。
set -u
REPO=/e/AIProMax/github/cocosair.js
OUT=docs/evidence/v12/v11chain-r45j
LOG=/e/AIProMax/cocosair-scratch/v12-logs
A='anim-position,anim-rotation,audio-basic,camera-lookat,camera-multi,camera-ortho,dragonbones-basic,gltf-basic,gltf-clearcoat,gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,interaction-click,light-point,light-sphere,light-spot,light-two-directional,material-color,material-transparent,material-unlit'
B='mesh-cylinder,mesh-multi-material,mesh-plane,mesh-sphere,node-active,node-hierarchy,node-scale,particle-2d-basic,physics-2d-basic,physics-2d-collision,physics-3d-basic,profiler-overlay,runtime-asset-release,texture-basic,tiledmap-basic,ui-components,ui-layout,video-basic,webview-basic'
cd "$REPO" || exit 9
# 前置守卫：playwright 不在本仓库依赖内，必须靠 NODE_PATH 注入（缺注入会让每一例秒判 FAIL，
# 产出一份「0/N PASS」的垃圾捕获——r45j 首跑即因此作废，见 raw/gates/r45j-firefox-chunkA-garbage.log）。
export NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules
if ! node -e "require('playwright')" >/dev/null 2>&1; then
  echo "ABORT: playwright 不可解析（NODE_PATH 未生效）$(date -u +%FT%TZ)" | tee -a "$LOG/r45j-exits.txt"
  exit 8
fi
for eng in firefox webkit; do
  for part in A B; do
    ids_var=$(eval echo \$$part)
    echo "=== r45j $eng chunk-$part start $(date -u +%FT%TZ) ==="
    node tools/verify/v11-examples-verify.cjs --ids="$ids_var" --browser="$eng" \
      --out="$OUT/v11-chain-$eng-chunk$part.json" \
      --artifact-dir="$OUT/$eng-chunk$part" > "$LOG/r45j-$eng-chunk$part.log" 2>&1
    echo "EXIT_${eng}_chunk${part}=$?" | tee -a "$LOG/r45j-exits.txt"
    grep -c 'skip-promote' "$LOG/r45j-$eng-chunk$part.log" | sed "s/^/skip-promote_lines_${eng}_${part}=/" | tee -a "$LOG/r45j-exits.txt"
  done
done
echo "=== r45j all legs done $(date -u +%FT%TZ) ==="
