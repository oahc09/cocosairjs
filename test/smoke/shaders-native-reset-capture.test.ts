// Native-reset capture helper tests: the INSTALL function runs against a fake DOM/Page,
// verifying: (1) handler order — page's own handler (time=0) runs first, capture sees time 0;
// (2) native pacer advancing time AFTER the click doesn't affect the frozen capture;
// (3) untrusted events are recorded as-is (not fabricated as trusted);
// (4) missing button/API/already-installed are structured failures;
// (5) once-listener doesn't re-capture on a second click;
// (6) a snapshot getter that throws does NOT produce a fake PASS.
// Pure Node: NODE_CONTRACT, not browser evidence.
import type {} from 'jest';
const { INSTALL_RESET_CAPTURE, READ_RESET_CAPTURE } = require('../../tools/verify/shaders-native-reset-capture.cjs');

/** Minimal fake DOM: window + document.querySelector + addEventListener/removeEventListener. */
function fakePage(apiOverrides: Record<string, unknown> = {}) {
    const listeners: Record<string, Array<(e: any) => void>> = {};
    const windowListeners: Record<string, Array<(e: any) => void>> = {};
    const button = {
        addEventListener: (type: string, fn: (e: any) => void, opts?: unknown) => {
            if (opts && (opts as any).once) {
                const wrapper = (e: any) => {
                    fn(e);
                    const arr = listeners[type] || [];
                    const idx = arr.indexOf(wrapper);
                    if (idx >= 0) arr.splice(idx, 1);
                };
                (listeners[type] ||= []).push(wrapper);
            } else {
                (listeners[type] ||= []).push(fn);
            }
        },
        removeEventListener: (type: string, fn: (e: any) => void) => {
            listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
        },
    };
    const fakeWindow: any = {
        addEventListener: (type: string, fn: (e: any) => void) => {
            (windowListeners[type] ||= []).push(fn);
        },
        removeEventListener: () => {},
        __resetCapture: undefined,
    };
    const api = {
        snapshot: () => ({ time: fakeWindow.__time, params: { ...fakeWindow.__params } }),
        ...apiOverrides,
    };
    fakeWindow.__time = 0.5;
    fakeWindow.__params = { progress: 0.7, scale: 5 };
    const pageResetHandler = () => {
        fakeWindow.__time = 0;
        fakeWindow.__params = { progress: 0.35, scale: 3 };
    };
    return {
        window: fakeWindow,
        apiName: '__testapi',
        button,
        listeners,
        windowListeners,

        click: (isTrusted: boolean) => {
            // Page's own handler (registered first) fires, then the capture listener.
            pageResetHandler();
            for (const fn of listeners.click || []) fn({ type: 'click', isTrusted, timeStamp: 123.45 });
        },
    };
}

// Polyfill the globals INSTALL_RESET_CAPTURE expects.
function withGlobals(page: ReturnType<typeof fakePage>, fn: () => void) {
    // INSTALL_RESET_CAPTURE reads bare 'window'/'document'. In jsdom, these are the global
    // Window/Document. We intercept via a Proxy that returns our fakes for those two keys.
    page.window[page.apiName] = {
        snapshot: () => ({ time: page.window.__time, params: { ...page.window.__params } }),
    };
    const realWindow = globalThis.window;
    const realDocument = globalThis.document;
    const fakeDocument = { querySelector: (sel: string) => (sel === '#reset' ? page.button : null) };
    Object.defineProperty(globalThis, 'window', { value: page.window, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: fakeDocument, writable: true, configurable: true });
    try {
        fn();
    } finally {
        Object.defineProperty(globalThis, 'window', { value: realWindow, writable: true, configurable: true });
        Object.defineProperty(globalThis, 'document', { value: realDocument, writable: true, configurable: true });
    }
}

describe('native-reset capture helper', () => {
    test('install succeeds on a page with a #reset button and API', () => {
        const page = fakePage();
        withGlobals(page, () => {
            const result = INSTALL_RESET_CAPTURE(page.apiName);
            expect(result.ok).toBe(true);
        });
    });

    test('capture freezes time===0 at the trusted click; native pacer advancing after does not affect it', () => {
        const page = fakePage();
        withGlobals(page, () => {
            INSTALL_RESET_CAPTURE(page.apiName);
            // Real trusted click: page handler sets time=0/defaults, capture fires with time 0.
            page.click(true);
            const captured = page.window.__resetCapture;
            expect(captured).toBeTruthy();
            expect(captured.snapshot.time).toBe(0);
            expect(captured.snapshot.params.progress).toBe(0.35);
            expect(captured.event.isTrusted).toBe(true);
            // Native pacer advances AFTER — the frozen capture must still show time 0.
            page.window.__time = 0.0334;
            expect(page.window.__resetCapture.snapshot.time).toBe(0);
        });
    });

    test('untrusted event is recorded as-is (isTrusted false), not fabricated', () => {
        const page = fakePage();
        withGlobals(page, () => {
            INSTALL_RESET_CAPTURE(page.apiName);
            page.click(false);
            expect(page.window.__resetCapture.event.isTrusted).toBe(false);
        });
    });

    test('missing #reset button is a structured failure', () => {
        const origDocument = globalThis.document;
        (globalThis as any).document = { querySelector: () => null };
        try {
            const result = INSTALL_RESET_CAPTURE('__api');
            expect(result.ok).toBe(false);
            expect(result.error).toBe('NO_RESET_BUTTON');
        } finally {
            (globalThis as any).document = origDocument;
        }
    });

    test('missing API is a structured failure', () => {
        const page = fakePage();
        withGlobals(page, () => {
            delete (page.window as any)[page.apiName];
            const result = INSTALL_RESET_CAPTURE(page.apiName);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('NO_API');
        });
    });

    test('double install is rejected after a capture exists', () => {
        const page = fakePage();
        withGlobals(page, () => {
            INSTALL_RESET_CAPTURE(page.apiName);
            // Simulate a prior capture: the ALREADY_INSTALLED check fires on the second call.
            (page.window as any).__resetCapture = { snapshot: {}, event: {} };
            const second = INSTALL_RESET_CAPTURE(page.apiName);
            expect(second.ok).toBe(false);
            expect(second.error).toBe('ALREADY_INSTALLED');
        });
    });

    test('once-listener does not capture on a second click', () => {
        const page = fakePage();
        withGlobals(page, () => {
            INSTALL_RESET_CAPTURE(page.apiName);
            page.click(true);
            const first = page.window.__resetCapture;
            expect(first).toBeTruthy();
            // Second click: the once-listener is gone — no re-capture.
            page.window.__resetCapture = undefined;
            page.click(true);
            expect(page.window.__resetCapture).toBeUndefined();
        });
    });

    test('snapshot getter throwing does NOT produce a fake PASS', () => {
        const page = fakePage();
        withGlobals(page, () => {
            page.window[page.apiName].snapshot = () => {
                throw new Error('getter exploded');
            };
            INSTALL_RESET_CAPTURE(page.apiName);
            page.click(true);
            const captured = page.window.__resetCapture;
            expect(captured.snapshot).toBeNull();
            expect(captured.error).toContain('getter exploded');
        });
    });

    test('READ_RESET_CAPTURE returns null when nothing captured', () => {
        expect(READ_RESET_CAPTURE.call({ __resetCapture: undefined })).toBeNull();
        expect(READ_RESET_CAPTURE.call({})).toBeNull();
    });
});
