// Optional end-generation metadata and native Web Audio teardown; shared operation queue unchanged.
const { replaceExactly } = require('./startup-binding-patch.cjs');

exports.patchAudioPlayback = (source, file) => {
    if (!/^pal\/audio\/web\/player(?:-dom|-web)?\.ts$/.test(file)) return source;
    const replace = (before, after) => {
        source = replaceExactly(source, before, after, `audio playback ${file}`);
    };
    replace('onEnded (cb: () => void)', 'onEnded (cb: (playToken?: number) => void)');
    replace('offEnded (cb?: () => void)', 'offEnded (cb?: (playToken?: number) => void)');
    if (file === 'pal/audio/web/player.ts') {
        replace('export class AudioPlayer {', 'export class AudioPlayer {\n    private _playToken?: number;');
        replace(
            'play (): Promise<void> { return this._player.play(); }',
            `play (playToken?: number): Promise<void> {
        if (playToken !== undefined) this._playToken = playToken;
        if (playToken !== undefined) this._player.setPlayToken(playToken);
        return this._player.play(playToken);
    }`,
        );
        replace(
            'stop (): Promise<void> { return this._player.stop(); }',
            `stop (): Promise<void> {
        this._player._eventTarget.emit('air-stop-requested', this._playToken);
        return this._player.stop();
    }
    onStopRequested (cb: (playToken?: number) => void): void { this._player._eventTarget.on('air-stop-requested', cb); }
    offStopRequested (): void { this._player._eventTarget.off('air-stop-requested'); }`,
        );
        replace(
            '        this._player.destroy();',
            `        this._player._eventTarget.emit('air-stop-requested', this._playToken);
        this.offStopRequested();
        this._player.destroy();`,
        );
        return source;
    }
    const dom = file.endsWith('player-dom.ts');
    const className = dom ? 'AudioPlayerDOM' : 'AudioPlayerWeb';
    replace(
        `export class ${className} implements OperationQueueable {`,
        `export class ${className} implements OperationQueueable {
    private _endToken?: number;
    private _queuedEndToken?: number;
    setPlayToken (token: number): void { this._queuedEndToken = token; }`,
    );
    if (dom) {
        replace(
            'play (): Promise<void> {\n        this._cancelPlayback();',
            `play (playToken?: number): Promise<void> {
        if (playToken !== undefined) this._endToken = playToken;
        this._cancelPlayback();`,
        );
        replace('const result = this.play();', 'const result = this.play(this._queuedEndToken ?? this._endToken);');
        replace(
            'this._eventTarget.emit(AudioEvent.ENDED);',
            `if (this._endToken === undefined) this._eventTarget.emit(AudioEvent.ENDED);
            else this._eventTarget.emit(AudioEvent.ENDED, this._endToken);`,
        );
    } else {
        replace('    private _src: string;', '    private _src: string;\n    private _destroyed = false;');
        replace(
            'play (): Promise<void> {\n        this.offRunning();',
            `play (playToken?: number): Promise<void> {
        if (this._destroyed) return Promise.reject(new Error('Audio player destroyed.'));
        if (playToken !== undefined) this._endToken = playToken;
        this.offRunning();`,
        );
        replace('this.play().then(() => {', 'this.play(this._queuedEndToken ?? this._endToken).then(() => {');
        replace(
            '    private _startSourceNode (): void {',
            '    private _startSourceNode (): void {\n        if (this._destroyed) return;',
        );
        replace(
            '        const checkEnded = (): void => {',
            `        const sourceNode = this._sourceNode;
        const playToken = this._endToken;
        const checkEnded = (): void => {
            if (this._destroyed || this._sourceNode !== sourceNode) return;`,
        );
        replace(
            `                this._eventTarget.emit(AudioEvent.ENDED);
                this._state = AudioState.INIT;`,
            `                this._state = AudioState.INIT;
                if (playToken === undefined) this._eventTarget.emit(AudioEvent.ENDED);
                else this._eventTarget.emit(AudioEvent.ENDED, playToken);`,
        );
        replace(
            '    destroy (): void {\n        window.clearTimeout(this._currentTimer);',
            `    destroy (): void {
        if (this._destroyed) return;
        this._destroyed = true;
        this._stopSourceNode();
        this._gainNode.disconnect();
        this._audioTimer.stop();
        this._state = AudioState.STOPPED;
        window.clearTimeout(this._currentTimer);`,
        );
        const start = source.indexOf('    private _stopSourceNode (): void {');
        const end = source.indexOf('\n    @enqueueOperation\n    pause', start);
        if (start < 0 || end <= start) throw Error('Web Audio stop source anchors drift');
        replace(
            source.slice(start, end),
            `    private _stopSourceNode (): void {
        const node = this._sourceNode;
        this._sourceNode = undefined;
        if (!node) return;
        try { node.stop(); } catch { /* Already ended/not started; still disconnect the graph. */ }
        node.disconnect();
        node.buffer = null;
    }
`,
        );
    }
    return source;
};
