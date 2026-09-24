/**
 * Smoke 30 — V1.2 特性回归门禁（计划书 P3「接线验证」+ G0「16 组全部回归，不再裁剪」）。
 *
 * 三层证据，全部对着**当期产物**与**当期源码图**取证，不用清单/文档做代理：
 *   ① 产物面：build/cocosair.module.js 的 export 表逐组命中，且无 bare import（源码自包含）；
 *   ② 运行库：src/node_modules/ 下 vendored 包与已安装 npm 包逐字节一致（provenance）；
 *   ③ 运行时：物理后端按 D7 注册（2D=box2d / 3D=builtin），并经引擎自己的
 *      createPhysicsWorld() 跑一次真实自由落体。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { join, relative } from 'path';
import { createAirApp } from '../../src/air/bootstrap';
import { Node } from '../../src';
import { Root } from '../../src/cocos/root';
import { AudioSource } from '../../src/cocos/audio';
import { selector as selector2d, createPhysicsWorld } from '../../src/cocos/physics-2d/framework/physics-selector';
import { selector as selector3d } from '../../src/cocos/physics/framework/physics-selector';
// 后端注册挂在 game.EVENT_PRE_SUBSYSTEM_INIT 上，必须先于 createAirApp 进入模块图。
import '../../src/exports/physics-2d-box2d';
import '../../src/exports/physics-builtin';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'build', 'cocosair.module.js');
const bundle = () => {
    expect(existsSync(BUNDLE)).toBe(true);
    return readFileSync(BUNDLE, 'utf8');
};

/** 产物导出表：`export { a as X, b, ... }` 的对外名集合（与 smoke-01 的口径一致，但取全部块）。 */
function exportedNames (code: string): Set<string> {
    const names = new Set<string>();
    for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const entry of m[1].split(',')) {
            const name = entry.trim().split(/\s+as\s+/).pop();
            if (name) { names.add(name.trim()); }
        }
    }
    return names;
}

/**
 * 回归组 → 默认发行产物必须可拿到的代表符号。
 * 命名空间型官方入口（`export { sp }` / `export { postProcess }` / `export { dragonBones }`）按官方命名断言。
 * 不进默认 bundle 的组另有用证：
 *   · C3 pose-graph —— 默认构建下 PROCEDURAL_ANIMATION 常量未开，上游 moduleOverrides 会把它
 *     指向 index-empty（官方语义），故只在常量变体构建里取证；
 *   · G2 cannon / D4 box2d-wasm / G3 ammo+physx —— 同族后端互斥（selector 后注册者胜出），
 *     走 AIR_FEATURES 变体构建取证。
 */
const GROUPS: Record<string, string[]> = {
    'A1 profiler': ['Profiler'],
    'A2 audio': ['AudioSource', 'AudioClip'],
    'A3 video': ['VideoPlayer'],
    'A4 webview': ['WebView'],
    'B1 2d 基座': ['Sprite', 'GeometryRenderer', 'Sorting2D', 'Intersection2D'],
    'B2 particle-2d': ['ParticleSystem2D'],
    'B3 tiled-map': ['TiledMap'],
    'B4 ui': ['Button', 'Label', 'EditBox', 'ScrollView', 'Mask', 'Graphics'],
    'C1 spine（命名空间 sp）': ['sp', 'loadWasmModuleSpine'],
    'C2 dragon-bones（命名空间 dragonBones）': ['dragonBones'],
    'D1-2 physics-2d framework': ['PhysicsSystem2D', 'Collider2D', 'RigidBody2D'],
    'D3 physics-2d box2d（JS 后端）': ['BoxCollider2D', 'PolygonCollider2D', 'DistanceJoint2D', 'PHYSICS_2D_PTM_RATIO'],
    'G1 physics builtin 3D': ['PhysicsSystem', 'RigidBody', 'Collider', 'ERigidBodyType', 'CharacterController'],
    'H post-process（命名空间 postProcess）': ['postProcess', 'BloomStage'],
};

/** vendored 运行库：与已安装 npm 包逐字节比对的文件清单。 */
const VENDORED: Array<{ pkg: string; files: string[] }> = [
    { pkg: '@cocos/box2d', files: ['index.js', 'build/box2d/box2d.umd.js'] },
    { pkg: '@cocos/cannon', files: ['build/cannon.js'] },
    { pkg: '@cocos/dragonbones-js', files: ['out/dragonBones.js'] },
];

/** src/pal 的官方来源：@cocos/engine-pal 的 dist（上游靠 postinstall spread-pal 复制到 <engineRoot>/pal）。 */
const PAL_DIST = join(ROOT, 'node_modules', '@cocos', 'engine-pal', 'dist');

function listFiles (dir: string, base = dir): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { out.push(...listFiles(p, base)); } else { out.push(relative(base, p).replace(/\\/g, '/')); }
    }
    return out.sort();
}

function digest (path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('smoke 30 — V1.2 回归组产物面与运行时', () => {
    beforeAll(() => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
    });

    test('产物自包含：无 bare @cocos/* 与 pal/* import', () => {
        const code = bundle();
        expect([...code.matchAll(/^import[^;\n]*from '@cocos\//gm)].map((m) => m[0])).toEqual([]);
        expect([...code.matchAll(/^import[^;\n]*from 'pal\//gm)].map((m) => m[0])).toEqual([]);
    });

    test.each(Object.keys(GROUPS))('%s 的代表符号在产物导出表中', (group) => {
        const names = exportedNames(bundle());
        for (const expected of GROUPS[group]) {
            expect({ group, expected, present: names.has(expected) }).toEqual({ group, expected, present: true });
        }
    });

    test('A2 audio：产物含真实 Web Audio 实现，pal 运行面按官方语义可用', () => {
        const code = bundle();
        // 空 stub / 被裁掉的实现不会有这些 Web Audio 调用点。
        for (const token of ['decodeAudioData', 'createBufferSource']) {
            expect({ token, inBundle: code.includes(token) }).toEqual({ token, inBundle: true });
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const palAudio = require('pal/audio');
        expect(typeof palAudio.AudioPlayer.load).toBe('function');
        expect(typeof palAudio.AudioPlayer.loadOneShotAudio).toBe('function');
        expect(palAudio.AudioPlayer.maxAudioChannel).toBe(24);
    });

    test('vendored 运行库与已安装 npm 包逐字节一致', () => {
        for (const { pkg, files } of VENDORED) {
            for (const rel of files) {
                const vendored = join(ROOT, 'src', 'node_modules', pkg, rel);
                const installed = join(ROOT, 'node_modules', pkg, rel);
                expect({ pkg, rel, vendoredExists: require('fs').existsSync(vendored) }).toEqual({ pkg, rel, vendoredExists: true });
                expect({ pkg, rel, sameBytes: digest(vendored) === digest(installed) }).toEqual({ pkg, rel, sameBytes: true });
            }
        }
    });

    test('src/pal 全部文件是 @cocos/engine-pal dist 的原始字节（无手写替身）', () => {
        const localDir = join(ROOT, 'src', 'pal');
        const files = listFiles(localDir);
        expect(files.length).toBeGreaterThan(30);
        for (const rel of files) {
            const up = join(PAL_DIST, rel);
            expect({ rel, upstreamExists: existsSync(up) }).toEqual({ rel, upstreamExists: true });
            expect({ rel, sameBytes: digest(join(localDir, rel)) === digest(up) }).toEqual({ rel, sameBytes: true });
        }
    });

    test('V1.2 新增导出在 .d.ts 发布面中可见（类型与产物同源）', () => {
        const dts = join(ROOT, 'build', 'cocosair.module.d.ts');
        if (!require('fs').existsSync(dts)) {
            throw new Error('build/cocosair.module.d.ts 缺失：先跑 npm run build:dts（F-82 产物绑定要求）');
        }
        const code = readFileSync(dts, 'utf8');
        for (const name of ['PhysicsSystem2D', 'RigidBody2D', 'PhysicsSystem', 'postProcess', 'sp', 'AudioSource', 'AudioClip']) {
            expect({ name, declared: new RegExp(`\\b${name}\\b`).test(code) }).toEqual({ name, declared: true });
        }
    });

    describe('运行时（createAirApp 之后）', () => {
        let app: any;

        beforeAll(async () => {
            const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
            app = await createAirApp({ canvas, renderMode: 3 });
            expect(app).toBeTruthy();
        });

        test('A2 audio：AudioSource 组件可挂载（cc 类注册与装饰器元数据在案）', () => {
            const node = new Node('audio-node');
            const comp = node.addComponent(AudioSource);
            expect(comp instanceof AudioSource).toBe(true);
            expect(node.getComponent(AudioSource)).toBe(comp);
        });

        test('D7 默认后端：2D = box2d，3D = builtin', () => {
            expect(selector2d.id).toBe('box2d');
            expect(selector3d.id).toBe('builtin');
        });

        test('box2d 后端真实模拟：引擎 createPhysicsWorld() 自由落体 1 秒位移 ≈ 5 m', () => {
            const world: any = createPhysicsWorld();
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const b2 = require('@cocos/box2d');
            expect(world.constructor.name).toBe('b2PhysicsWorld');
            expect(world.impl).toBeTruthy();
            const bodyDef = new b2.BodyDef();
            bodyDef.type = b2.BodyType.b2_dynamicBody;
            bodyDef.position.Set(0, 100);
            const body = world.impl.CreateBody(bodyDef);
            const shape = new b2.PolygonShape();
            shape.SetAsBox(1, 1);
            const fixtureDef = new b2.FixtureDef();
            fixtureDef.shape = shape;
            fixtureDef.density = 1;
            body.CreateFixture(fixtureDef);
            const before = body.GetPosition().y;
            for (let i = 0; i < 60; i++) {
                world.step(1 / 60, 10, 10);
            }
            const fallen = before - body.GetPosition().y;
            expect(Number.isFinite(fallen)).toBe(true);
            expect(fallen).toBeGreaterThan(4);
            expect(fallen).toBeLessThan(6);
        });
    });

    test('spine 运行时资产缺失走可读降级提示（D2/P2 口径）', () => {
        expect(bundle()).toContain('该构建未部署 spine 运行时资产');
    });

    test('F-1 deprecated.ts：Root.prototype.ui → batcher2D 别名可解析（纯注册副作用，无引擎初始化依赖）', () => {
        // 计划书 F-1 的「按官方引用方式挂接」在 alpha.34 无对应物：cocos/deprecated.ts 在上游零引用者
        // （grep cocos/ exports/ typedoc-index.ts 无 importer，最后触及提交为 2023 年 afd22296b4），
        // 故 Air 亦不为其注册 feature unit——上游 Web 构建同样不含该别名。字节一致性由 F-3 门禁覆盖。
        const cfg = require(join(ROOT, 'src', 'cc.config.json'));
        expect(cfg.features.deprecated).toBeUndefined();

        require('../../src/cocos/deprecated');
        const d = Object.getOwnPropertyDescriptor(Root.prototype, 'ui');
        expect(d && typeof d.get).toBe('function');
        expect(typeof d!.set).toBe('function');
        expect(d!.enumerable).toBe(false);
        const batcher = { tag: 'batcher2D' };
        expect(d!.get!.call({ batcher2D: batcher })).toBe(batcher);
        const holder: any = {};
        d!.set!.call(holder, batcher);
        expect(holder.batcher2D).toBe(batcher);
    });

    test('F-3 簿记完整性：upstream-file-map / extraction-manifest 与磁盘事实一致', () => {
        // 由 tools/v12/verify-file-map.cjs 逐项核验：每行上游可解析、字节一致性与 modified 标记互证、
        // modifiedCount 与实际相符、src/{cocos,exports,pal,node_modules} 全量文件有行、抽取件有 manifest 条目。
        let stdout: string;
        try {
            stdout = execFileSync(process.execPath, [join(ROOT, 'tools', 'v12', 'verify-file-map.cjs')],
                { cwd: ROOT, encoding: 'utf8' });
        } catch (e: any) {
            throw new Error(`npm run verify:file-map 未通过：\n${e.stdout || ''}${e.stderr || ''}`);
        }
        expect(stdout).toContain('[file-map] PASS');
    });

    describe('批次 E / D10：gfx-webgpu 子图的类型核对豁免不外溢', () => {
        const SUBTREES = ['cocos/gfx/webgpu', 'cocos/webgpu'];
        const EXCLUDED_FILES = ['exports/gfx-webgpu.ts'];
        const isExcluded = (rel: string) => EXCLUDED_FILES.includes(rel) || SUBTREES.some((d) => rel.startsWith(`${d}/`));

        test('豁免清单精确锁定：根与 src 两份 tsconfig 的 exclude 只允许已登记的豁免项', () => {
            const strip = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
            expect(strip('tsconfig.json').exclude).toEqual([
                'src/editor',
                'src/cocos/physics/cannon/constraints/cannon-distance-constraint.ts',
                'src/cocos/gfx/webgpu/**',
                'src/cocos/webgpu/**',
                'src/exports/gfx-webgpu.ts',
                'src/cocos/physics/bullet/**',
                'src/cocos/physics/physx/**',
                'src/cocos/physics-2d/box2d-wasm/**',
                'src/exports/physics-ammo.ts',
                'src/exports/physics-physx.ts',
                'src/exports/physics-2d-box2d-wasm.ts',
            ]);
            expect(strip(join('src', 'tsconfig.json')).exclude).toEqual([
                'editor',
                'cocos/gfx/webgpu/**',
                'cocos/webgpu/**',
                'exports/gfx-webgpu.ts',
                'cocos/physics/bullet/**',
                'cocos/physics/physx/**',
                'cocos/physics-2d/box2d-wasm/**',
                'exports/physics-ammo.ts',
                'exports/physics-physx.ts',
                'exports/physics-2d-box2d-wasm.ts',
            ]);
        });

        test('类型面与产物面一致：未接线的 gfx-webgpu 不得出现在发布 d.ts 导出表中', () => {
            // 回归锁：r26 曾把 gfx-webgpu 登记进 cc.config features / 让 dtsBundler 收全量 exports/**，
            // 结果 cc.d.ts 多出 `export class WebGPUDevice` 而 build/cocosair.module.js 的导出表没有它。
            const dts = readFileSync(join(ROOT, 'build', 'cocosair.module.d.ts'), 'utf8');
            expect(exportedNames(dts).has('WebGPUDevice')).toBe(false);
            expect(dts).not.toContain('export class WebGPUDevice');
            expect(exportedNames(bundle()).has('WebGPUDevice')).toBe(false);
        });

        test('豁免不遮蔽活代码：子图之外没有任何文件把该子图引进口', () => {
            const SRC = join(ROOT, 'src');
            const offenders: string[] = [];
            const specRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
            const walk = (dir: string): void => {
                for (const name of readdirSync(dir)) {
                    const abs = join(dir, name);
                    if (statSync(abs).isDirectory()) { walk(abs); continue; }
                    if (!/\.tsx?$/.test(name)) { continue; }
                    const rel = relative(SRC, abs).replace(/\\/g, '/');
                    if (isExcluded(rel)) { continue; }
                    const code = readFileSync(abs, 'utf8');
                    for (const m of code.matchAll(specRe)) {
                        const spec = m[1];
                        if (!spec.startsWith('.')) {
                            if (/webgpu/i.test(spec)) { offenders.push(`${rel} → ${spec}`); }
                            continue;
                        }
                        const target = relative(SRC, join(abs, '..', spec)).replace(/\\/g, '/');
                        if (isExcluded(target) || isExcluded(`${target}.ts`) || isExcluded(`${target}/index.ts`)) {
                            offenders.push(`${rel} → ${spec}`);
                        }
                    }
                }
            };
            walk(SRC);
            expect(offenders).toEqual([]);
        });

        test('26 个 gfx-webgpu 抽取文件仍与官方逐字节一致（豁免只作用于类型核对，不改内容）', () => {
            // 逐字节一致性由 tools/v12/verify-file-map.cjs 全量覆盖；这里只确认登记行仍在，
            // 防止「文件在盘但脱离簿记」的静默漂移。
            const map = JSON.parse(readFileSync(join(ROOT, 'docs', 'upstream-file-map.json'), 'utf8'));
            const registered = new Set<string>(map.mapping.map((r: any) => r.airPath));
            for (const rel of ['cocos/gfx/webgpu/webgpu-device.ts', 'cocos/gfx/webgpu/webgpu-define.ts',
                'cocos/webgpu/instantiated.ts', 'exports/gfx-webgpu.ts']) {
                expect(registered.has(`src/${rel}`)).toBe(true);
            }
        });
    });

    describe('批次 D-4 / G-3（Deviation-05）：三个 wasm 后端子图「已抽取、未接线、暂不类型核对」', () => {
        const SUBTREES = ['cocos/physics/bullet', 'cocos/physics/physx', 'cocos/physics-2d/box2d-wasm'];
        const EXCLUDED_FILES = ['exports/physics-ammo.ts', 'exports/physics-physx.ts', 'exports/physics-2d-box2d-wasm.ts'];
        const isExcluded = (rel: string) => EXCLUDED_FILES.includes(rel) || SUBTREES.some((d) => rel.startsWith(`${d}/`));

        test('82 个抽取文件全部在册且落盘（豁免只作用于类型核对，不改内容）', () => {
            const map = JSON.parse(readFileSync(join(ROOT, 'docs', 'upstream-file-map.json'), 'utf8'));
            const registered = new Set<string>(map.mapping.map((r: any) => r.airPath));
            const manifest = JSON.parse(readFileSync(join(ROOT, 'docs', 'extraction-manifest.json'), 'utf8'));
            const inScope = manifest.entries.filter((e: any) => isExcluded(e.source));
            expect(inScope.length).toBe(82);
            for (const e of inScope) {
                expect(registered.has(e.destination)).toBe(true);
                expect(existsSync(join(ROOT, e.destination))).toBe(true);
            }
            // 计划书 §1.3 / 护栏 5：jsb 平台变体零进入
            expect(inScope.some((e: any) => e.source.endsWith('.jsb.ts'))).toBe(false);
            expect(existsSync(join(ROOT, 'src', 'cocos', 'physics', 'physx', 'instantiate.jsb.ts'))).toBe(false);
        });

        test('豁免不遮蔽活代码：子图之外没有任何文件把该子图引进口', () => {
            const SRC = join(ROOT, 'src');
            const offenders: string[] = [];
            const specRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
            const walk = (dir: string): void => {
                for (const name of readdirSync(dir)) {
                    const abs = join(dir, name);
                    if (statSync(abs).isDirectory()) { walk(abs); continue; }
                    if (!/\.tsx?$/.test(name)) { continue; }
                    const rel = relative(SRC, abs).replace(/\\/g, '/');
                    if (isExcluded(rel)) { continue; }
                    const code = readFileSync(abs, 'utf8');
                    for (const m of code.matchAll(specRe)) {
                        const spec = m[1];
                        if (!spec.startsWith('.')) {
                            if (/physics-(ammo|physx|2d-box2d-wasm)/.test(spec)) { offenders.push(`${rel} → ${spec}`); }
                            continue;
                        }
                        const target = relative(SRC, join(abs, '..', spec)).replace(/\\/g, '/');
                        if (isExcluded(target) || isExcluded(`${target}.ts`) || isExcluded(`${target}/index.ts`)) {
                            offenders.push(`${rel} → ${spec}`);
                        }
                    }
                }
            };
            walk(SRC);
            expect(offenders).toEqual([]);
        });

        test('三个 feature unit 已声明但未进默认发行面（默认产物字节货币不受影响）', () => {
            const config = JSON.parse(readFileSync(join(ROOT, 'src', 'cc.config.json'), 'utf8'));
            for (const f of ['physics-ammo', 'physics-physx', 'physics-2d-box2d-wasm']) {
                expect(Object.keys(config.features)).toContain(f);
            }
            const buildSrc = readFileSync(join(ROOT, 'tools', 'build', 'build.cjs'), 'utf8');
            for (const f of ['physics-ammo', 'physics-physx', 'physics-2d-box2d-wasm']) {
                expect(buildSrc).not.toContain(`'${f}'`);
            }
        });
    });

    describe('V1.2 三浏览器矩阵证据（tools/v12/browser-matrix.cjs）字节货币', () => {        const EVIDENCE = join(ROOT, 'docs', 'evidence', 'v12', 'browser-matrix.json');
        const CONTRACT = join(ROOT, 'tools', 'v12', 'browser-matrix-contract.json');
        const sha16 = (path: string): string => digest(path).slice(0, 16);

        test('证据在案且已完成：completed=true（缺标记即 NOT_RUN）', () => {
            expect(existsSync(EVIDENCE)).toBe(true);
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            expect(json.completed).toBe(true);
            expect(json.runPass).toBe(json.runTotal);
            expect(json.runTotal).toBeGreaterThan(0);
        });

        test('产物绑定：矩阵记录的 bundle 与 d.ts 哈希就是当期构建产物', () => {
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            expect(json.bundle.path).toBe('build/cocosair.module.js');
            expect(json.bundle.sha256_16).toBe(sha16(BUNDLE));
            expect(json.bundle.bytes).toBe(statSync(BUNDLE).size);
        });

        test('契约绑定：矩阵断言自采证后未被放松', () => {
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            expect(json.contractFingerprint).toBe(sha16(CONTRACT));
        });

        test('每张截图仍在盘且与记录逐字节一致；断言全部为真', () => {
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            for (const rec of json.records) {
                const png = join(ROOT, rec.png);
                expect({ engine: rec.engine, example: rec.example, exists: existsSync(png) }).toEqual({ engine: rec.engine, example: rec.example, exists: true });
                expect({ engine: rec.engine, example: rec.example, sha: sha16(png), recorded: rec.pngSha256_16 }).toEqual({ engine: rec.engine, example: rec.example, sha: rec.pngSha256_16, recorded: rec.pngSha256_16 });
                expect(rec.pngBytes).toBe(statSync(png).size);
                expect(rec.result).toBe('PASS');
                expect(rec.failedAssertions).toEqual([]);
                expect(Object.values(rec.checks).every(Boolean)).toBe(true);
                expect(rec.consoleErrors).toEqual([]);
                expect(rec.failedRequests).toEqual([]);
            }
        });

        test('覆盖率：契约里每个示例 × 每个声明引擎都有 PASS 记录（不许静默漏跑）', () => {
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'));
            const covered = new Set<string>(json.records
                .filter((r: any) => r.result === 'PASS')
                .map((r: any) => `${r.example}@${r.engine}`));
            const missing: string[] = [];
            for (const [example, entry] of Object.entries<any>(contract)) {
                for (const engine of entry.engines) {
                    if (!covered.has(`${example}@${engine}`)) { missing.push(`${example}@${engine}`); }
                }
            }
            expect(missing).toEqual([]);
        });

        test('证据目录对账：docs/evidence/v12/ 下每个目录要么被矩阵记录引用，要么在册豁免（不许静默堆积孤儿捕获，也不许留僵尸豁免）', () => {
            const json = JSON.parse(readFileSync(EVIDENCE, 'utf8'));
            const EVIDENCE_DIR = join(ROOT, 'docs', 'evidence', 'v12');
            // 记录里的 png 是 Windows 反斜杠相对路径，统一分隔符后取目录名
            const referenced = new Set<string>(json.records.map((r: any) => r.png.split(/[\\/]/).slice(0, -1).pop()));
            const ACCOUNTED: Record<string, string> = {
                d10: 'LV12-18 gfx-webgpu 的 D10 诊断证据（README + 回退探测腿），不是矩阵捕获；见 docs/evidence/v12/d10/README.md 与 UPSTREAM.md Deviation-04',
                // r46（#13(b) 已批复执行）：原游离目录 LV12-02-profiler-overlay/ 已改名并入
                // profiler-overlay/early-manual-capture-chromium.png（正典目录、被矩阵记录引用），豁免条目随之移除。
                'pilot12-r45i': 'r45i 批次的 V1.1 规格驱动链 firefox/webkit 两腿捕获（待批 #15 选项 (a) 的 11 例可跑面，非正典、[skip-promote] 零回写），不是矩阵捕获；命令 / 三引擎对账 / 边界见 docs/evidence/v12/pilot12-r45i/README.md',
                'v11chain-r45j': 'r45j 批次：V1.1 规格驱动链余下 41 例 × firefox/webkit（与 pilot12-r45i 合并成 52 例全量三引擎对账），非正典、[skip-promote] 零回写，不是矩阵捕获；命令原件 / 结果账 / 4 个红格归因 / F-133·F-134·F-135 在册缺陷见 docs/evidence/v12/v11chain-r45j/README.md，判据与 10 臂负控在 docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.cjs 与同目录 r45j-negctl.cjs',
                'mesh-sphere-r45m': 'r45m 批次：mesh-sphere × {firefox, webkit} 单例重采（r45j 那两格的归因前提——工作树注入的假 validator——已随 r45k 提交消失，由 r45j 自家判据现读自报 STALE），非正典、[skip-promote] 零回写、subset=["mesh-sphere"] 且 partial=true ⇒ 不得读成 52 例整批的一部分；口径 / 命令 / 成本订正 / 六臂负控见 docs/evidence/v12/mesh-sphere-r45m/README.md，判据在 docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-recapture-reconcile.cjs',
            };
            const dirs = readdirSync(EVIDENCE_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
            expect(dirs.filter((d) => !referenced.has(d) && !(d in ACCOUNTED))).toEqual([]);
            expect(Object.keys(ACCOUNTED).filter((d) => !dirs.includes(d))).toEqual([]);
            expect(referenced.size).toBe(Object.keys(JSON.parse(readFileSync(CONTRACT, 'utf8'))).length);
        });
    });
});
