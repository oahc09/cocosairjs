/**
 * AIR Deviation（V1.2 批次 C1 / 决策点 D2 + 护栏 P2）：
 * spine 的 wasm/asm 运行时产物（`external:emscripten/spine/{3.8,4.2}/spine.wasm.js|.wasm|.asm.js|.js.mem`）
 * 不随引擎仓库快照分发（`spine-core.js` 在 alpha.34 仅 177 行枚举桩，真实实现在 emscripten 产物内）。
 * Air 的 Code First 构建因此没有可用的 spine 后端。上游的 `spine-instantiate-{3.8,4.2,dynamic}.ts`
 * 全部按官方原文保留在仓库内（未修改），仅由本文件经 cc.config.json 的 moduleOverrides 顶替入口
 * `cocos/spine/lib/spine-instantiate.ts`，使：
 *   1. 构建期不再静态引用缺失的外部产物（否则 rollup ENOENT 直接红）；
 *   2. 运行期资产缺失时输出可读提示而非崩溃（`spine.wasmUtil` 的上游调用点无 null 守卫）。
 * 外部资产按 P2 落位后，删除该 override 即回到官方行为。
 */
import { warn } from '../../core';
import spine from './spine-core';
// 经 moduleOverrides 命中的版本模块取 setSpineVersion：both-versions 构建为 spine-version-dynamic（可写），
// 单版本构建为 spine-version-3.8/4.2（常量，无 setSpineVersion），故按需调用。
import * as spineVersion from './spine-version';

const NOT_DEPLOYED = '[Spine]: 该构建未部署 spine 运行时资产（external:emscripten/spine/... 不在引擎快照内）。'
    + ' 代码闭包与类型面已回归，但 SkeletonData 无法创建；如需 spine 渲染，请按 docs/notes/v12-spine-asset-sourcing.md 落位 wasm/asm 产物。';

function reportNotDeployed (): void {
    warn(NOT_DEPLOYED);
}

/** 上游调用点（skeleton-data / skeleton-cache / assembler/simple）直接访问 spine.wasmUtil.*，无缺失守卫。 */
function installWasmUtilStub (): void {
    const anySpine = spine as any;
    if (anySpine.wasmUtil) {
        return;
    }
    const noopThenNull = (): null => {
        reportNotDeployed();
        return null;
    };
    anySpine.wasmUtil = {
        wasm: { HEAPU8: new Uint8Array(0) },
        spineWasmInit: noopThenNull,
        spineWasmDestroy: noopThenNull,
        freeStoreMemory: noopThenNull,
        createStoreMemory: noopThenNull,
        querySpineSkeletonDataByUUID: noopThenNull,
        createSpineSkeletonDataWithJson: noopThenNull,
        createSpineSkeletonDataWithBinary: noopThenNull,
        registerSpineSkeletonDataWithUUID: noopThenNull,
        destroySpineSkeletonDataWithUUID: noopThenNull,
        destroySpineSkeleton: noopThenNull,
        getCurrentListenerID: noopThenNull,
        getCurrentEventType: noopThenNull,
        getCurrentTrackEntry: noopThenNull,
        getCurrentEvent: noopThenNull,
    };
}

installWasmUtilStub();

export function waitForSpineWasmInstantiation (): Promise<void> {
    const setter = (spineVersion as any).setSpineVersion;
    if (typeof setter === 'function') {
        const v = (globalThis as any)._CC_SPINE_VERSION === '4.2' ? '4.2' : '3.8';
        setter(v);
    }
    reportNotDeployed();
    return Promise.resolve();
}
