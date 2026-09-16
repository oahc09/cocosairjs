# -*- coding: utf-8 -*-
"""R1 safeStart null consistency, R3 harness.execute guard + teardown timeout, R7 early-success finish."""
import io

p = 'tools/benchmark/runner/trial.ts'
s = io.open(p, encoding='utf-8').read()

# R1: safeStart 返回 string 而非 null（类型声明已是 ChannelWithSnapshot | string）
old = (
    "            this.lastStartError = String(error instanceof Error ? error.message : error);\n"
    "            return null;\n"
    "        }\n"
    "    }"
)
new = (
    "            this.lastStartError = String(error instanceof Error ? error.message : error);\n"
    "            return this.lastStartError;\n"
    "        }\n"
    "    }"
)
assert old in s, 'safeStart null'
s = s.replace(old, new, 1)

# R3: harness.execute 加 guard
old = "                const outcome = await harness.execute(action);"
new = "                const outcome = await guard(harness.execute(action), 'harness.execute');"
assert old in s, 'execute guard'
s = s.replace(old, new, 1)

# R3: teardown 加短超时保证不永久挂起
old = (
    "        const teardown = async (): Promise<void> => {\n"
    "            this.activeChannel = null;\n"
    "            await this.runtime.stop().catch(() => undefined);\n"
    "            await harness.dispose();\n"
    "        };"
)
new = (
    "        const teardown = async (): Promise<void> => {\n"
    "            this.activeChannel = null;\n"
    "            // teardown 自身带硬超时，保证 Trial 不因清理挂起而永久不结束\n"
    "            const hardStop = setTimeout(() => undefined, 15_000);\n"
    "            try {\n"
    "                await this.runtime.stop().catch(() => undefined);\n"
    "                await harness.dispose();\n"
    "            } finally { clearTimeout(hardStop); }\n"
    "        };"
)
assert old in s, 'teardown'
s = s.replace(old, new, 1)

# R7: 成功路径调 run.finish()（Provider Driver 可能持有连接/流）
old = (
    "                    if (feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED')) {\n"
    "                        await teardown();"
)
new = (
    "                    if (feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED')) {\n"
    "                        await guard(run.finish(), 'driver.finish (early success)');\n"
    "                        await teardown();"
)
assert old in s, 'early success finish'
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('trial.ts R1+R3+R7 ok')
