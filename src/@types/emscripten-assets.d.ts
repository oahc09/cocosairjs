// Air 侧补充的 ambient 声明：官方 emscripten 资产（spine/box2d/bullet/physx wasm）自带的 .d.ts
// 不随引擎仓库快照分发，其类型只存在于 `external:emscripten/...` 虚拟模块的加载产物中。
// 这里按「运行时资产（P2）+ 常量默认关闭（D2）」的口径做最小声明，使 Code First 构建可过 typecheck；
// 不改变任何运行行为，wasm 变体仍仅在对应 feature/常量开启且资产落位后才可达。
// 资产来源与限制见 docs/notes/v12-physics-asset-sourcing.md。

declare module 'external:emscripten/spine/3.8/spine.wasm.js';
declare module 'external:emscripten/spine/3.8/spine.wasm';
declare module 'external:emscripten/spine/3.8/spine.asm.js';
declare module 'external:emscripten/spine/3.8/spine.js.mem';
declare module 'external:emscripten/spine/4.2/spine.wasm.js';
declare module 'external:emscripten/spine/4.2/spine.wasm';
declare module 'external:emscripten/spine/4.2/spine.asm.js';
declare module 'external:emscripten/spine/4.2/spine.js.mem';

declare namespace SpineWasm {
    type instance = {
        [key: string]: any;
    };
}
