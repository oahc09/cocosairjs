// 独立引擎在 Web 闭包中保留的 wasm/asm.js 动态导入（运行时被常量折叠剔除，见 docs/03）。
declare module 'external:emscripten/meshopt/meshopt_decoder.wasm.js';
declare module 'external:emscripten/meshopt/meshopt_decoder.wasm.wasm';
declare module 'external:emscripten/meshopt/meshopt_decoder.asm.js';
