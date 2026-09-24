#!/usr/bin/env bash
# r45m 台账 Addendum「写盘后补句」判据的四臂负控 + 注入自证（陷阱 40/48）
# 本文件即产出 raw/gates/r45m-ledger3-negctl.log 的那一次跑动脚本，逐字保留，含已知瑕疵：
#   · 末臂 T3 的 echo 里 $(hashof \"...\") 转义写坏 ⇒ 该行报 ENOENT、after 值缺失；
#     已在日志里以「现算补记」行补回（补记值 227566/1d02005b160ced53 与 before 相等 ⇒ 未叠加成立）。
#   · 首轮（未归档）曾因 R45M_ADD2_TARGET 被当仓库相对路径拼接而全臂 ENOENT ⇒ 判据改为「env 给绝对路径」。
# 所有臂写盘只落仓库外 scratch 副本；仓库真实 verification-summary.md 必须逐字节未动。
set -u
S=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger3-nc
L=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger3-negctl-raw.txt
J=E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19
SC=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger3-addendum-tailnote.cjs
rm -rf "$S"; mkdir -p "$S/t0" "$S/t2" "$S/t3"
cp "$J/verification-summary.md" "$S/t0/summary.md"
git -C E:/AIProMax/github/cocosair.js show HEAD:docs/audits/global-quality-audit-2026-09-19/verification-summary.md > "$S/t2/summary.md"
cp "$J/verification-summary.md" "$S/t3/summary.md"
: > "$L"
hashof() { node -e "const fs=require(\"fs\"),c=require(\"crypto\");const b=fs.readFileSync(process.argv[1]);process.stdout.write(b.length+\"/\"+c.createHash(\"sha256\").update(b).digest(\"hex\").slice(0,16))" "$1"; }
lockof() { node -e "const fs=require(\"fs\"),c=require(\"crypto\");const b=fs.readFileSync(process.argv[1]);process.stdout.write(JSON.stringify({bytes:b.length,sha16:c.createHash(\"sha256\").update(b).digest(\"hex\").slice(0,16)}))" "$1"; }

echo "=== T0：注入自证（目标=scratch 当前树副本 ⇒ EXIT=0、injectedTarget true、仓库文件未动） ===" | tee -a "$L"
R45M_ADD2_LOCK=$(lockof "$S/t0/summary.md") R45M_ADD2_TARGET="$S/t0/summary.md" node "$SC" 2>&1 | grep -vE "^ *at |^Node.js" | tee -a "$L"
echo "T0_EXIT=${PIPESTATUS[0]}  仓库 summary=$(hashof "$J/verification-summary.md")（须仍 227539/7326dfbc129216f0）" | tee -a "$L"

echo "=== T1：假锁 ⇒ 决定性层＝写前锁抛 ===" | tee -a "$L"
B=$(hashof "$S/t0/summary.md")
R45M_ADD2_LOCK='{"bytes":1,"sha16":"deadbeefdeadbeef"}' R45M_ADD2_TARGET="$S/t0/summary.md" node "$SC" 2>&1 | grep -E "^Error" | tee -a "$L"
echo "T1_EXIT=${PIPESTATUS[0]}  before=$B after=$(hashof "$S/t0/summary.md")（须相等）" | tee -a "$L"

echo "=== T2：锚点不存在（HEAD 版无 r45m Addendum）⇒ 必须抛「命中 0 次」 ===" | tee -a "$L"
B=$(hashof "$S/t2/summary.md")
R45M_ADD2_LOCK=$(lockof "$S/t2/summary.md") R45M_ADD2_TARGET="$S/t2/summary.md" node "$SC" 2>&1 | grep -E "^Error" | tee -a "$L"
echo "T2_EXIT=${PIPESTATUS[0]}  before=$B after=$(hashof "$S/t2/summary.md")（须相等＝静默空转已被判据挡住）" | tee -a "$L"

echo "=== T3：写盘后补句已存在 ⇒ 必须 SKIP 且不写（可重入半边） ===" | tee -a "$L"
node -e "const fs=require(\"fs\");const p=process.argv[1];const t=fs.readFileSync(p,\"utf8\");const i=t.indexOf(\"不改任何门禁结论。\");fs.writeFileSync(p,t.slice(0,i+9)+\"【写盘后补：占位】\"+t.slice(i+9))" "$S/t3/summary.md"
B=$(hashof "$S/t3/summary.md")
R45M_ADD2_LOCK=$(lockof "$S/t3/summary.md") R45M_ADD2_TARGET="$S/t3/summary.md" node "$SC" 2>&1 | tee -a "$L"
echo "T3_EXIT=${PIPESTATUS[0]}  before=$B after=$(hashof \"$S/t3/summary.md\")（须相等＝不叠加）" | tee -a "$L"
