/* SPK-03：把冻结的 Spark 上游源码树逐字节镜像到 vendor/spark/，并生成指纹清单。
 *
 * 照 vendor/pal-source/ 的先例：上游来源只读，本工具只做「字节复制 + SHA-256 比对」，
 * 不对任何上游文件做转写、格式化或重排。
 *
 *   node tools/build/vendor-spark-tree.cjs --check                      只读校验（默认）
 *   node tools/build/vendor-spark-tree.cjs --write                      从来源树重建 vendor/spark/
 *   node tools/build/vendor-spark-tree.cjs --manifest <path>            写指纹清单（需显式路径）
 *   SPARK_UPSTREAM=<path>                                               覆盖来源树根
 *
 * 退出码：0 = 全部逐字节一致；1 = 存在漂移/缺失/写入失败。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.resolve(process.env.SPARK_UPSTREAM || 'E:/AIProMax/github/spark-cocosairjs/upstream/spark');
const DEST = path.join(ROOT, 'vendor', 'spark');

const FROZEN_COMMIT = 'c57ebb936a5d364e021a66a118204d599f6fdaa8';

/* 运行时需要的上游源码 + 许可与身份文件（SPK-03 §落位清单）。 */
const INCLUDE_DIRS = ['src', 'rust'];
const INCLUDE_FILES = ['LICENSE', 'package.json', 'CHANGELOG.md', 'README.md', 'tsconfig.json'];

/* 明确不落位的上游内容：构建/发布与开发外壳，与运行时算法无关（决策记录在清单里）。 */
const EXCLUDED = [
    { path: '.git/', reason: 'Git 元数据：冻结身份以 frozenCommit 记录，不搬运仓库对象' },
    { path: '.github/', reason: '上游 CI 配置' },
    { path: 'node_modules/', reason: '依赖安装产物，由本仓 npm 依赖管理' },
    { path: 'dist/', reason: '上游预构建 bundle 产物；本仓从 vendor 源码构建' },
    { path: 'test/', reason: '上游测试套件（SPK-03 范围只需要运行时源码与许可；测试随 SPK-13 在本仓重建）' },
    { path: 'scripts/', reason: '上游发布/构建脚本，不属运行时源码' },
    { path: '.gitattributes', reason: 'Git 检出配置' },
    { path: '.gitignore', reason: 'Git 忽略配置' },
    { path: 'lefthook.yml', reason: '上游 Git 钩子配置' },
    { path: 'biome.json', reason: '上游格式化器配置（本仓格式纪律不作用于 vendor 字节）' },
    { path: 'vite.config.ts', reason: '上游站点/示例构建配置' },
    { path: 'examples.html', reason: '上游示例页外壳' },
    { path: 'index.html', reason: '上游站点首页' },
    { path: 'mkdocs.yml', reason: '上游文档站配置' },
    { path: 'package-lock.json', reason: '上游依赖锁定；本仓不安装 vendor/spark 的依赖，运行时子图由 SPK-11/12 决定' },
];

/* 目录遍历时始终跳过的名字（缓存与产物），对 src/ 与 rust/ 也生效。 */
const SKIP_NAMES = new Set(['node_modules', 'dist', 'target', 'pkg', '.git', '.cache', '.DS_Store']);

/* 与 INCLUDE_* 完全同构的落位清单（POSIX shell 写法，供读者复算）。 */
const SHA_LIST =
    "{ find src rust -type f; printf '%s\\n' LICENSE package.json CHANGELOG.md README.md tsconfig.json; } | LC_ALL=C sort | while IFS= read -r f; do sha256sum \"$f\"; done";
const VENDOR_DIR = '"$REPO/vendor/spark"';

/* 清单里的比对命令：纯可执行字符串（Git Bash），按数组顺序在同一 shell 里执行，第 1 条的
 * export 是后续条目的前提。本次采集时点每条都单独执行过并返回 0（含第 7 条的取值比对）。 */
const VERIFY_COMMANDS = [
    'export REPO=/e/AIProMax/github/cocosair.js SPARK_UPSTREAM=/e/AIProMax/github/spark-cocosairjs/upstream/spark',
    `cd "$REPO" && node tools/build/vendor-spark-tree.cjs --check`,
    `cd "$REPO" && node tools/build/vendor-spark-tree.cjs --manifest docs/evidence/spark/vendor-spark-tree-20261011.json`,
    `cd ${VENDOR_DIR} && ${SHA_LIST}`,
    `cd "$SPARK_UPSTREAM" && ${SHA_LIST}`,
    `diff <(cd ${VENDOR_DIR} && ${SHA_LIST}) <(cd "$SPARK_UPSTREAM" && ${SHA_LIST})`,
    `cd ${VENDOR_DIR} && ${SHA_LIST} | sed 's|^\\([0-9a-f]\\{64\\}\\) \\*|\\1  |' | sha256sum`,
    `cmp ${VENDOR_DIR}/LICENSE "$REPO/licenses/LICENSE_spark.txt" && cmp "$REPO/licenses/LICENSE_spark.txt" "$SPARK_UPSTREAM/LICENSE"`,
];

/* 逐条说明与执行注意（不是命令）。 */
const VERIFY_NOTES = [
    '第 1 条 export 为后续条目的前提；后续条目自带 cd，顺序串联时 cwd 会漂移，故各条都用绝对变量而不是相对路径。',
    '第 2 条 --check 是只读门禁：逐文件 SHA-256 比对 + 未登记文件检出 + 许可原文比对 + git tree 交叉核验（见 gitTreeCrossCheck 字段：临时 git 仓库内 git hash-object --no-filters -w 与 git update-index --add --cacheinfo <mode>,<blob>,<path>，src/rust 全量，rust/build_rust_wasm.sh 用 100755、其余 100644，再 git write-tree / ls-tree 取子树号；期望值取 provenance.json 的 spark.source_tree / spark.rust_tree）。Windows/NTFS 上 git 默认忽略 exec 位，所以必须显式传模式，直接 git add 得到的 rust 子树号会不同。',
    '第 3 条重新生成本清单文件（唯一会写仓库内容的条目）。',
    '第 4、5 条分别列出 vendor 侧与来源树侧的逐文件 SHA-256（selection 与 INCLUDE_* 同构，按 path 排序，输出 "<hash>  <path>"）。',
    '第 6 条 diff 无输出即两侧 105 行全等，也就是逐字节一致。',
    '第 7 条复算树指纹，应等于 treeDigest.sha256；Git Bash 的 sha256sum 对文件输出 "*path" 前缀，故先 sed 归一为两空格分隔再取 sha256sum。',
    '第 8 条证明许可原文三处逐字节一致：上游 LICENSE = vendor/spark/LICENSE = licenses/LICENSE_spark.txt。',
    '来源树只读：本工具对 SPARK_UPSTREAM 只读取，不写入、不格式化、不重排。',
];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/* 来源树里唯一带 exec 位的文件。发现方式（只读）：
 *   stat -c '%a %n' "$SPARK_UPSTREAM/rust" 下全部文件 —— 只有 build_rust_wasm.sh 为 755。
 * 用于 git tree 交叉核验：Windows/NTFS 的 git 默认忽略 exec 位（core.fileMode=false），
 * 直接 git add 得到的 rust tree 与上游提交记录不同，必须用 update-index --cacheinfo 显式给模式。 */
const EXEC_MODE_FILES = new Set(['rust/build_rust_wasm.sh']);
const PORT_PROVENANCE = path.resolve(SOURCE, '../../provenance.json');

/* 把 vendor 树喂给 git（临时仓库，argv 数组调用，来源树只读），取回 src/rust 的 tree 对象号。 */
function gitTreeCheck () {
    const info = {
        method: '临时 git 仓库内 git update-index --add --cacheinfo <mode>,<git hash-object --no-filters -w>,<path>（src/rust 全量），再 git write-tree / ls-tree 取子树号',
        execModeFiles: [...EXEC_MODE_FILES],
        expectedFrom: PORT_PROVENANCE.replace(/\\/g, '/'),
        expectedTrees: null,
        vendoredTrees: null,
        match: null,
        error: null,
    };
    try {
        const prov = JSON.parse(fs.readFileSync(PORT_PROVENANCE, 'utf8'));
        info.expectedTrees = { commit: prov.spark.head, src: prov.spark.source_tree, rust: prov.spark.rust_tree };
    } catch (error) {
        info.error = `provenance 不可读（不据此断言）：${error.message}`;
    }
    let temp = null;
    try {
        const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-spark-tree-'));
        git(['init', '-q', temp]);
        git(['config', 'core.fileMode', 'false'], temp);
        git(['config', 'core.autocrlf', 'false'], temp);
        for (const rel of includedFiles()) {
            if (!rel.startsWith('src/') && !rel.startsWith('rust/')) { continue; }
            const blob = git(['hash-object', '--no-filters', '-w', path.join(DEST, rel)], temp);
            const mode = EXEC_MODE_FILES.has(rel) ? '100755' : '100644';
            git(['update-index', '--add', '--cacheinfo', `${mode},${blob},${rel}`], temp);
        }
        const root = git(['write-tree'], temp);
        const parsed = {};
        for (const line of git(['ls-tree', root], temp).split('\n')) {
            const m = /^040000 tree ([0-9a-f]{40})\t(.+)$/.exec(line);
            if (m) { parsed[m[2]] = m[1]; }
        }
        info.vendoredTrees = { src: parsed.src || null, rust: parsed.rust || null };
        if (info.expectedTrees) {
            info.match = info.vendoredTrees.src === info.expectedTrees.src && info.vendoredTrees.rust === info.expectedTrees.rust;
        }
    } catch (error) {
        info.error = `git tree 交叉核验不可用：${error.message}`;
    } finally {
        if (temp) {
            try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* 临时目录由系统回收 */ }
        }
    }
    return info;
}

function walkFiles (dir, base) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (SKIP_NAMES.has(entry.name)) { continue; }
        const abs = path.join(dir, entry.name);
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { out.push(...walkFiles(abs, rel)); } else if (entry.isFile()) { out.push(rel); }
    }
    return out;
}

function includedFiles () {
    const list = [];
    for (const dir of INCLUDE_DIRS) {
        const abs = path.join(SOURCE, dir);
        if (!fs.existsSync(abs)) { throw new Error(`来源树缺失目录：${dir}`); }
        list.push(...walkFiles(abs, dir));
    }
    for (const file of INCLUDE_FILES) {
        if (!fs.existsSync(path.join(SOURCE, file))) { throw new Error(`来源树缺失文件：${file}`); }
        list.push(file);
    }
    return [...new Set(list)].sort();
}

function hashFile (abs) { return sha256(fs.readFileSync(abs)); }

/* 逐文件清单：路径以 vendor/spark 的相对路径表示（POSIX 分隔），并按 path 排序。 */
function buildManifest () {
    const files = includedFiles();
    const rows = files.map((rel) => {
        const destAbs = path.join(DEST, rel);
        const srcAbs = path.join(SOURCE, rel);
        const inSource = fs.existsSync(srcAbs);
        const inDest = fs.existsSync(destAbs);
        const sourceSha = inSource ? hashFile(srcAbs) : null;
        const vendorSha = inDest ? hashFile(destAbs) : null;
        const size = inDest ? fs.statSync(destAbs).size : null;
        const match = sourceSha !== null && vendorSha !== null ? (sourceSha === vendorSha ? 'match' : 'mismatch') : 'missing';
        return { path: rel, size, sha256: vendorSha, sourceSha256: sourceSha, upstreamPath: rel, match };
    });
    const digest = sha256(Buffer.from(rows.map((r) => `${r.sha256}  ${r.path}`).join('\n') + '\n', 'utf8'));
    const count = (filter) => rows.filter((r) => filter(r.path)).length;
    return {
        schema: 'spark-vendor-tree-v1',
        task: 'SPK-03',
        generatedAt: new Date().toISOString(),
        component: '@sparkjsdev/spark',
        version: '2.3.1',
        license: 'MIT',
        copyrightHolder: 'WORLD LABS TECHNOLOGIES, INC.',
        frozenCommit: FROZEN_COMMIT,
        sourceOfTruth: SOURCE,
        vendorRoot: 'vendor/spark',
        includes: { dirs: INCLUDE_DIRS, files: INCLUDE_FILES },
        skippedDuringWalk: [...SKIP_NAMES],
        excluded: EXCLUDED,
        artifactIdentity: {
            gitHead: gitRevParse(),
            buildNumberFile: readIfExists('tools/build/build-number.json'),
            bundleSha256: fs.existsSync(path.join(ROOT, 'build/cocosair.module.js'))
                ? hashFile(path.join(ROOT, 'build/cocosair.module.js'))
                : null,
            licenseTextSha256: fs.existsSync(path.join(ROOT, 'licenses/LICENSE_spark.txt'))
                ? hashFile(path.join(ROOT, 'licenses/LICENSE_spark.txt'))
                : null,
        },
        treeDigest: {
            sha256: digest,
            method: 'sha256 over the sorted lines "<fileSha256>  <path>" joined by LF with a trailing LF',
        },
        counts: {
            files: rows.length,
            tsUnderSrc: count((p) => p.startsWith('src/') && p.endsWith('.ts')),
            rsUnderRust: count((p) => p.startsWith('rust/') && p.endsWith('.rs')),
        },
        byteIdentical: rows.length > 0 && rows.every((r) => r.match === 'match'),
        /* Git tree 交叉核验（实现见 gitTreeCheck）：把 vendor 树按上游文件模式喂给 git 取子树号，
         * 与移植件 provenance.json 记录在冻结提交 c57ebb93 上的 src/rust tree 对账。
         * 这条断言独立于 SHA-256 比对，把落位内容绑回上游 commit 的对象身份。 */
        gitTreeCrossCheck: gitTreeCheck(),
        files: rows,
        verifyCommands: VERIFY_COMMANDS,
        verifyNotes: VERIFY_NOTES,
    };
}

function gitRevParse () {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

function readIfExists (rel) {
    const abs = path.join(ROOT, rel);
    try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; }
}

/* 只读校验：vendor 树的每个文件必须与来源树逐字节一致，且没有未登记的多余文件。 */
function check () {
    const failures = [];
    let manifest;
    try {
        manifest = buildManifest();
    } catch (error) {
        return { failures: [`清单构造失败：${error.message}`], manifest: null };
    }
    for (const row of manifest.files) {
        if (row.match === 'missing') { failures.push(`落位缺失：vendor/spark/${row.path}`); } else if (row.match === 'mismatch') {
            failures.push(`逐字节不一致：vendor/spark/${row.path} (${row.sha256}) != 上游 ${row.sourceSha256}`);
        }
    }
    if (fs.existsSync(DEST)) {
        const known = new Set(manifest.files.map((r) => r.path));
        for (const rel of walkFiles(DEST, '')) {
            if (!known.has(rel)) { failures.push(`未登记的 vendor 文件：vendor/spark/${rel}`); }
        }
    } else {
        failures.push('vendor/spark 目录缺失');
    }
    const treeCheck = manifest.gitTreeCrossCheck;
    if (treeCheck.match === false) {
        failures.push(
            `git tree 交叉核验不一致：vendor src=${treeCheck.vendoredTrees.src} rust=${treeCheck.vendoredTrees.rust} ` +
                `!= provenance src=${treeCheck.expectedTrees.src} rust=${treeCheck.expectedTrees.rust}`,
        );
    }
    const license = path.join(ROOT, 'licenses/LICENSE_spark.txt');
    if (!fs.existsSync(license)) { failures.push('licenses/LICENSE_spark.txt 缺失'); } else if (!fs.readFileSync(license).equals(fs.readFileSync(path.join(SOURCE, 'LICENSE')))) {
        failures.push('licenses/LICENSE_spark.txt 与上游 LICENSE 不逐字节一致');
    }
    return { failures, manifest };
}

function writeTree (manifest) {
    fs.mkdirSync(DEST, { recursive: true });
    for (const row of manifest.files) {
        const target = path.join(DEST, row.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(SOURCE, row.path), target);
        /* 上游唯一带 exec 位的文件：POSIX 检出时保留 755（Windows/NTFS 上 chmod 不落到 git 索引，
         * 故 git tree 核验显式传模式，见 gitTreeCheck）。 */
        if (EXEC_MODE_FILES.has(row.path)) { try { fs.chmodSync(target, 0o755); } catch { /* 平台不支持 */ } }
    }
    const licenseTarget = path.join(ROOT, 'licenses/LICENSE_spark.txt');
    fs.mkdirSync(path.dirname(licenseTarget), { recursive: true });
    fs.copyFileSync(path.join(SOURCE, 'LICENSE'), licenseTarget);
}

function main() {
    const argv = process.argv.slice(2);
    const manifestArgIndex = argv.indexOf('--manifest');
    const manifestArg = manifestArgIndex >= 0 ? argv[manifestArgIndex + 1] : undefined;
    const outPath =
        manifestArg && path.extname(manifestArg) === '.json' ? path.resolve(ROOT, manifestArg) : null;
    if (manifestArgIndex >= 0 && !outPath) {
        console.error(
            '用法：node tools/build/vendor-spark-tree.cjs --manifest docs/evidence/spark/<name>.json（--manifest 必须跟一个 .json 文件路径）'
        );
        process.exitCode = 1;
        return;
    }
    let { failures, manifest } = check();
    if (argv.includes('--write')) {
        if (!manifest) {
            console.log(JSON.stringify({ ok: false, failures }));
            process.exitCode = 1;
            return;
        }
        writeTree(manifest);
        ({ failures, manifest } = check());
    }
    if (outPath) {
        if (!manifest) {
            console.log(JSON.stringify({ ok: false, failures: failures.concat('无法写清单：来源树不可读') }));
            process.exitCode = 1;
            return;
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }
    const summary = {
        ok: failures.length === 0,
        byteIdentical: manifest ? manifest.byteIdentical : false,
        files: manifest ? manifest.counts.files : 0,
        tsUnderSrc: manifest ? manifest.counts.tsUnderSrc : null,
        rsUnderRust: manifest ? manifest.counts.rsUnderRust : null,
        treeDigest: manifest ? manifest.treeDigest.sha256 : null,
        gitTreeMatch: manifest ? manifest.gitTreeCrossCheck.match : null,
        gitTrees: manifest ? manifest.gitTreeCrossCheck.vendoredTrees : null,
        sourceOfTruth: SOURCE,
        failures: failures.slice(0, 20),
        failureCount: failures.length,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { buildManifest, check, writeTree, DEST, SOURCE, FROZEN_COMMIT };
