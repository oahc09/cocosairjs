#!/usr/bin/env bash
# r45m 台账写盘判据的负控 + 注入自证（陷阱 40/48：每臂按「决定性那一层」判，不只看退出码）
# 所有臂都跑在仓库外 scratch 副本上；仓库真实台账文件必须逐字节未动。
# 路径统一用「盘符 + 正斜杠」：node 与 git-bash 两侧同解（陷阱：/e/... 传给 node 会解析成 E:\e\...）。
set -u
S=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger2-nc
L=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger2-negctl-raw.txt
J=E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19
SCRIPT=E:/AIProMax/cocosair-scratch/db-probe/r45m-ledger2-index-summary.cjs
rm -rf "$S"; mkdir -p "$S/a" "$S/b" "$S/c" "$S/d" "$S/e"
cp "$J/evidence-index.json" "$S/a/index.json"
cp "$J/verification-summary.md" "$S/a/summary.md"
: > "$L"

# 从盘上现算两个目标文件的锁值（不给常量，避免把锁写成语句里的假话）
lockof() { node -e '
const fs=require("fs"),c=require("crypto");const sha=b=>c.createHash("sha256").update(b).digest("hex").slice(0,16);
const i=fs.readFileSync(process.argv[1]),m=fs.readFileSync(process.argv[2]);
process.stdout.write(JSON.stringify({index:{bytes:i.length,sha16:sha(i)},summary:{bytes:m.length,sha16:sha(m)}}));
' "$1" "$2"; }
hashof() { node -e '
const fs=require("fs"),c=require("crypto");const b=fs.readFileSync(process.argv[1]);
process.stdout.write(b.length+"/"+c.createHash("sha256").update(b).digest("hex").slice(0,16));
' "$1"; }

echo "=== N0：注入自证（目标换成 scratch 副本 ⇒ 必须 EXIT=0、injection 三旗标 true、写盘落在副本） ===" | tee -a "$L"
LK=$(lockof "$S/a/index.json" "$S/a/summary.md")
R45M_LEDGER2_LOCK="$LK" R45M_LEDGER2_IDX="$S/a/index.json" R45M_LEDGER2_SUM="$S/a/summary.md" \
  node "$SCRIPT" 2>&1 | tee -a "$L"
echo "N0_EXIT=${PIPESTATUS[0]}" | tee -a "$L"
cp "$S/a/index.json" "$S/b/index.json"; cp "$S/a/summary.md" "$S/b/summary.md"

echo "=== N1：假锁 ⇒ 决定性层＝写前锁抛，且目标文件必须未动 ===" | tee -a "$L"
B=$(hashof "$S/b/index.json")
R45M_LEDGER2_LOCK='{"index":{"bytes":1,"sha16":"deadbeefdeadbeef"},"summary":{"bytes":9999,"sha16":"9eec4cc659367864"}}' \
  R45M_LEDGER2_IDX="$S/b/index.json" R45M_LEDGER2_SUM="$S/b/summary.md" \
  node "$SCRIPT" 2>&1 | grep -E '^Error' | tee -a "$L"
echo "N1_EXIT=${PIPESTATUS[0]}  N1_锁不匹配臂 index 字节 before=$B after=$(hashof "$S/b/index.json")（须相等）" | tee -a "$L"

echo "=== N2：raw[] 引用缺件 ⇒ 锁给真值（避开共享前置短路），必须抛在盘校验 ===" | tee -a "$L"
LK=$(lockof "$S/a/index.json" "$S/a/summary.md")
R45M_LEDGER2_LOCK="$LK" R45M_LEDGER2_RAW='["r45m-gates.log","r45m-not-a-real-file.log"]' \
  R45M_LEDGER2_IDX="$S/a/index.json" R45M_LEDGER2_SUM="$S/a/summary.md" \
  node "$SCRIPT" 2>&1 | grep -E '^Error' | tee -a "$L"
echo "N2_EXIT=${PIPESTATUS[0]}  N2_index=$(hashof "$S/a/index.json")（须与 N0 后同＝未再写）" | tee -a "$L"

echo "=== N3：index 非规范序列化（4 空格缩进副本 + 该副本真锁 ⇒ 必须抛「拒绝改写」） ===" | tee -a "$L"
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],JSON.stringify(j,null,4)+"\n")' "$S/a/index.json" "$S/c/index.json"
cp "$S/a/summary.md" "$S/c/summary.md"
B=$(hashof "$S/c/index.json"); LK=$(lockof "$S/c/index.json" "$S/c/summary.md")
R45M_LEDGER2_LOCK="$LK" R45M_LEDGER2_IDX="$S/c/index.json" R45M_LEDGER2_SUM="$S/c/summary.md" \
  node "$SCRIPT" 2>&1 | grep -E '^Error' | tee -a "$L"
echo "N3_EXIT=${PIPESTATUS[0]}  N3_before=$B after=$(hashof "$S/c/index.json")（须相等＝抛则未写）" | tee -a "$L"

echo "=== N4：summary 已含 Addendum ⇒ 重入必须抛（不许两段叠加） ===" | tee -a "$L"
cp "$S/b/index.json" "$S/d/index.json"; cp "$S/b/summary.md" "$S/d/summary.md"
B=$(hashof "$S/d/summary.md"); LK=$(lockof "$S/d/index.json" "$S/d/summary.md")
R45M_LEDGER2_LOCK="$LK" R45M_LEDGER2_IDX="$S/d/index.json" R45M_LEDGER2_SUM="$S/d/summary.md" \
  node "$SCRIPT" 2>&1 | grep -E '^Error' | tee -a "$L"
echo "N4_EXIT=${PIPESTATUS[0]}  N4_before=$B after=$(hashof "$S/d/summary.md")（须相等＝未叠加）" | tee -a "$L"

echo "=== N5：index 行已存在 + summary 干净 ⇒ 打印 SKIP、index 字节不变、只补 summary ===" | tee -a "$L"
cp "$S/b/index.json" "$S/e/index.json"
cp "$J/verification-summary.md" "$S/e/summary.md"
B=$(hashof "$S/e/index.json"); LK=$(lockof "$S/e/index.json" "$S/e/summary.md")
R45M_LEDGER2_LOCK="$LK" R45M_LEDGER2_IDX="$S/e/index.json" R45M_LEDGER2_SUM="$S/e/summary.md" \
  node "$SCRIPT" 2>&1 | tee -a "$L"
echo "N5_EXIT=${PIPESTATUS[0]}  N5_index before=$B after=$(hashof "$S/e/index.json")（须相等＝不重复追加）" | tee -a "$L"

echo "=== 全部臂跑完后：仓库真实台账必须逐字节未动 ===" | tee -a "$L"
echo "index   $(hashof "$J/evidence-index.json")（期望 95119/14afb04a5e98f89d）" | tee -a "$L"
echo "summary $(hashof "$J/verification-summary.md")（期望 222382/9eec4cc659367864）" | tee -a "$L"
