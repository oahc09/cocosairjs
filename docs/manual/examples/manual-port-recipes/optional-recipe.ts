import {
    Scene,
    Node,
    Label,
    UITransform,
    Color,
    Layers,
    sys,
    AudioService,
    AssetBank,
    AudioClip,
    JsonAsset,
} from 'cocosair';
import type { AirAssetError } from 'cocosair';

export interface OptionalRecipeContext {
    scene: Scene;
    host: Node;
    /** Absolute directory URL containing manifest.json and tone4s.wav. */
    baseURL: string;
    render(): Promise<void>;
}
export interface NegativeObservation {
    name: string;
    error?: string;
    errorCode?: string;
    measurements: Record<string, unknown>;
    method: string;
}
export interface OptionalServiceRecipe {
    construct(): Promise<Record<string, unknown>>;
    run(): Promise<Record<string, unknown>>;
    pauseRestart(): Promise<Record<string, unknown>>;
    negatives(): Promise<NegativeObservation[]>;
    release(): Promise<Record<string, unknown>>;
}
const failure = (code: string) => Object.assign(new Error(code), { code });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Application recipe; the caller owns the scene, host, frame clock and assets URL. */
export function createOptionalServiceRecipe({
    scene,
    host,
    baseURL,
    render,
}: OptionalRecipeContext): OptionalServiceRecipe {
    const instanceId = `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const counterKey = `pg33-${instanceId}-counter`,
        corruptKey = `pg33-${instanceId}-corrupt`;
    const manifestURL = new URL('manifest.json', baseURL).href,
        clipURL = new URL('tone4s.wav', baseURL).href;
    const audioId = instanceId;
    const bank = new AssetBank(),
        audio = new AudioService(scene, { maxSfxVoices: 3 });
    const originals = new Map<string, string | null>(),
        borrowed = [...host.children];
    let hud: Node | undefined, label: Label | undefined, clip: AudioClip | undefined, manifest: JsonAsset | undefined;
    let audioError: string | null = null,
        bankError: string | null = null,
        storageError: string | null = null;
    let constructed = false,
        ran = false,
        terminal = false;
    let active: Promise<unknown> | undefined, receipt: Promise<Record<string, unknown>> | undefined;
    const storage = (): Storage | undefined => {
        try {
            if (!sys.localStorage) throw new Error('Storage unavailable');
            return sys.localStorage;
        } catch (e) {
            storageError = String(e);
            return undefined;
        }
    };
    const set = (key: string, value: string): boolean => {
        try {
            const store = storage();
            if (!store) return false;
            if (!originals.has(key)) originals.set(key, store.getItem(key));
            store.setItem(key, value);
            return true;
        } catch (e) {
            storageError = String(e);
            return false;
        }
    };
    // Register the exact promise before starting fn synchronously. In particular,
    // run's playBgm remains in the trusted click stack, rather than a later task.
    function phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
        if (terminal) return Promise.reject(failure('RECIPE_DISPOSED'));
        if (active) return Promise.reject(failure('RECIPE_BUSY'));
        if (name !== 'construct' && !constructed) return Promise.reject(failure('RECIPE_NOT_CONSTRUCTED'));
        let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
        const promise = new Promise<T>((yes, no) => {
            resolve = yes;
            reject = no;
        });
        active = promise;
        try {
            fn().then(
                (value) => {
                    if (active === promise) active = undefined;
                    resolve(value);
                },
                (error) => {
                    if (active === promise) active = undefined;
                    reject(error);
                },
            );
        } catch (error) {
            active = undefined;
            reject(error);
        }
        return promise;
    }
    const present = async (text: string) => {
        if (label) label.string = text;
        await render();
    };
    // Sample away from a loop boundary. Keep the raw observations; never turn
    // a negative delta into evidence by taking its absolute value.
    const clockWindow = async (remaining: number) => {
        const duration = clip?.getDuration() ?? 0,
            started = Date.now();
        const samples: { currentTime: number; playing: boolean }[] = [];
        while (Date.now() - started < 2500) {
            const state = audio.bgmState();
            if (!state) break;
            samples.push({ currentTime: state.currentTime, playing: state.playing });
            if (state.playing && state.currentTime > 0.15 && state.currentTime < duration - remaining)
                return { available: true, duration, elapsedMs: Date.now() - started, samples };
            await render();
            await wait(25);
        }
        return { available: false, duration, elapsedMs: Date.now() - started, samples };
    };
    return {
        construct() {
            return phase('construct', async () => {
                if (constructed) throw failure('RECIPE_ALREADY_CONSTRUCTED');
                constructed = true;
                hud = new Node(`hud-${instanceId}`);
                hud.layer = Layers.Enum.UI_2D;
                hud.addComponent(UITransform).setContentSize(360, 60);
                host.addChild(hud);
                label = hud.addComponent(Label);
                label.fontSize = 20;
                label.color = new Color(255, 255, 255, 255);
                await present('Optional services: loading');
                // Optional errors are displayed after the application has started.
                // Audio is loaded before the trusted run button initiates playback.
                await Promise.all([
                    bank.load<JsonAsset>(manifestURL, { ext: 'json' }).then(
                        (value) => {
                            manifest = value;
                        },
                        (e) => {
                            bankError = String(e);
                        },
                    ),
                    audio.load(audioId, clipURL).then(
                        (value) => {
                            clip = value;
                            clip.addRef();
                        },
                        (e) => {
                            audioError = String(e);
                        },
                    ),
                ]);
                await present(
                    audioError || bankError ? 'Optional service unavailable; HUD ready' : 'Optional services ready',
                );
                return {
                    phase: 'construct',
                    instanceId,
                    labelAttached: hud.parent === host,
                    hostStillValid: host.isValid,
                    sceneStillValid: scene.isValid,
                    borrowedValid: borrowed.map((n) => n.isValid),
                    audioLoaded: !!clip,
                    audioError,
                    bankLoaded: !!manifest,
                    bankError,
                    clipDuration: clip?.getDuration() ?? null,
                    clipRefCount: clip?.refCount ?? null,
                    bankSize: bank.size,
                    storageAvailable: !!storage(),
                    storageError,
                };
            });
        },
        run() {
            return phase('run', async () => {
                if (ran) throw failure('RECIPE_ALREADY_RUN');
                ran = true;
                let playError: string | null = null;
                if (clip) {
                    try {
                        audio.playBgm(audioId, true);
                    } catch (e) {
                        playError = String(e);
                    }
                }
                // Native sources initialise asynchronously. Playing is only a
                // readiness condition; the following numeric clock delta is
                // still required to prove playback across wall-clock time.
                const readinessStarted = Date.now();
                // DOM audio's native canplay fallback can take eight seconds;
                // this bounds only the explicitly requested optional phase.
                while (clip && !audio.bgmState()?.playing && Date.now() - readinessStarted < 10000) {
                    await render();
                    await wait(50);
                }
                const readinessMs = Date.now() - readinessStarted;
                const window = await clockWindow(0.4);
                const before = audio.bgmState();
                await wait(300);
                const after = audio.bgmState();
                const counterSet = set(counterKey, '1'),
                    counter = counterSet ? storage()!.getItem(counterKey) : null;
                await present(
                    playError || !clip ? 'Optional audio unavailable; HUD ready' : `Optional counter=${counter}`,
                );
                return {
                    phase: 'run',
                    instanceId,
                    stateBefore: before,
                    stateAfter: after,
                    readinessMs,
                    clockWindow: window,
                    playError,
                    audioError,
                    bankError,
                    counterSet,
                    counter,
                    storageError,
                    bankSize: bank.size,
                    bankRefCount: bank.refCount(manifestURL, 'json'),
                    clipRefCount: clip?.refCount ?? null,
                    manifestRefCount: manifest?.refCount ?? null,
                };
            });
        },
        pauseRestart() {
            return phase('pauseRestart', async () => {
                if (!ran) throw failure('RECIPE_NOT_RUN');
                const window = await clockWindow(0.4);
                const pre = audio.bgmState();
                audio.pauseBgm();
                await wait(200);
                const paused = audio.bgmState();
                audio.resumeBgm();
                await wait(200);
                const resumed = audio.bgmState();
                audio.stopBgm();
                const stopped = audio.bgmState();
                audio.resumeBgm();
                await wait(200);
                const restarted = audio.bgmState();
                await present('Optional pause / restart complete');
                return {
                    phase: 'pauseRestart',
                    instanceId,
                    clockWindow: window,
                    pre,
                    paused,
                    resumed,
                    stopped,
                    restarted,
                };
            });
        },
        negatives() {
            return phase('negatives', async () => {
                const observations: NegativeObservation[] = [];
                const noext = new URL('noext', baseURL).href;
                try {
                    bank.load(noext);
                    observations.push({
                        name: 'missing-extension',
                        method: 'REAL_BROWSER',
                        measurements: { rejected: false },
                    });
                } catch (e) {
                    observations.push({
                        name: 'missing-extension',
                        error: String(e),
                        errorCode: (e as AirAssetError).code,
                        method: 'REAL_BROWSER',
                        measurements: { url: noext, rejected: true, bankSize: bank.size, inFlight: bank.inFlightCount },
                    });
                }
                const missing = new URL('nonexistent-404.png', baseURL).href;
                try {
                    await bank.load(missing, { ext: 'png' });
                    observations.push({ name: 'http-404', method: 'REAL_BROWSER', measurements: { rejected: false } });
                } catch (e) {
                    observations.push({
                        name: 'http-404',
                        error: String(e),
                        errorCode: (e as AirAssetError).code,
                        method: 'REAL_BROWSER',
                        measurements: {
                            url: missing,
                            rejected: true,
                            bankSize: bank.size,
                            inFlight: bank.inFlightCount,
                        },
                    });
                }
                let raw: string | null = null,
                    parseError: string | null = null,
                    recovered: string | null = null;
                if (set(corruptKey, '{broken json')) {
                    try {
                        raw = storage()!.getItem(corruptKey);
                        JSON.parse(raw!);
                    } catch (e) {
                        parseError = String(e);
                        if (set(corruptKey, '0')) recovered = storage()!.getItem(corruptKey);
                    }
                }
                observations.push({
                    name: 'corrupt-storage',
                    method: 'REAL_BROWSER',
                    measurements: { raw, parseError, recovered, unavailableReason: storageError },
                });
                await present('Optional errors handled; HUD ready');
                return observations;
            });
        },
        release() {
            if (receipt) return receipt;
            terminal = true;
            const pending = active;
            receipt = (async () => {
                // Await actual operations, including their final storage writes.
                // Bank cancellation rejects its own subscriptions; it does not
                // claim to cancel the engine's underlying network transfer.
                bank.releaseAll();
                if (pending) await Promise.allSettled([pending]);
                const serviceNodes = scene.children.filter((n) => n.name.endsWith('/' + audioId));
                audio.dispose();
                hud?.destroy();
                await render();
                if (clip) clip.decRef();
                bank.releaseAll();
                await render();
                const restored: { key: string; before: string | null; after: string | null }[] = [];
                try {
                    const store = storage();
                    if (store)
                        for (const [key, value] of originals) {
                            if (value === null) store.removeItem(key);
                            else store.setItem(key, value);
                            restored.push({ key, before: value, after: store.getItem(key) });
                        }
                } catch (e) {
                    storageError = String(e);
                }
                return {
                    phase: 'release',
                    instanceId,
                    labelNodeValid: hud?.isValid ?? false,
                    serviceNodesValid: serviceNodes.map((n) => n.isValid),
                    clipRefCount: clip?.refCount ?? null,
                    clipValid: clip?.isValid ?? null,
                    manifestRefCount: manifest?.refCount ?? null,
                    bankSize: bank.size,
                    inFlight: bank.inFlightCount,
                    hostStillValid: host.isValid,
                    sceneStillValid: scene.isValid,
                    borrowedValid: borrowed.map((n) => n.isValid && n.parent === host),
                    restored,
                    storageError,
                    ourKeyNames: [counterKey, corruptKey],
                    ourKeysCleared: storage()
                        ? [counterKey, corruptKey].every(
                              (key) => storage()!.getItem(key) === (originals.get(key) ?? null),
                          )
                        : null,
                };
            })();
            return receipt;
        },
    };
}
