/* V1.1 §12 — API Evidence 行号与 validator 绑定维护工具。
 *
 * 读取每个 examples/<id>/example.json 的 api.evidence[]，在 source 文件中定位
 * 该 API symbol 的**可执行代码**首次使用行，回填/校正 sourceLocation（如 "L32"）；
 * 并按 §12「apiEvidence + PASS = verified」把 evidence.validator 收敛到该示例
 * ready/validation 真正声明、且运行时会执行的 validator（否则 evidence 永不成立）。
 *
 * 执行：
 *   node tools/examples/spec-evidence.cjs            # 回填所有 sourceLocation + validator 绑定
 *   node tools/examples/spec-evidence.cjs --check    # 只校验不写入（漂移时 exit 1）
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO, 'examples');
const INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
const checkOnly = process.argv.includes('--check');

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const SPEC_TOKEN_HINTS = { 'math.Vec3': 'Vec3', 'math.Color': 'Color' };

function evidenceToken(unit) {
    if (SPEC_TOKEN_HINTS[unit]) {
        return SPEC_TOKEN_HINTS[unit];
    }
    const parts = unit.split('.');
    return parts[parts.length - 1];
}

/** 把源码切行并抹掉注释（块注释/行注释）与 import（含多行成员表），只保留可执行代码行内容。 */
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
            // 多行 import 成员表：直到出现 '}' 才结束
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
        if (/^\s*(export\b.*from|}\s*from\s+['"])/.test(line)) {
            line = '';
        }
        out.push(line);
    }
    return out;
}

/** evidence.source 解析：示例目录优先，`shared/…` 回落 examples/shared。 */
function resolveSource(exampleDir, sourceFile) {
    const direct = path.join(exampleDir, sourceFile);
    if (fs.existsSync(direct)) {
        return direct;
    }
    if (sourceFile.startsWith('shared/')) {
        const shared = path.join(EXAMPLES_DIR, sourceFile);
        if (fs.existsSync(shared)) {
            return shared;
        }
    }
    return null;
}

/** 由 `new Class(...)` / `createClass(...)` 赋值推断实例变量名（接收者）。 */
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
    // GLTFLoader's asynchronous factories return GLTFAsset, including when the
    // asset is subsequently passed to a retirement helper by the same name.
    if (cls === 'GLTFAsset') {
        for (const loader of declaredReceivers(lines, 'GLTFLoader')) {
            const receiver = loader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const factory = new RegExp(
                `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+${receiver}\\s*\\.\\s*(?:loadAsync|parseAsync)\\s*\\(`,
            );
            for (const line of lines) {
                const match = factory.exec(line);
                if (match && !names.includes(match[1])) names.push(match[1]);
            }
        }
    }
    return names;
}

function findSymbolLine(exampleDir, sourceFile, unit) {
    const file = resolveSource(exampleDir, sourceFile);
    if (!file) {
        return { error: `source ${sourceFile} not found` };
    }
    const token = evidenceToken(unit);
    const lines = codeLines(fs.readFileSync(file, 'utf8'));
    if (unit === 'Camera.camera' || unit === 'renderer.scene.Camera.pipeline') {
        const re = unit === 'Camera.camera' ? /\bcamera\s*\.\s*camera\b/ : /\bcamera\s*\.\s*camera\s*\.\s*pipeline\b/;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i] && re.test(lines[i])) {
                return { line: i + 1 };
            }
        }
    }
    // 由强到弱：构造 / 作参数被引用 / 静态访问 / 调用 / 裸标识符——全部只在代码行上匹配
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `Class.method`：先按接收者变量名定位，避免同一文件里同名方法（Node.destroy / Mesh.destroy /
    // Material.destroy …）全部塌到首次出现行，使 §12 精确绑定退化成"指到某一处调用"。
    const memberOf = /^([A-Z][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(unit);
    if (memberOf) {
        const method = memberOf[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const receivers = declaredReceivers(lines, memberOf[1]);
        for (const name of receivers) {
            const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.\\s*${method}\\s*[(.]`);
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] && re.test(lines[i])) {
                    return { line: i + 1 };
                }
            }
        }
        if (unit === 'GLTFAsset.destroy' && receivers.length) {
            return { error: `GLTFAsset.destroy not found on a declared asset receiver in ${sourceFile}` };
        }
        // Node.matrix is setter-only in the public declaration. Bind its evidence to the
        // actual assignment, not to an unrelated local variable named `matrix`.
        if (unit === 'Node.matrix') {
            for (const name of declaredReceivers(lines, 'Node')) {
                const receiver = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`\\b${receiver}\\s*\\.\\s*matrix\\s*=`);
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i] && re.test(lines[i])) {
                        return { line: i + 1 };
                    }
                }
            }
        }
        const vec3Component = /^math\.Vec3\.([xyz])$/.exec(unit);
        if (vec3Component) {
            for (const name of declaredReceivers(lines, 'Vec3')) {
                const receiver = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`\\b${receiver}\\s*\\.\\s*${vec3Component[1]}\\b(?=\\s*[,;.)\\]])`);
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i] && re.test(lines[i])) {
                        return { line: i + 1 };
                    }
                }
            }
        }
        // Constructor API evidence should point at the class's own prototype constructor,
        // even when the example creates components through addComponent rather than `new`.
        if (memberOf[2] === 'constructor') {
            const className = memberOf[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${className}\\s*\\.\\s*prototype\\s*\\.\\s*constructor\\b`);
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] && re.test(lines[i])) {
                    return { line: i + 1 };
                }
            }
        }
        // UIRenderer properties are inherited by Label/Sprite. Accept an executed property
        // use on a derived component instead of falling back to an unrelated parameter name.
        if (memberOf[1] === 'UIRenderer') {
            const re = new RegExp(`\\b[A-Za-z_$][\\w$]*\\s*\\.\\s*${method}\\s*(?:=|\\(|[;,.)\\]])`);
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] && re.test(lines[i])) {
                    return { line: i + 1 };
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
                return { line: i + 1 };
            }
        }
    }
    return { error: `symbol "${token}" (${unit}) not found in executable code of ${sourceFile}` };
}

/** §12：evidence.validator 必须是本示例声明且会真正执行的 validator，且与 API 语义相符。 */
function declaredValidatorSet(spec) {
    const v = spec.validation || {};
    return new Set([
        ...((spec.ready && spec.ready.validators) || []),
        ...(v.functional || []),
        ...(v.interaction || []),
        ...(v.visual || []),
        ...(v.lifecycle || []),
        ...(v.capability || []),
    ]);
}

// 可安全补进规格声明维度的 validator（其余只能改绑）
const DECLARABLE = {
    'node-exists': 'functional',
    'material-property': 'functional',
    'asset-loaded': 'functional',
    'transform-equals': 'functional',
    'animation-playing': 'functional',
    'visible-frame': 'visual',
    'frame-diff': 'visual',
};

function pickValidator(unit, declared) {
    const has = (id) => declared.has(id);
    const prefers = [];
    if (/Material|Mesh|primitives|utils\.create|builtinRes|Effect|Texture|Sprite/i.test(unit)) {
        prefers.push('material-property', 'asset-loaded');
    }
    if (/Loader|load|Asset|GLTF|decode/i.test(unit)) {
        prefers.push('asset-loaded', 'model-loaded');
    }
    if (/Animation|Animator|tween|Tweener|play/i.test(unit)) {
        prefers.push('animation-playing');
    }
    if (/Vec3|Quat|Color|position|scale|rotation|Transform|Node/i.test(unit)) {
        prefers.push('transform-equals', 'node-exists');
    }
    if (/Extension|capability|Decoder/i.test(unit)) {
        prefers.push('capability-status');
    }
    prefers.push('node-exists', 'visible-frame', 'scene-ready', 'no-runtime-error');
    for (const id of prefers) {
        if (has(id)) {
            return id;
        }
    }
    return declared.values().next().value || null;
}

/**
 * §12 闭环：evidence 绑定的 validator 若未被本示例声明，优先"补声明"（把合同做实），
 * 而不是"改绑到已声明的弱 validator"（那等于放弃证据）。补不进来的才改绑。
 */
function reconcileValidator(spec, ev, declared) {
    if (!ev.validator || declared.has(ev.validator)) {
        return null;
    }
    const dim = DECLARABLE[ev.validator];
    if (dim) {
        spec.validation = spec.validation || {};
        spec.validation[dim] = spec.validation[dim] || [];
        if (!spec.validation[dim].includes(ev.validator)) {
            spec.validation[dim].push(ev.validator);
            declared.add(ev.validator);
            return `DECLARE ${ev.api}: 补声明 ${ev.validator}（validation.${dim}）`;
        }
    }
    const next = pickValidator(ev.api, declared);
    if (!next || next === ev.validator) {
        return null;
    }
    const from = ev.validator;
    ev.validator = next;
    return `REBIND ${ev.api}: ${from} → ${next}`;
}

function main() {
    const dirs = fs
        .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'shared' && e.name !== 'node_modules')
        .map((e) => e.name)
        .sort();
    let entries = 0;
    let drifted = 0;
    let errors = 0;
    let rebound = 0;
    for (const dir of dirs) {
        const file = path.join(EXAMPLES_DIR, dir, 'example.json');
        if (!fs.existsSync(file)) {
            continue;
        }
        const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
        const evidence = spec.api && spec.api.evidence;
        if (!Array.isArray(evidence)) {
            continue;
        }
        const declared = declaredValidatorSet(spec);
        let changed = false;
        for (const ev of evidence) {
            if (!ev.api || !ev.source) {
                continue;
            }
            entries++;
            const found = findSymbolLine(path.join(EXAMPLES_DIR, dir), ev.source, ev.api);
            if (found.error) {
                console.log(`[${dir}] ERROR ${found.error}`);
                errors++;
                continue;
            }
            const loc = `L${found.line}`;
            if (ev.sourceLocation !== loc) {
                drifted++;
                if (checkOnly) {
                    console.log(`[${dir}] DRIFT ${ev.api}: claimed ${ev.sourceLocation || '—'} actual ${loc}`);
                } else {
                    ev.sourceLocation = loc;
                    changed = true;
                }
            }
            // §12：evidence 绑定的 validator 必须在本示例声明集合内，否则该 evidence 永不被执行
            const note = reconcileValidator(spec, ev, declared);
            if (note) {
                rebound++;
                console.log(`[${dir}] ${note}`);
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
        }
    }
    const verb = checkOnly ? 'checked' : 'updated';
    console.log(
        `[spec-evidence] ${entries} evidence entries ${verb}: ${drifted} drifted, ${rebound} detached-validator, ${errors} errors`,
    );
    process.exitCode = errors > 0 || (checkOnly && (drifted > 0 || rebound > 0)) ? 1 : 0;
}

module.exports = {
    codeLines,
    findSymbolLine,
    resolveSource,
    declaredValidatorSet,
    pickValidator,
    reconcileValidator,
    evidenceToken,
};

if (require.main === module) {
    main();
}
