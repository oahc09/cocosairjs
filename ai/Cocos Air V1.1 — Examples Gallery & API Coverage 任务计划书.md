## §16 — API Coverage Gate

API Coverage 的分母必须来自 G0/T1 冻结的 `Public API Inventory`，不得通过 Example 数量或手工 `apiClaims` 动态改变。

### Coverage 分母

定义：

```text
CoreTotal
=
tier == core
且 coverageRequired == true
的 Public API Unit 数量

ImportantTotal
=
tier == important
且 coverageRequired == true
的 Public API Unit 数量

AdvancedTotal
=
tier == advanced
且 coverageRequired == true
的 Public API Unit 数量
```

`internal` 不进入 Coverage 分母。

已经正式标记为 deprecated 且 `coverageRequired == false` 的 API 单独报告，不进入当前 Release Coverage 分母；这一排除必须存在于冻结的 API Inventory 中，不能在 Coverage 计算时临时删除。

G0 之后如果 Public API Inventory 发生变化：

```text
新增 / 删除 / 改级别 / 改 coverageRequired
```

必须产生新的：

```text
apiInventoryRevision
```

并重新计算 Coverage，不能沿用旧比例。

---

### Coverage 状态

每个 API Unit 只能处于：

```text
uncovered
claimed
verified
documented-only
```

其中：

#### claimed

Example metadata 声明使用该 API，但没有足够执行证据。

不计任何 Coverage Gate。

#### verified

必须同时具备：

```text
Example 实际代码位置
+
运行时执行证据
+
对应 Validator PASS
+
lastVerifiedRevision
```

才计入 Verified Coverage。

#### documented-only

表示该 API 不适合或没有必要建立独立可运行 Example。

必须记录：

```text
reason
documentationRef
approval
apiInventoryRevision
```

典型原因可以包括：

```text
纯声明型 API
只能通过其它公开 API 间接触发
需要破坏性/不可稳定复现环境
独立 Example 无额外教学价值
```

`documented-only` 是豁免状态，不等同于验证成功。

---

### Core Gate

```text
CoreVerifiedRate
=
CoreVerified / CoreTotal
```

要求：

```text
CoreVerifiedRate = 100%
```

Core 不允许通过 `documented-only` 替代 verified。

---

### Important Gate

```text
ImportantVerifiedRate
=
ImportantVerified / ImportantTotal
```

要求：

```text
ImportantVerifiedRate >= 90%
```

其余必须有明确状态，不允许无原因 `uncovered`。

---

### Advanced Gate

统一计算：

```text
AdvancedVerifiedRate
=
AdvancedVerified / AdvancedTotal

AdvancedDocumentedOnlyRate
=
AdvancedDocumentedOnly / AdvancedTotal

AdvancedUncovered
=
AdvancedTotal
- AdvancedVerified
- AdvancedDocumentedOnly
```

V1.1 Release 必须同时满足：

```text
AdvancedVerifiedRate >= 80%

AdvancedDocumentedOnlyRate <= 20%

AdvancedUncovered = 0
```

关键规则：

> `documented-only` 不进入 `AdvancedVerifiedRate` 的分子。

例如：

```text
AdvancedTotal = 100

Verified = 80
DocumentedOnly = 20
Uncovered = 0
```

结果：

```text
Verified Rate = 80%
DocumentedOnly Rate = 20%

PASS
```

但：

```text
Verified = 0
DocumentedOnly = 100
```

结果：

```text
Verified Rate = 0%

FAIL
```

即使所有 API 都写了说明，也不能替代实际 Example Coverage。

---

### Coverage Report

最终报告必须分别输出：

```text
Total
Verified
Verified Rate
Documented-only
Documented-only Rate
Claimed
Uncovered
```

禁止将：

```text
verified + documented-only
```

合并成一个“Coverage Rate”。

这两个指标必须始终独立展示。

---

## §20 — Manifest Generator 与 Screenshot 生命周期

`examples/files.json` 是 Example Discovery Manifest。

它必须能够在 Example 尚无 Screenshot 时生成，否则会形成：

```text
Manifest
需要 Screenshot
      ↑
      │
Screenshot Tool
又需要 Manifest
```

的循环依赖。

因此 Manifest 生成和 Release Validation 必须拆成不同阶段。

---

### Phase A — Development Manifest

执行：

```bash
npm run examples:index
```

或等价：

```bash
npm run examples:index -- --mode=development
```

扫描：

```text
examples/**/example.json
```

生成完整 Manifest。

此阶段：

```text
Missing Screenshot
```

只能产生：

```text
diagnostic / warning
```

不能阻断 Manifest 生成。

Manifest 仍必须包含该 Example。

例如：

```json
{
  "id": "material-clearcoat",
  "status": "validated",

  "screenshot": {
    "state": "missing"
  }
}
```

---

### Screenshot 状态

统一：

```text
missing
stale
current
not-required
```

#### missing

没有 Screenshot。

#### stale

Screenshot 存在，但：

```text
screenshot.evidenceRevision
!=
example.lastVerifiedRevision
```

或 Example 的关键源码/资源已经变化。

#### current

Screenshot 与当前验证证据 revision 一致。

#### not-required

明确不需要缩略图的特殊 Example。

必须在 metadata 中说明原因。

---

### Phase B — Screenshot Generation

执行：

```bash
npm run examples:screenshot
```

Screenshot Tool 消费：

```text
Development Manifest
```

因此即使 Example 当前：

```text
screenshot.state = missing
```

也必须能够：

```text
发现 Example
→ 启动 Example
→ 等待 Ready
→ 执行 Validator
→ Capture
```

生成：

```text
examples/screenshots/<example-id>.jpg
```

---

### Screenshot 生成前置

不能直接打开页面就截图。

必须：

```text
Open Example
 ↓
Wait Ready Condition
 ↓
Functional Validators
 ↓
必要 Interaction
 ↓
Visual-ready
 ↓
Capture
```

如果：

```text
Ready FAIL
Validator FAIL
Unexpected Runtime Error
```

则：

```text
Screenshot Generation FAIL
```

不能生成正式缩略图掩盖问题。

---

### Screenshot Evidence

生成后记录：

```text
path
generatedAt
exampleRevision
evidenceRevision
environment
viewport
```

例如：

```json
{
  "screenshot": {
    "state": "current",
    "path": "screenshots/material-clearcoat.jpg",
    "evidenceRevision": "abc123",
    "viewport": "1280x720"
  }
}
```

---

### Phase C — Release Manifest Validation

正式发布检查：

```bash
npm run examples:verify
```

或：

```bash
npm run examples:index -- --mode=release
```

此时才将 Screenshot 纳入硬 Gate。

对于：

```text
status == stable
```

的 Example，必须：

```text
Screenshot exists
```

并且：

```text
screenshot.state == current
```

除非：

```text
not-required
```

且有明确批准理由。

---

### Release Screenshot Gate

Stable Example 必须满足：

```text
Ready PASS

Functional Validation PASS

Screenshot exists

Screenshot evidenceRevision
==
lastVerifiedRevision
```

如果 Example 源码、关键 Asset 或 Validation Evidence 已更新：

旧 Screenshot 自动变成：

```text
stale
```

V1.1 Release 被阻断，直到重新生成。

---

### Thumbnail 与 Visual Regression 继续分离

即使：

```text
screenshot.state == current
```

也只表示：

> 这是当前 Example 的有效 Gallery 展示图。

它不会自动成为：

```text
Visual Regression Reference
```

Visual Regression Baseline 仍需单独：

```text
审核
baselineRevision
environment
viewport
```

确认。

---

## §76 — Advanced API Coverage Gate

统一使用 §16 的唯一公式。

V1.1 Release 要求：

```text
CoreVerifiedRate = 100%

ImportantVerifiedRate >= 90%

AdvancedVerifiedRate >= 80%

AdvancedDocumentedOnlyRate <= 20%

AdvancedUncovered = 0
```

其中：

```text
documented-only
```

不计入任何 Verified Coverage 分子。

报告必须分别显示：

```text
verified

documented-only

claimed

uncovered
```

禁止使用：

```text
verified/documented-only >= 80%
```

这类合并表达。

---

## §80–81 — Screenshot Pipeline

执行：

```bash
npm run examples:index
        ↓
Development Manifest
        ↓
npm run examples:screenshot
        ↓
Ready / Functional Validation
        ↓
Screenshot
        ↓
Manifest Refresh
        ↓
npm run examples:verify
        ↓
Release Gate
```

因此完整生命周期为：

```text
example.json
     ↓
Development Manifest
     ↓
Example 可发现
     ↓
Screenshot Tool
     ↓
Screenshot
     ↓
Evidence Revision
     ↓
Release Validation
```

不存在：

```text
没有 Screenshot
→ 无法生成 Manifest
→ Screenshot Tool 无法发现 Example
```

的循环依赖。

---

## V1.1 最终 Release Coverage / Screenshot Gate

必须同时：

```text
Core API Verified = 100%

Important API Verified >= 90%

Advanced API Verified >= 80%

Advanced documented-only <= 20%

Advanced uncovered = 0

所有 Stable Example Screenshot 状态为 current
或明确 not-required

所有 Stable Example Screenshot
与当前验证 evidence revision 对应
```

`documented-only` 解决“某些 API 不适合独立 Example”的问题；

`development manifest` 解决“新 Example 尚无 Screenshot 时仍必须被工具发现”的问题。

两者都不得用于降低最终发布质量门槛。
