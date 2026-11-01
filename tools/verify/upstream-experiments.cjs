// Read-only U08 source diagnostic; --out writes a NEW report, never a frozen acceptance manifest.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const anchors = [
    ['projection', 'src/cocos/core/math/mat4.ts', 'public static perspective'],
    ['camera projection', 'src/cocos/render-scene/scene/camera.ts', 'Mat4.perspective('],
    ['clear default', 'src/cocos/render-scene/scene/camera.ts', 'private _clearDepth = 1.0'],
    [
        'LESS default',
        'src/cocos/gfx/base/pipeline-sub-state.ts',
        'public depthFunc: ComparisonFunc = ComparisonFunc.LESS',
    ],
    ['clip default', 'src/cocos/gfx/base/define.ts', 'clipSpaceMinZ: number = -1'],
    ['WebGPU clip', 'src/cocos/gfx/webgpu/webgpu-device.ts', 'clipSpaceMinZ = 0'],
    [
        'WebGL float depth',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'case Format.DEPTH: return WebGLConstants.DEPTH_COMPONENT32F',
    ],
    [
        'WebGL fixed stencil depth',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'case Format.DEPTH_STENCIL: return WebGLConstants.DEPTH24_STENCIL8',
    ],
    ['WebGPU unspecified depth', 'src/cocos/gfx/webgpu/webgpu-commands.ts', "return 'depth24plus'"],
    ['RenderTexture default', 'src/cocos/asset/assets/render-texture.ts', 'Format.DEPTH_STENCIL'],
    [
        'sampled depth allocation',
        'src/cocos/render-scene/core/render-window.ts',
        'TextureUsageBit.DEPTH_STENCIL_ATTACHMENT | TextureUsageBit.SAMPLED',
    ],
    [
        'shadow sampled color',
        'src/cocos/rendering/shadow/shadow-flow.ts',
        'supportsR32FloatTexture(device) ? Format.R32F : Format.RGBA8',
    ],
    [
        'shadow reconstruction',
        'vendor/builtin-source/editor/assets/chunks/builtin/functionalities/shadow-map.chunk',
        'GetViewSpaceDepthFromNDCDepth_Orthgraphic',
    ],
    ['water reconstruction', 'examples/water-multipass/shaders/water.frag.glsl', 'depth * 2.0 - 1.0'],
    ['runtime legacy pipeline', 'src/air/bootstrap.ts', '默认走 legacy 渲染管线'],
    [
        'transparent queue',
        'src/cocos/rendering/forward/forward-stage.ts',
        'sortMode: RenderQueueSortMode.BACK_TO_FRONT',
    ],
    [
        'transparent membership',
        'src/cocos/rendering/render-queue.ts',
        'const isTransparent = pass.blendState.targets[0].blend',
    ],
    ['transparent order', 'src/cocos/rendering/render-queue.ts', '(b.depth - a.depth)'],
    ['native target admission', 'src/air/rendering/render-target.ts', 'device.gfxAPI !== API.WEBGL2'],
    ['native depth binding', 'src/air/rendering/render-target.ts', 'public bindDepth('],
];
function walk(relative) {
    return fs
        .readdirSync(path.join(root, relative), { withFileTypes: true })
        .flatMap((entry) => (entry.isDirectory() ? walk(`${relative}/${entry.name}`) : [`${relative}/${entry.name}`]));
}
function sourceAudit() {
    const evidence = anchors.map(([label, file, needle]) => {
        const bytes = fs.readFileSync(path.join(root, file)),
            source = bytes.toString();
        const index = source.indexOf(needle);
        return {
            label,
            file,
            sha256: sha256(bytes),
            needle,
            found: index >= 0,
            line: index < 0 ? null : source.slice(0, index).split('\n').length,
        };
    });
    const scope = ['src/cocos/rendering', 'src/air/rendering'];
    const scan = scope.flatMap(walk).filter((file) => file.endsWith('.ts'));
    const hits = [];
    for (const file of scan) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        for (const match of source.matchAll(
            /\bOIT\b|order[ -]?independent|depth[ -]?peeling|weighted[ -]?blended|revealage/gi,
        ))
            hits.push({ file, line: source.slice(0, match.index).split('\n').length, match: match[0] });
    }
    return {
        status: evidence.every((row) => row.found) ? 'PASS' : 'FAIL',
        scope: 'source conventions only, not GPU correctness',
        evidence,
        transparency: {
            algorithm: 'priority-then-back-to-front-sorted-alpha-blending',
            oitSearchScope: scope,
            filesExamined: scan.length,
            searchHits: hits,
            limitation:
                'Absence of search hits alone does not prove absence. Classification also follows concrete runtime startup, queue selection, sort and draw path.',
        },
    };
}
async function main() {
    if (process.argv.includes('--help')) {
        console.log(
            'node tools/verify/upstream-experiments.cjs --out=<new-report.json>\nRead-only source trace and independent CPU depth diagnostics. Writes new JSON only. Does not build, launch a browser, update manifests, or mark T30–T33 PASS.',
        );
        return;
    }
    const out = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (!out) throw new Error('--out=<new-report.json> is required');
    if (fs.existsSync(out)) throw new Error('OUTPUT_EXISTS: retain prior attempt');
    const model = await import('../../test/fixtures/upstream-depth-experiments/model.mjs');
    const audit = sourceAudit();
    const files = [
        ...new Set([
            ...anchors.map((row) => row[1]),
            ...walk('test/fixtures/upstream-depth-experiments'),
            ...walk('test/fixtures/upstream-experiments-transparency'),
            'tools/verify/upstream-experiments.cjs',
            'tools/verify/upstream-depth-experiments.test.cjs',
            'tools/verify/upstream-experiments-observations.cjs',
            'tools/verify/upstream-experiments-observations.test.cjs',
            'docs/reference/upstream-depth-experiments.md',
            'test/smoke/upstream-experiments-contract.test.ts',
            'ai/ledgers/upstream-update/acceptance-manifest.json',
            'package-lock.json',
        ]),
    ].sort();
    const report = {
        schema: 'air-upstream-experiments-source/1',
        measuredAt: new Date().toISOString(),
        gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        sourceOnly: true,
        canonicalPublication: false,
        sourceAudit: audit,
        inputSha256: Object.fromEntries(files.map((file) => [file, sha256(fs.readFileSync(path.join(root, file)))])),
        depthStorageOnly: model.ranges.flatMap(({ near, far }) =>
            model.formats.flatMap((format) =>
                ['normal', 'reverse'].map((mode) => {
                    const distance = far * 0.9,
                        ideal = model.depthAt(distance, near, far, mode),
                        stored = model.quantizeDepth(ideal, format);
                    return {
                        near,
                        far,
                        distance,
                        format,
                        mode,
                        ideal,
                        stored,
                        reconstructed: model.reconstruct(stored, near, far, mode),
                        gpuEvidence: false,
                    };
                }),
            ),
        ),
        decisions: [
            {
                case: 'T30',
                conclusion: 'BLOCKED',
                rationale:
                    'CPU/source assertions establish current defaults; required unchanged browser output has not executed.',
            },
            {
                case: 'T31',
                conclusion: 'BLOCKED',
                rationale:
                    'Full-convention isolated experiment prepared, not integrated into engine. No GPU/backend/device outcomes yet.',
            },
            {
                case: 'T32',
                conclusion: 'BLOCKED',
                rationale:
                    'Native AirRenderTarget depth sampling experiment remains unrun. The OIT-specific upstream change is NOT_APPLICABLE_WITH_EVIDENCE to the traced default sorted-alpha path; this does not remove the required precision experiment.',
            },
            {
                case: 'T33',
                conclusion: 'BLOCKED',
                rationale:
                    'Independent SH reference is separate; GPU capture, engine CPU traversal/submission, total bake and actual VRAM measurements remain required and unrun.',
            },
        ],
        blocker: {
            status: 'INFRA_BLOCKED',
            attemptedHere: false,
            inheritedEvidence: 'output/upstream-update/browser-preflight/same-exec-launch.log',
            reason: 'Prior authorized browser attempt failed socket creation; supported elevation failed before launch and cloud CDP cannot reach workspace localhost/file. No retries or bypasses in this task.',
            unblock: [
                'Authorized environment with real browser launch and fixture access',
                'M4 current-source main bundle for native fixture, retained source/build/served-byte fingerprints',
                'Actual Chromium/Firefox/WebKit runs separately, exact GPU/driver metadata',
                'Authorized real mobile GPU families and WebGPU implementation/measurements for those dimensions',
                'Measured engine capture traversal/submission/GPU/bake/memory before any performance adoption',
            ],
        },
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ sourceAudit: audit.status, cases: report.decisions, report: out }, null, 2));
    if (audit.status !== 'PASS') process.exitCode = 1;
}
module.exports = { sourceAudit, anchors };
if (require.main === module)
    main().catch((error) => {
        console.error(error.stack);
        process.exitCode = 1;
    });
