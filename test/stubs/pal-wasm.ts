// pal/wasm 测试桩：jsdom 测试不加载 wasm（真实实现含 import.meta，CJS 不可用）
export function ensureWasmModuleReady (): Promise<void> { return Promise.resolve(); }
export function instantiateWasm (_info: unknown, _imports: unknown): unknown { return null; }
export function instantiateWasmURL (_info: unknown, _url: string): unknown { return null; }
export function fetchBuffer (_url: string): Promise<ArrayBuffer | null> { return Promise.resolve(null); }
export function fetchUrl (_url: string): Promise<string | null> { return Promise.resolve(null); }
