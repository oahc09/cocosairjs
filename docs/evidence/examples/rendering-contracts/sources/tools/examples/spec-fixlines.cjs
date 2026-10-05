/* G1 脚手架 —  scoped 行号回填：只处理 --ids 指定的 examples/<id>/example.json。
 *
 * 与 tools/examples/spec-evidence.cjs 同款定位规则（codeLines 抹注释/import +
 * findSymbolLine 强→弱模式 + Class.method 接收者定位），但绝不触碰其它示例目录
 * （并发会话工作区纪律）。provenance/exclusions 的 line 按 text 子串在可执行行中定位。
 *
 * 执行：node tools/examples/spec-fixlines.cjs --ids=a,b [--check]
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith('--root='));
const EXAMPLES_DIR = rootArg ? path.resolve(REPO, rootArg.slice(7)) : path.join(REPO, 'examples');
const idsArg = args.find((a) => a.startsWith('--ids='));
const checkOnly = args.includes('--check');
if (!idsArg) {
    console.error('usage: --ids=a,b [--check]');
    process.exit(2);
}
const ids = idsArg
    .slice(6)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const SPEC_TOKEN_HINTS = { 'math.Vec3': 'Vec3', 'math.Color': 'Color' };
function evidenceToken(unit) {
    if (SPEC_TOKEN_HINTS[unit]) {
        return SPEC_TOKEN_HINTS[unit];
    }
    const parts = unit.split('.');
    return parts[parts.length - 1];
}

/** 与 spec-evidence.cjs 相同的可执行行提取（抹块注释/行注释/import 成员表）。 */
function codeLines(text) {
    const out = [];
    let inBlock = false;
    let inImportList = false;
    for (const raw of text.split('\n')) {
        let line = raw;
        if (inBlock) {
            const end = line.indexOf('*/');
            if (end === -1) {
                out.push('');
                continue;
            }
            inBlock = false;
            line = line.slice(end + 2);
        }
        let idx = line.indexOf('/*');
        while (idx !== -1) {
            const end = line.indexOf('*/', idx + 2);
            if (end === -1) {
                inBlock = true;
                line = line.slice(0, idx);
                break;
            }
            line = line.slice(0, idx) + line.slice(end + 2);
            idx = line.indexOf('/*');
        }
        const slash = line.indexOf('//');
        if (slash !== -1) {
            line = line.slice(0, slash);
        }
        if (inImportList) {
            if (line.indexOf('}') === -1) {
                out.push('');
                continue;
            }
            inImportList = false;
            line = line.slice(line.indexOf('}') + 1);
        }
        if (/^\s*import\b/.test(line)) {
            if (line.indexOf('{') !== -1 && line.indexOf('}') === -1) {
                inImportList = true;
            } else {
                out.push('');
                continue;
            }
        }
        if (/^\s*(export\b.*from|}\s*from\s*['"])/.test(line)) {
            line = '';
        }
        out.push(line);
    }
    return out;
}

function declaredReceivers(lines, cls) {
    const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anchorRe = new RegExp(`\\b(?:new\\s+${esc}\\b|create${esc}\\s*\\()`);
    const names = [];
    for (const line of lines) {
        const m = anchorRe.exec(line);
        if (!m) {
            continue;
        }
        const lhs = line.slice(0, m.index).replace(/\s+$/, '');
        const eq = lhs.lastIndexOf('=');
        if (eq < 0) {
            continue;
        }
        const idMatch = /([A-Za-z_$][\w$]*)\s*$/.exec(lhs.slice(0, eq).replace(/\s+$/, ''));
        if (idMatch && names.indexOf(idMatch[1]) < 0) {
            names.push(idMatch[1]);
        }
    }
    return names;
}

function findSymbolLine(lines, unit) {
    const token = evidenceToken(unit);
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const memberOf = /^([A-Z][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(unit);
    if (memberOf) {
        const method = memberOf[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const name of declaredReceivers(lines, memberOf[1])) {
            const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.\\s*${method}\\s*[(.]`);
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] && re.test(lines[i])) {
                    return i + 1;
                }
            }
        }
    }
    const patterns = [
        new RegExp(`\\bnew\\s+${esc}\\b`),
        new RegExp(`[(,\\s]${esc}\\s*[,)]`),
        new RegExp(`\\b${esc}\\s*\\.`),
        new RegExp(`\\b${esc}\\s*\\(`),
        new RegExp(`\\b${esc}\\b`),
    ];
    for (const re of patterns) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i] && re.test(lines[i])) {
                return i + 1;
            }
        }
    }
    return null;
}

function findTextLine(lines, text) {
    // 描述性引文（interaction-click 先例：'代码 —— 说明'）按代码前缀定位
    const needle = String(text).split('——')[0].trim();
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] && lines[i].indexOf(needle) !== -1) {
            return i + 1;
        }
    }
    // 退一步：按最长按词切片找（provenance text 允许是行内片段）
    const words = needle.split(/\s+/).filter((w) => w.length > 3);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] && words.length && words.every((w) => lines[i].indexOf(w) !== -1)) {
            return i + 1;
        }
    }
    return null;
}

let failures = 0;
for (const id of ids) {
    const dir = path.join(EXAMPLES_DIR, id);
    const specPath = path.join(dir, 'example.json');
    if (!fs.existsSync(specPath)) {
        console.error(`[${id}] example.json 不存在`);
        failures++;
        continue;
    }
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const srcRel = ['src/main.ts', 'main.ts', 'src/main.js', 'main.js'].find((r) => fs.existsSync(path.join(dir, r)));
    if (!srcRel) {
        console.error(`[${id}] 找不到入口源码`);
        failures++;
        continue;
    }
    const lines = codeLines(fs.readFileSync(path.join(dir, srcRel), 'utf8'));
    let drift = 0;

    for (const ev of (spec.api && spec.api.evidence) || []) {
        if (ev.source !== srcRel) {
            continue;
        } // 只回填本入口（shared 引用留给正典工具）
        const line = findSymbolLine(lines, ev.api);
        if (!line) {
            console.error(`[${id}] evidence 定位失败: ${ev.api}`);
            failures++;
            continue;
        }
        if (ev.sourceLocation !== 'L' + line) {
            ev.sourceLocation = 'L' + line;
            drift++;
        }
    }

    const walkProvenance = (prov) => {
        if (!prov) {
            return;
        }
        const list = Array.isArray(prov) ? prov : [prov];
        for (const p of list) {
            if (!p || p.source !== srcRel || !p.text) {
                continue;
            }
            const line = findTextLine(lines, p.text);
            if (!line) {
                console.error(`[${id}] provenance 定位失败: ${String(p.text).slice(0, 60)}`);
                failures++;
                continue;
            }
            if (p.line !== line) {
                p.line = line;
                drift++;
            }
        }
    };
    const exp = spec.validationExpectations || {};
    for (const nodeExp of Object.values(exp['transform-equals'] || {})) {
        walkProvenance(nodeExp.provenance);
    }
    for (const nodeExp of Object.values(exp['material-property'] || {})) {
        const cases = Array.isArray(nodeExp.slots) ? nodeExp.slots : [nodeExp];
        for (const c of cases) {
            for (const prop of Object.values((c && c.props) || {})) {
                walkProvenance(prop.provenance);
            }
        }
    }
    for (const p of (exp['asset-loaded'] && exp['asset-loaded'].paths) || []) {
        walkProvenance(p.provenance);
    }
    for (const dim of Object.values(spec.expectationExclusions || {})) {
        for (const excl of Object.values(dim)) {
            if (excl && typeof excl.line === 'string' && excl.reason) {
                const m = /（([^）]+)）/.exec(excl.reason);
                const needle = m ? m[1] : null;
                if (needle) {
                    const line = findTextLine(lines, needle.split(';')[0]);
                    if (line && excl.line !== 'L' + line) {
                        excl.line = 'L' + line;
                        drift++;
                    } else if (!line) {
                        console.error(`[${id}] exclusion 定位失败: ${needle.slice(0, 60)}`);
                        failures++;
                    }
                }
            }
        }
    }

    if (checkOnly) {
        console.log(`[${id}] ${drift === 0 ? 'OK 无漂移' : 'DRIFT ' + drift + ' 处'}`);
        if (drift > 0) {
            failures++;
        }
    } else if (drift > 0 || failures === 0) {
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
        console.log(`[${id}] 回填 ${drift} 处 → example.json`);
    }
}
process.exitCode = failures > 0 ? 1 : 0;
