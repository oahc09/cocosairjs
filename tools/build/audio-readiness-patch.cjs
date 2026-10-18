// Explicit, reproducible adaptation of the frozen PAL. Never edit generated PAL JS.
const { replaceExactly } = require('./startup-binding-patch.cjs');

exports.patchAudioReadiness = (source, file) => {
    const replace = (before, after, count = 1) => {
        source = replaceExactly(source, before, after, `audio readiness ${file}`, count);
    };
    if (file === 'pal/audio/type.ts') {
        replace(
            'export interface AudioLoadOptions {',
            `export interface AudioLoadOptions {
    /** Total network/decode readiness deadline; default 8000ms. */
    timeoutMs?: number;
    signal?: AbortSignal;
    /** media keeps native URL loading; buffered needs CORS and owns a cancellable XHR + Blob URL. */
    transport?: 'media' | 'buffered';`,
        );
    }
    if (file === 'pal/audio/web/player.ts') {
        for (const backend of ['DOM', 'Web']) {
            replace(`AudioPlayer${backend}.load(url)`, `AudioPlayer${backend}.load(url, opts)`);
            replace(`AudioPlayer${backend}.loadNative(url)`, `AudioPlayer${backend}.loadNative(url, opts)`);
            replace(
                `AudioPlayer${backend}.loadOneShotAudio(url, volume)`,
                `AudioPlayer${backend}.loadOneShotAudio(url, volume, opts)`,
            );
        }
    }
    if (!/^pal\/audio\/web\/player-(dom|web)\.ts$/.test(file)) return source;
    const dom = file.endsWith('player-dom.ts');
    const backend = dom ? 'DOM' : 'Web';
    if (!dom) replace("console.error('failed to load Web Audio', err);", 'reject(err);');
    if (dom) {
        replace(
            'export class AudioPlayerDOM implements OperationQueueable {',
            `export class AudioPlayerDOM implements OperationQueueable {
    private _detachedSrc: string | null = null;
    private _detachedTime = 0;
    private _detachedDuration = 0;
    // Windows Media Foundation can execute a queued play after pause/seek returned.
    // Retire that native source, retaining only metadata and a URL for explicit replay.
    private _retirePendingMedia (time: number): void {
        if (!this._domAudio || !this._playRequested || this._state === AudioState.PLAYING
            || systemInfo.browserType !== BrowserType.SAFARI || !/^Win/.test(navigator.platform)) return;
        const audio = this._domAudio;
        this._detachedSrc = audio.src;
        this._detachedDuration = this.duration;
        this._detachedTime = time;
        audio.pause(); audio.removeAttribute('src'); audio.load(); audio.currentTime = time;
    }`,
        );
        replace(
            '        return this._domAudio.duration;',
            `        const duration = this._domAudio.duration;
        return Number.isNaN(duration) && this._detachedDuration > 0 ? this._detachedDuration : duration;`,
        );
        replace(
            '        const generation = this._playGeneration;\n        this._playRequested = true;',
            `        if (this._detachedSrc) {
            const url = this._detachedSrc;
            this._detachedSrc = null;
            audio.src = url; audio.load(); audio.currentTime = this._detachedTime;
        }
        const generation = this._playGeneration;
        this._playRequested = true;`,
        );
        replace(
            '        if (this._domAudio) this._domAudio.currentTime = clamp(time, 0, this.duration);',
            `        if (this._domAudio) {
            const value = clamp(time, 0, this.duration);
            if (this._detachedSrc) this._detachedTime = value;
            this._domAudio.currentTime = value;
        }`,
        );
        replace(
            '    pause (): Promise<void> {\n        this._cancelPlayback();',
            '    pause (): Promise<void> {\n        this._retirePendingMedia(this._domAudio?.currentTime ?? 0);\n        this._cancelPlayback();',
        );
        replace(
            '    stop (): Promise<void> {\n        this._cancelPlayback();',
            '    stop (): Promise<void> {\n        this._retirePendingMedia(0);\n        this._detachedTime = 0;\n        this._cancelPlayback();',
        );
        replace(
            'export class OneShotAudioDOM',
            `const bufferedAudio = new WeakMap<HTMLAudioElement, { url: string; objectUrl: string }>();
function releaseBufferedAudio (audio: HTMLAudioElement): void {
    const entry = bufferedAudio.get(audio);
    if (!entry) return;
    bufferedAudio.delete(audio);
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    finally { URL.revokeObjectURL(entry.objectUrl); }
}
export class OneShotAudioDOM`,
        );
        replace(
            "        audio.removeAttribute('src');",
            "        releaseBufferedAudio(audio);\n        audio.removeAttribute('src');",
        );
        replace(
            "return this._domAudio ? this._domAudio.src : '';",
            "return this._domAudio ? (bufferedAudio.get(this._domAudio)?.url ?? this._detachedSrc ?? this._domAudio.src) : '';",
        );
        replace(
            '        this._onEndCb?.();',
            '        releaseBufferedAudio(this._domAudio);\n        this._onEndCb?.();',
        );
        replace(
            '        this._domAudio.currentTime = 0;\n    }\n}',
            '        this._domAudio.currentTime = 0;\n        releaseBufferedAudio(this._domAudio);\n    }\n}',
        );
        replace(
            'const oneShotAudio = new (OneShotAudioDOM as any)(domAudio, volume);',
            `const oneShotAudio = new (OneShotAudioDOM as any)(domAudio, volume);
                if (opts?.transport === 'buffered') {
                    const retire = (): void => {
                        if (!domAudio.ended) return;
                        domAudio.removeEventListener('ended', retire);
                        // Let the native EOS callback observe ended=true before retiring the element.
                        queueMicrotask(() => releaseBufferedAudio(domAudio));
                    };
                    domAudio.addEventListener('ended', retire);
                }`,
        );
    }
    replace('import { Audio', 'import { AudioLoadOptions, Audio');
    replace('static load (url: string)', 'static load (url: string, opts?: AudioLoadOptions)');
    replace(
        'static loadOneShotAudio (url: string, volume: number)',
        'static loadOneShotAudio (url: string, volume: number, opts?: AudioLoadOptions)',
    );
    replace(`AudioPlayer${backend}.loadNative(url)`, `AudioPlayer${backend}.loadNative(url, opts)`, 2);
    const start = source.indexOf('    static loadNative (');
    const end = source.indexOf('    static loadOneShotAudio (', start);
    if (start < 0 || end <= start) throw Error(`Audio readiness anchors drift: ${file}`);
    const common = `
            const timeoutMs = opts.timeoutMs ?? 8000;
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                reject(new RangeError('Audio timeoutMs must be positive and finite.')); return;
            }
            if (opts.signal?.aborted) { reject(Object.assign(new Error('Audio loading cancelled.'), { name: 'AbortError' })); return; }
            let settled = false;
            const abort = (): void => fail(Object.assign(new Error('Audio loading cancelled.'), { name: 'AbortError' }));
            const timer = setTimeout(() => fail(Object.assign(new Error('Audio loading timed out: ' + url), { name: 'TimeoutError' })), timeoutMs);
`;
    const body = dom
        ? `
            const domAudio = document.createElement('audio');
            let loadedEvent = 'canplay';
            if (systemInfo.os === OS.IOS) loadedEvent = 'loadedmetadata';
            let xhr: XMLHttpRequest | null = null;
            const cleanup = (): void => {
                clearTimeout(timer);
                opts.signal?.removeEventListener('abort', abort);
                domAudio.removeEventListener(loadedEvent, success);
                domAudio.removeEventListener('error', failure);
                if (xhr) xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
            };
            const fail = (error: unknown): void => {
                if (settled) return;
                settled = true; cleanup();
                try { xhr?.abort(); } catch { /* still settle */ }
                releaseBufferedAudio(domAudio);
                try { domAudio.pause(); domAudio.removeAttribute('src'); domAudio.load(); } catch { /* still settle */ }
                reject(error);
            };
            const success = (): void => {
                if (settled) return;
                settled = true; cleanup(); resolve(domAudio);
            };
            const failure = (): void => fail(new Error('load audio failure - ' + url));
            opts.signal?.addEventListener('abort', abort, { once: true });
            domAudio.addEventListener(loadedEvent, success);
            domAudio.addEventListener('error', failure);
            try {
                if (opts.transport !== 'buffered') { domAudio.src = url; return; }
                xhr = new XMLHttpRequest();
                xhr.open('GET', url, true); xhr.responseType = 'blob';
                xhr.onload = (): void => {
                    if (settled) return;
                    if (xhr!.status !== 200 && xhr!.status !== 0) { fail(new Error('load audio failed: ' + url + ', status: ' + xhr!.status)); return; }
                    try {
                        const objectUrl = URL.createObjectURL(xhr!.response as Blob);
                        bufferedAudio.set(domAudio, { url, objectUrl });
                        domAudio.src = objectUrl;
                    } catch (error) { fail(error); }
                };
                xhr.onerror = (): void => fail(new Error('load audio network error: ' + url));
                xhr.onabort = abort;
                xhr.send(null);
            } catch (error) { fail(error); }
`
        : `
            const cached = audioBufferManager.getCache(url);
            const xhr = new XMLHttpRequest();
            const cleanup = (): void => {
                clearTimeout(timer);
                opts.signal?.removeEventListener('abort', abort);
                xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
            };
            const fail = (error: unknown): void => {
                if (settled) return;
                settled = true; cleanup();
                try { xhr.abort(); } catch { /* still settle */ }
                reject(error);
            };
            const success = (buffer: AudioBuffer): void => {
                if (settled) return; // decodeAudioData cannot be cancelled; never cache a late result.
                settled = true; cleanup();
                if (cached) audioBufferManager.retainCache(url);
                else audioBufferManager.addCache(url, buffer);
                resolve(buffer);
            };
            opts.signal?.addEventListener('abort', abort, { once: true });
            if (cached) { success(cached); return; }
            try {
                xhr.open('GET', url, true); xhr.responseType = 'arraybuffer';
                xhr.onload = (): void => {
                    if (settled) return;
                    if (xhr.status !== 200 && xhr.status !== 0) { fail(new Error('load audio failed: ' + url + ', status: ' + xhr.status)); return; }
                    try { audioContextAgent!.decodeAudioData(xhr.response).then(success, fail); } catch (error) { fail(error); }
                };
                xhr.onerror = (): void => fail(new Error('load audio network error: ' + url));
                xhr.ontimeout = (): void => fail(Object.assign(new Error('Audio loading timed out: ' + url), { name: 'TimeoutError' }));
                xhr.onabort = abort;
                xhr.send(null);
            } catch (error) { fail(error); }
`;
    replace(
        source.slice(start, end),
        `    static loadNative (url: string, opts: AudioLoadOptions = {}): Promise<${dom ? 'HTMLAudioElement' : 'AudioBuffer'}> {
        return new Promise((resolve, reject) => {${common}${body}        });
    }
`,
    );
    return source;
};
