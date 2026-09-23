/**
 * smoke 32 — LV12-14 / LV12-16：三个 wasm 后端子图的 **asm.js 兜底分支**运行时用例
 *
 * 为什么单独一篇：批次 D-4 / G-3 抽进 Air 的 bullet / physx / box2d-wasm 三族，
 * 其 `instantiated.ts`（physx 是 `physx-adapter.ts`）都带同一条官方结构
 * 「`shouldUseWasmModule()` 分流 → wasm 成对 import 或 asm.js 单文件 import」，
 * 而 **asm.js 兜底一支此前零用例**（`docs/v12-owner-decisions.md` §2.1 列为自办欠账，不待批复）。
 *
 * 与 Deviation-05 的关系：这三族被移出**类型核对**（`UPSTREAM.md` Deviation-05），但运行面可以测；
 * ts-jest 走 `diagnostics:false + isolatedModules`，`external:emscripten/**` 虚拟说明符
 * 用 `jest.mock(..., {virtual:true})` 就地替换 ⇒ 不需要任何第三方 wasm 资产（那才卡 owner #10/#14），
 * 也不需要改 jest.config 的 moduleNameMapper（不影响其余 255 条用例）。
 *
 * 分支开关：`internal:constants` 的 `NATIVE_CODE_BUNDLE_MODE`（测试桩默认 2 = BOTH）。
 * 桩文件经 ts-jest 编译后带 `__esModule` 标记 ⇒ 直接 `require` 拿到的就是引擎侧同一模块实例，
 * 改它的属性即被被测代码在调用时读到（若这条假设不成立，第 1 条用例会立刻红在分支上而不是红在断言上）。
 */
import { sys } from '../../src/cocos/core';
import { game } from '../../src/cocos/game';
import * as bulletInstantiated from '../../src/cocos/physics/bullet/instantiated';
import * as box2dWasmInstantiated from '../../src/cocos/physics-2d/box2d-wasm/instantiated';
import * as physxAdapter from '../../src/cocos/physics/physx/physx-adapter';

const ASMJS = 0;
const WASM = 1;
const BOTH = 2;

// 与 test/stubs/internal-constants.ts 同一模块实例（jest 按解析后路径建注册表）
const constantsStub: any = require('../stubs/internal-constants');

type LogEntry = { spec: string; family: string; kind: 'asm' | 'wasm-js' | 'wasm-url' };

// 名字必须以 mock 前缀：jest.mock 的 factory 只允许引用 mock* / globalThis（hoisting 校验）
function mockGlobal (): any { return globalThis as any; }
function mockLog (): LogEntry[] {
    const g = mockGlobal();
    if (!g.__AIR_EMS_LOG) { g.__AIR_EMS_LOG = []; }
    return g.__AIR_EMS_LOG;
}
function mockPush (entry: LogEntry): void { mockLog().push(entry); }

// ---- 九个虚拟说明符的桩（字面量三处必需：jest.mock 的首参必须是字符串字面量才会被提升） ----
jest.mock('external:emscripten/bullet/bullet.release.asm.js', () => ({
    __esModule: true,
    get default () {
        mockPush({ spec: 'external:emscripten/bullet/bullet.release.asm.js', family: 'bullet', kind: 'asm' });
        return (globalThis as any).__AIR_EMS_ASM_BULLET;
    },
}), { virtual: true });
jest.mock('external:emscripten/box2d/box2d.release.asm.js', () => ({
    __esModule: true,
    get default () {
        mockPush({ spec: 'external:emscripten/box2d/box2d.release.asm.js', family: 'box2d', kind: 'asm' });
        return (globalThis as any).__AIR_EMS_ASM_BOX2D;
    },
}), { virtual: true });
jest.mock('external:emscripten/physx/physx.release.asm.js', () => ({
    __esModule: true,
    get default () {
        mockPush({ spec: 'external:emscripten/physx/physx.release.asm.js', family: 'physx', kind: 'asm' });
        return (globalThis as any).__AIR_EMS_ASM_PHYSX;
    },
}), { virtual: true });


jest.mock('external:emscripten/bullet/bullet.release.wasm.js', () => ({
    __esModule: true,
    default () {
        mockPush({ spec: 'external:emscripten/bullet/bullet.release.wasm.js', family: 'bullet', kind: 'wasm-js' });
        return Promise.resolve((globalThis as any).__AIR_EMS_WASM_BULLET);
    },
}), { virtual: true });
jest.mock('external:emscripten/bullet/bullet.release.wasm.wasm', () => {
    mockPush({ spec: 'external:emscripten/bullet/bullet.release.wasm.wasm', family: 'bullet', kind: 'wasm-url' });
    return { __esModule: true, default: 'virtual://bullet.release.wasm' };
}, { virtual: true });

jest.mock('external:emscripten/box2d/box2d.release.wasm.js', () => ({
    __esModule: true,
    default () {
        mockPush({ spec: 'external:emscripten/box2d/box2d.release.wasm.js', family: 'box2d', kind: 'wasm-js' });
        return Promise.resolve((globalThis as any).__AIR_EMS_WASM_BOX2D);
    },
}), { virtual: true });
jest.mock('external:emscripten/box2d/box2d.release.wasm.wasm', () => {
    mockPush({ spec: 'external:emscripten/box2d/box2d.release.wasm.wasm', family: 'box2d', kind: 'wasm-url' });
    return { __esModule: true, default: 'virtual://box2d.release.wasm' };
}, { virtual: true });

jest.mock('external:emscripten/physx/physx.release.wasm.js', () => ({
    __esModule: true,
    default () {
        mockPush({ spec: 'external:emscripten/physx/physx.release.wasm.js', family: 'physx', kind: 'wasm-js' });
        return Promise.resolve((globalThis as any).__AIR_EMS_WASM_PHYSX);
    },
}), { virtual: true });
jest.mock('external:emscripten/physx/physx.release.wasm.wasm', () => {
    mockPush({ spec: 'external:emscripten/physx/physx.release.wasm.wasm', family: 'physx', kind: 'wasm-url' });
    return { __esModule: true, default: 'virtual://physx.release.wasm' };
}, { virtual: true });

const PHYSX_INSTANCE = { PxMaterialVector: class { }, __lib: 'physx' };

function specsOf (family: string, kind?: LogEntry['kind']): string[] {
    return mockLog().filter((e) => e.family === family && (!kind || e.kind === kind)).map((e) => e.spec);
}

let originalMode: number;
let originalHasFeature: any;
let globalsSnapshot: any;

beforeEach(() => {
    mockGlobal().__AIR_EMS_LOG = [];
    originalMode = constantsStub.NATIVE_CODE_BUNDLE_MODE;
    originalHasFeature = (sys as any).hasFeature;
    const g = mockGlobal();
    globalsSnapshot = { Bullet: g.Bullet, PhysX: g.PhysX, PHYSX: g.PHYSX };
    g.__AIR_EMS_ASM_BULLET = () => Promise.resolve({ __lib: 'bullet-asm' });
    g.__AIR_EMS_ASM_BOX2D = () => Promise.resolve({ __lib: 'box2d-asm' });
    g.__AIR_EMS_ASM_PHYSX = () => Promise.resolve({ ...PHYSX_INSTANCE, __lib: 'physx-asm' });
    g.__AIR_EMS_WASM_BULLET = { __lib: 'bullet-wasm' };
    g.__AIR_EMS_WASM_BOX2D = { __lib: 'box2d-wasm' };
    g.__AIR_EMS_WASM_PHYSX = { ...PHYSX_INSTANCE, __lib: 'physx-wasm' };
});

afterEach(() => {
    constantsStub.NATIVE_CODE_BUNDLE_MODE = originalMode;
    (sys as any).hasFeature = originalHasFeature;
    const g = mockGlobal();
    g.Bullet = globalsSnapshot.Bullet;
    g.PhysX = globalsSnapshot.PhysX;
    g.PHYSX = globalsSnapshot.PHYSX;
});

function setWasmCapability (ok: boolean): void {
    // 上游分流读的是 sys.hasFeature(sys.Feature.WASM)：在实例上遮蔽即可控（BOTH 模式才用到）
    (sys as any).hasFeature = () => ok;
}

describe('smoke 32 — LV12-14/16：三族 wasm 后端的 asm.js 兜底分支', () => {
    test('ASMJS 模式恒走 asm.js：三族只请求 asm 单文件、不碰 wasm 对，且实例真的落地', async () => {
        constantsStub.NATIVE_CODE_BUNDLE_MODE = ASMJS;
        setWasmCapability(true); // 设备明明有 WebAssembly，也必须走兜底

        await bulletInstantiated.waitForAmmoInstantiation();
        await box2dWasmInstantiated.waitForBox2dWasmInstantiation();
        await physxAdapter.initPhysXLibs();

        for (const family of ['bullet', 'box2d', 'physx']) {
            expect(specsOf(family)).toEqual([`external:emscripten/${family}/${family}.release.asm.js`]);
            expect(specsOf(family, 'wasm-js')).toEqual([]);
            expect(specsOf(family, 'wasm-url')).toEqual([]);
        }
        expect((bulletInstantiated.bt as any).__lib).toBe('bullet-asm');
        expect((box2dWasmInstantiated.B2 as any).__lib).toBe('box2d-asm');
        expect((physxAdapter.PX as any).__lib).toBe('physx-asm');
    });

    test('BOTH 模式按能力探测分流：探测不到 WASM 才回落到 asm.js', async () => {
        constantsStub.NATIVE_CODE_BUNDLE_MODE = BOTH;
        setWasmCapability(false);

        await bulletInstantiated.waitForAmmoInstantiation();

        expect(specsOf('bullet', 'asm')).toEqual(['external:emscripten/bullet/bullet.release.asm.js']);
        expect((bulletInstantiated.bt as any).__lib).toBe('bullet-asm');
    });

    test('WASM 模式无条件走 wasm 分支：.wasm.js 与 .wasm.wasm 成对请求，asm 一支不被引用', async () => {
        constantsStub.NATIVE_CODE_BUNDLE_MODE = WASM; // WASM-only：无条件走 wasm，不看探测值

        await box2dWasmInstantiated.waitForBox2dWasmInstantiation();

        expect(specsOf('box2d', 'wasm-js')).toEqual(['external:emscripten/box2d/box2d.release.wasm.js']);
        expect(specsOf('box2d', 'wasm-url')).toEqual(['external:emscripten/box2d/box2d.release.wasm.wasm']);
        expect(specsOf('box2d', 'asm')).toEqual([]);
        expect((box2dWasmInstantiated.B2 as any).__lib).toBe('box2d-wasm');
    });

    test('两支的实例落地方式不对称：bullet 只有 wasm 支写 globalThis.Bullet；physx 的 asm 用 Object.assign、wasm 重绑定 PX', async () => {
        const g = mockGlobal();
        constantsStub.NATIVE_CODE_BUNDLE_MODE = ASMJS;
        await bulletInstantiated.waitForAmmoInstantiation();
        expect(g.Bullet).toBeUndefined(); // 兜底支不发布全局 Bullet —— 依赖全局符号的第三方代码在 asm 姿态下拿不到

        constantsStub.NATIVE_CODE_BUNDLE_MODE = WASM;
        await bulletInstantiated.waitForAmmoInstantiation();
        expect(g.Bullet).toBe(bulletInstantiated.bt);
        expect((g.Bullet as any).__lib).toBe('bullet-wasm');

        constantsStub.NATIVE_CODE_BUNDLE_MODE = ASMJS;
        const pxBefore = physxAdapter.PX;
        await physxAdapter.initPhysXLibs();
        expect(physxAdapter.PX).toBe(pxBefore); // asm：Object.assign 就地扩充原对象
        expect((physxAdapter.PX as any).MeshScale).toBeUndefined();
        expect((physxAdapter.PX as any).EPSILON).toBe(1e-3); // initConfigAndCacheObject 的固定配置面

        constantsStub.NATIVE_CODE_BUNDLE_MODE = WASM;
        const pxBeforeWasm = physxAdapter.PX;
        await physxAdapter.initPhysXLibs();
        expect(physxAdapter.PX).not.toBe(pxBeforeWasm); // wasm：整体重绑定
        expect((physxAdapter.PX as any).__lib).toBe('physx-wasm');
    });

    test('bullet 的 asm 工厂为空时早退：不改写 bt、不抛错（上游 initASM 的 null 分支）', async () => {
        constantsStub.NATIVE_CODE_BUNDLE_MODE = ASMJS;
        const before = bulletInstantiated.bt;
        mockGlobal().__AIR_EMS_ASM_BULLET = null;

        await expect(bulletInstantiated.waitForAmmoInstantiation()).resolves.toBeUndefined();

        expect(specsOf('bullet', 'asm')).toHaveLength(1); // 说明符仍被请求，只是拿不到工厂
        expect(bulletInstantiated.bt).toBe(before);
    });

    test('三族 loader 在未开 LOAD_*_MANUALLY 时常驻挂在 game.onPostInfrastructureInitDelegate 上（接线面）', () => {
        expect(typeof game.onPostInfrastructureInitDelegate.hasListener).toBe('function');
        expect(game.onPostInfrastructureInitDelegate.hasListener(bulletInstantiated.waitForAmmoInstantiation as any)).toBe(true);
        expect(game.onPostInfrastructureInitDelegate.hasListener(box2dWasmInstantiated.waitForBox2dWasmInstantiation as any)).toBe(true);
        expect(game.onPostInfrastructureInitDelegate.hasListener(physxAdapter.initPhysXLibs as any)).toBe(true);
        // 默认发行面不含这三族：见 smoke-30「三个 feature unit 已声明但未进默认发行面」
        expect(constantsStub.LOAD_BULLET_MANUALLY).toBe(false);
        expect(constantsStub.LOAD_BOX2D_MANUALLY).toBe(false);
        expect(constantsStub.LOAD_PHYSX_MANUALLY).toBe(false);
    });
});
