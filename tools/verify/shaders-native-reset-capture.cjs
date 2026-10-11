'use strict';
// Shared native-reset capture helper: installs a ONE-SHOT #reset click listener that fires
// AFTER the page's own reset handler (bubble order), immediately freezing the post-reset
// snapshot (time===0, defaults). The native pacer may advance time afterward — the frozen
// capture is what `n.reset` observes, not a later evaluate round-trip.
//
// Serializable install function (runs IN the page). It:
//  1. Registers on #reset a once-listener (bubble phase — the page's own handler runs first,
//     synchronously setting time=0 and calling set(initial)).
//  2. In that listener, immediately reads __api.snapshot() — this is the REAL post-reset
//     state (time 0, params defaults) BEFORE the native pacer ticks again.
//  3. Stores {snapshot, event: {type, isTrusted, timeStamp}} on window.__resetCapture.
//  4. Self-removes (once) and cleans up on pagehide.
//
// The collector then:
//  1. Installs the listener via page.evaluate(INSTALL_RESET_CAPTURE, apiName).
//  2. Performs the REAL locator('#reset').click() (trusted event, not simulated).
//  3. Reads window.__resetCapture via page.evaluate — the frozen at-click observation.
//  4. Uses it as n.reset (time===0 guaranteed, matching the existing validator contract).

const INSTALL_RESET_CAPTURE = (apiName) => {
    const button = document.querySelector('#reset');
    if (!button) return { ok: false, error: 'NO_RESET_BUTTON' };
    const api = window[apiName];
    if (!api || typeof api.snapshot !== 'function') return { ok: false, error: 'NO_API' };
    if (window.__resetCapture) return { ok: false, error: 'ALREADY_INSTALLED' };
    const handler = (event) => {
        try {
            window.__resetCapture = {
                snapshot: api.snapshot(),
                event: {
                    type: event.type,
                    isTrusted: event.isTrusted,
                    timeStamp: event.timeStamp,
                },
            };
        } catch (error) {
            window.__resetCapture = {
                snapshot: null,
                event: { type: event.type, isTrusted: event.isTrusted },
                error: String(error),
            };
        }
    };
    // Bubble phase: the page's own listener (registered first) runs, then ours captures.
    button.addEventListener('click', handler, { once: true });
    window.addEventListener(
        'pagehide',
        () => {
            button.removeEventListener('click', handler);
            delete window.__resetCapture;
        },
        { once: true },
    );
    return { ok: true };
};

const READ_RESET_CAPTURE = () => window.__resetCapture ?? null;

module.exports = { INSTALL_RESET_CAPTURE, READ_RESET_CAPTURE };
