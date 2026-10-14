// AIR startup lifecycle adaptations. Frozen vendor sources remain byte-identical.
// Every anchor has an exact occurrence count so an upstream change cannot silently skip binding.
function replaceExactly(source, before, after, label, count = 1) {
    const actual = source.split(before).length - 1;
    if (actual !== count) throw Error(`PAL startup patch ${label}: expected ${count} anchors, found ${actual}`);
    return source.split(before).join(after);
}
exports.replaceExactly = replaceExactly;
exports.patchStartupBinding = (source, file) => {
    const replace = (before, after, count = 1) => {
        source = replaceExactly(source, before, after, file + ': ' + before.slice(0, 60), count);
    };
    if (file === 'pal/screen-adapter/web/screen-adapter.ts') {
        replace(
            '    constructor () {\n        super();\n        // TODO:',
            `    private _canvasBound = false;
    private _canvasWaiters: Array<() => void> = [];

    public onCanvasBound (callback: () => void): void {
        if (this._canvasBound) callback();
        else this._canvasWaiters.push(callback);
    }

    constructor () {
        super();
    }

    // Explicit startup boundary: no DOM lookup, wrappers or listeners at module import.
    public bindCanvas (): void {
        const canvas = ((globalThis as any).__CC_CANVAS__ || document.getElementById('GameCanvas')) as HTMLCanvasElement;
        if (this._canvasBound) {
            if (canvas !== this._gameCanvas) throw new Error('[AIR_E_CANVAS_CONFLICT] Screen adapter already owns another canvas.');
            return;
        }
        if (!canvas) throw new Error('[AIR_E_CANVAS] Startup requires a canvas.');
        // TODO:`,
        );
        replace(
            '        this._registerEvent();\n    }\n\n    public init',
            `        this._registerEvent();
        this._canvasBound = true;
        const waiters = this._canvasWaiters.splice(0);
        for (const callback of waiters) callback();
    }

    public init`,
        );
        replace(
            '        this._cbToUpdateFrameBuffer = cbToRebuildFrameBuffer;',
            '        this.bindCanvas();\n        this._cbToUpdateFrameBuffer = cbToRebuildFrameBuffer;',
        );
    }
    if (/pal\/input\/web\/(keyboard|mouse|touch)-input\.ts$/.test(file)) {
        if (file.endsWith('/keyboard-input.ts')) {
            replace(
                "import { KeyboardCallback } from 'pal/input';",
                "import { KeyboardCallback } from 'pal/input';\nimport { screenAdapter } from 'pal/screen-adapter';",
            );
        }
        replace(
            '    constructor () {',
            `    constructor () {
        (screenAdapter as any).onCanvasBound(() => this._bindCanvas());
    }

    private _bindCanvas (): void {`,
        );
    }
    return source;
};
