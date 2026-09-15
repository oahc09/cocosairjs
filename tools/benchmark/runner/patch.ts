/**
 * V0.6 §20 补充 — unified diff 应用器。
 *
 * 两遍式：第一遍逐 hunk 校验上下文与删除行全部匹配（先验证后应用），第二遍才写。
 * 任一 hunk 校验失败 → 整个 patch 不落盘（保持补丁原子性语义）。
 */

interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
}

export function applyPatch (source: string, diff: string): string {
    const hunks = parseHunks(diff);
    if (hunks.length === 0) { throw new Error('patch contains no hunks'); }
    const lines = source.split('\n');
    let offset = 0;
    for (const hunk of hunks) {
        const start = hunk.oldStart - 1 + offset;
        // 第一遍：全部 ' ' 与 '-' 行必须与当前内容逐行匹配
        let check = start;
        for (const line of hunk.lines) {
            if (line.startsWith(' ') || line.startsWith('-')) {
                const actual = lines[check];
                if (actual !== line.slice(1)) {
                    throw new Error(`patch context mismatch at line ${check + 1}: expected ${JSON.stringify(line.slice(1))}, got ${JSON.stringify(actual)}`);
                }
                check++;
            }
        }
        // 第二遍：按 hunk 行序重建（' ' 保留、'-' 删除、'+' 插入）
        let cursor = start;
        const rebuilt: string[] = [];
        for (const line of hunk.lines) {
            if (line.startsWith(' ')) { rebuilt.push(lines[cursor++]); } else if (line.startsWith('-')) { cursor++; } else if (line.startsWith('+')) { rebuilt.push(line.slice(1)); }
        }
        const consumed = cursor - start;
        lines.splice(start, consumed, ...rebuilt);
        offset += rebuilt.length - consumed;
    }
    return lines.join('\n');
}

function parseHunks (diff: string): Hunk[] {
    const hunks: Hunk[] = [];
    let current: Hunk | null = null;
    for (const raw of diff.split('\n')) {
        if (raw.startsWith('diff ') || raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('index ')) { continue; }
        const match = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
            current = {
                oldStart: Number(match[1]),
                oldLines: match[2] === undefined ? 1 : Number(match[2]),
                newStart: Number(match[3]),
                newLines: match[4] === undefined ? 1 : Number(match[4]),
                lines: [],
            };
            hunks.push(current);
            continue;
        }
        if (current && (raw.startsWith(' ') || raw.startsWith('-') || raw.startsWith('+'))) {
            current.lines.push(raw);
        }
    }
    return hunks;
}
