import type { AirApp, AirSessionScope, AirSessionToken } from 'cocosair';

type ClosableApp = AirApp & { close: NonNullable<AirApp['close']> };

/** Example-owned orchestration. The supplied scope must be fresh and exclusively owned. */
export function createAsyncAppLifecycle<Resource>(options: {
    session: AirSessionScope;
    createApp: () => Promise<ClosableApp>;
    load: (app: ClosableApp, signal: AbortSignal) => Promise<Resource>;
    mount: (app: ClosableApp, resource: Resource, token: AirSessionToken) => void;
    releaseResource: (resource: Resource) => void | Promise<void>;
    releaseAudio: () => void | Promise<void>;
    disableInput: () => void;
    removeListeners: () => void;
}) {
    const { session } = options;
    session.activate();
    const token = session.token();
    const controller = new AbortController();
    let resource: Resource | undefined;
    let hasResource = false;
    let removeHealth: (() => void) | undefined;
    let closing: ReturnType<AirSessionScope['dispose']> | undefined;
    let gpuCleanup: Promise<void> | undefined;
    const disable = (): void => {
        controller.abort();
        session.deactivate('closing-or-context-lost');
        options.disableInput();
    };
    // Deliberately not async: callers receive the identical disposal Promise.
    const close = (): ReturnType<AirSessionScope['dispose']> => {
        if (closing) return closing;
        closing = session.dispose();
        disable();
        return closing;
    };
    const appPromise = Promise.resolve().then(options.createApp);
    const ready = appPromise.then(async (app) => {
        if (!token.isCurrent()) return false;
        removeHealth = app.contextHealth.onChange((health) => {
            if (health.state === 'lost') disable();
            if (health.state === 'failed') {
                // The SDK does not rebuild GPU resources on a restored context.
                void close().then(() => app.contextHealth.requestReload());
            }
        });
        resource = await options.load(app, controller.signal);
        hasResource = true;
        if (!token.isCurrent()) return false;
        options.mount(app, resource, token);
        return true;
    });
    // Existing session disposal starts every callback independently.
    session.own(options.releaseAudio, 'recipe-audio');
    session.own(() => {
        gpuCleanup = appPromise
            .catch(() => undefined)
            .then(async (app) => {
                if (!app) return;
                const receipt = await app.close();
                if (receipt.status !== 'released') throw new Error('App cleanup failed; inspect its release receipt.');
            });
        return gpuCleanup;
    }, 'recipe-gpu');
    session.own(async () => {
        await ready.catch(() => undefined);
        // Detach scene consumers before destroying exclusive assets they borrowed.
        await gpuCleanup;
        if (hasResource) {
            hasResource = false;
            await options.releaseResource(resource as Resource);
        }
    }, 'recipe-late-resource');
    session.own(() => {
        removeHealth?.();
        options.removeListeners();
    }, 'recipe-listeners');
    void ready.catch(() => close());
    return { ready, close, signal: controller.signal };
}
