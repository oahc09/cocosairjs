// Intentional AIR adaptation of frozen PAL source. Never edit the vendored baseline.
exports.patchScreenLayout = (source) => {
    const replace = (before, after) => {
        if (!source.includes(before)) throw new Error('PAL layout patch anchor missing: ' + before.slice(0, 70));
        source = source.replace(before, after);
    };
    replace('    private _exactFitScreen = false;', `    private _exactFitScreen = false;
    private _measuredLayout = '';
    private _layoutObserver?: ResizeObserver;
    private _layoutFrame = 0;
    private _layoutStopped = false;
    private _watchDPR?: () => void;
    private _dprCleanup?: () => void;

    public destroyLayoutObserver (): void {
        this._layoutStopped = true;
        this._dprCleanup?.(); this._dprCleanup = undefined;
        this._layoutObserver?.disconnect();
        this._layoutObserver = undefined;
        if (this._layoutFrame) window.cancelAnimationFrame(this._layoutFrame);
        this._layoutFrame = 0;
    }

    private _observeLayout (): void {
        this.destroyLayoutObserver();
        this._layoutStopped = false;
        if (!this._isHeadlessMode) this._watchDPR?.();
        if (this._isHeadlessMode || typeof ResizeObserver === 'undefined') return;
        this._layoutObserver = new ResizeObserver(() => {
            if (this._layoutStopped || !this.handleResizeEvent || this._layoutFrame) return;
            this._layoutFrame = window.requestAnimationFrame(() => {
                this._layoutFrame = 0;
                if (!this._layoutStopped && this.handleResizeEvent) this._updateFrame();
            });
        });
        if (this._gameFrame) this._layoutObserver.observe(this._gameFrame);
        if (this._gameContainer) this._layoutObserver.observe(this._gameContainer);
    }`);
    replace('        this._isHeadlessMode = options.isHeadlessMode;\n        this._resizeFrame();',
        '        this._isHeadlessMode = options.isHeadlessMode;\n        this._resizeFrame();\n        this._observeLayout();');
    const watchStart = source.indexOf('            const updateDPRChangeListener = (): void => {');
    const watchEnd = source.indexOf('\n\n            const mediaQueryPortrait', watchStart);
    if (watchStart < 0 || watchEnd < 0) throw new Error('PAL DPR watcher anchor missing');
    source = source.slice(0, watchStart) + `            const updateDPRChangeListener = (): void => {
                this._dprCleanup?.();
                // Watch actual browser density; comparing/allocating still uses the effective cap.
                const query = window.matchMedia(\`(resolution: \${window.devicePixelRatio ?? 1}dppx)\`);
                const changed = (): void => {
                    if (this._layoutStopped) return;
                    if (this.handleResizeEvent) this._updateContainer();
                    updateDPRChangeListener();
                };
                if (query.addEventListener) {
                    query.addEventListener('change', changed, { once: true });
                    this._dprCleanup = (): void => query.removeEventListener('change', changed);
                } else if (query.addListener) {
                    query.addListener(changed);
                    this._dprCleanup = (): void => query.removeListener(changed);
                }
            };
            this._watchDPR = updateDPRChangeListener;
            updateDPRChangeListener();` + source.slice(watchEnd);
    const start = source.indexOf('        // Cache Test', source.indexOf('private _updateContainer'));
    if (start < 0) throw new Error('PAL measured layout anchor missing');
    const end = source.indexOf('\n    }', start);
    source = source.slice(0, start) + `        // CSS/parent layout changes need the same native resize chain as inline changes.
        const size = this.windowSize;
        if (size.width <= 0 || size.height <= 0) {
            // Keep the last valid framebuffer while hidden; reveal must notify even at the old size.
            this._measuredLayout = '';
            return;
        }
        const key = [size.width, size.height, this.devicePixelRatio, this.isFrameRotated].join(':');
        if (key !== this._measuredLayout) {
            // Cache before dispatch: view's policy update may re-enter this method.
            this._measuredLayout = key;
            this.emit('window-resize', size.width, size.height);
        }` + source.slice(end);
    return source;
};
