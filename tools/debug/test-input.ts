/** Opt-in synthetic DOM input for deterministic tests. No listeners or clock of its own.
 * Events enter the canvas PAL handlers and the original engine/UI dispatch chain.
 * They are untrusted and bypass physical focus admission; they do not attest real devices.
 */
export interface AirTestPoint { readonly id: number; readonly clientX: number; readonly clientY: number }
export interface AirTestInputReceipt {
    readonly method: 'SYNTHETIC'; readonly channel: 'DOM_PAL'; readonly isTrusted: false;
    readonly type: string; readonly changedIds: readonly number[];
}
export interface AirTestInput {
    key(type: 'down' | 'up', code: string): AirTestInputReceipt;
    touch(type: 'start' | 'move' | 'end' | 'cancel', points: readonly AirTestPoint[]): AirTestInputReceipt;
    readonly activeIds: readonly number[];
    readonly disposed: boolean;
    dispose(): void;
}
export interface AirTestInputOptions {
    readonly canvas: HTMLCanvasElement;
    readonly session?: { readonly active: boolean; readonly generation: number };
}
function fail(code: string, message: string): never {
    throw Object.assign(new Error(`${code}: ${message}`), { code });
}
export function createTestInput(options: AirTestInputOptions): AirTestInput {
    const canvas = options.canvas, win = canvas?.ownerDocument?.defaultView;
    if (!win || canvas.tagName !== 'CANVAS') fail('AIR_E_TEST_INPUT_ARGUMENT', 'an explicit live canvas is required');
    const generation = options.session?.generation;
    const contacts = new Map<number, AirTestPoint>(), keys = new Set<string>();
    let disposed = false;
    const admit = () => {
        if (disposed) fail('AIR_E_TEST_INPUT_DISPOSED', 'create a new test input handle');
        if (options.session && (!options.session.active || options.session.generation !== generation))
            fail('AIR_E_TEST_INPUT_INACTIVE', 'the owning session is inactive or has changed generation');
    };
    const receipt = (event: Event, ids: number[] = []): AirTestInputReceipt => Object.freeze({
        method: 'SYNTHETIC', channel: 'DOM_PAL', isTrusted: false, type: event.type, changedIds: Object.freeze(ids),
    });
    const dispatchKey = (type: 'down' | 'up', code: string) => {
        const event = new win.KeyboardEvent(type === 'down' ? 'keydown' : 'keyup', {
            code, repeat: type === 'down' && keys.has(code), bubbles: true, cancelable: true,
        });
        if (type === 'down') keys.add(code); else keys.delete(code);
        canvas.dispatchEvent(event); return receipt(event);
    };
    const dispatchTouch = (type: 'start' | 'move' | 'end' | 'cancel', points: readonly AirTestPoint[]) => {
        const changed = points.map((point) => Object.freeze({ ...point }));
        for (const point of changed) {
            if (type === 'end' || type === 'cancel') contacts.delete(point.id); else contacts.set(point.id, point);
        }
        const touch = (point: AirTestPoint) => Object.freeze({ identifier: point.id, target: canvas,
            clientX: point.clientX, clientY: point.clientY, pageX: point.clientX + win.scrollX,
            pageY: point.clientY + win.scrollY, screenX: point.clientX, screenY: point.clientY,
            radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
        // Event with native DOM dispatch and PAL-consumed touch lists works even when a
        // browser does not expose a constructible Touch. This is explicitly synthetic.
        const event = new win.Event('touch' + type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
            changedTouches: { value: Object.freeze(changed.map(touch)) },
            touches: { value: Object.freeze([...contacts.values()].map(touch)) },
            targetTouches: { value: Object.freeze([...contacts.values()].map(touch)) },
        });
        canvas.dispatchEvent(event); return receipt(event, changed.map((point) => point.id));
    };
    return Object.freeze({
        get disposed() { return disposed; },
        get activeIds() { return Object.freeze([...contacts.keys()]); },
        key(type: 'down' | 'up', code: string) {
            admit();
            if (!['down','up'].includes(type) || typeof code !== 'string' || !/^[A-Za-z][A-Za-z0-9]+$/.test(code))
                fail('AIR_E_TEST_INPUT_ARGUMENT', 'key requires down/up and a physical KeyboardEvent.code');
            return dispatchKey(type, code);
        },
        touch(type: 'start' | 'move' | 'end' | 'cancel', points: readonly AirTestPoint[]) {
            admit();
            if (!['start','move','end','cancel'].includes(type) || !Array.isArray(points) || points.length === 0)
                fail('AIR_E_TEST_INPUT_ARGUMENT', 'touch requires a supported phase and nonempty points');
            const ids = new Set<number>();
            for (const point of points) {
                if (!point || !Number.isSafeInteger(point.id) || point.id < 1 || ids.has(point.id)
                    || !Number.isFinite(point.clientX) || !Number.isFinite(point.clientY))
                    fail('AIR_E_TEST_INPUT_ARGUMENT', 'ids must be unique positive integers (0 belongs to native mouse); coordinates must be finite CSS client pixels');
                if ((type === 'start') === contacts.has(point.id))
                    fail('AIR_E_TEST_INPUT_SEQUENCE', 'start needs a new id; move/end/cancel need an active id');
                ids.add(point.id);
            }
            return dispatchTouch(type, points);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            // Cleanup sends balanced releases even after session retirement. It adds no
            // synthetic presses, and the production session gate still controls admission.
            for (const code of [...keys]) dispatchKey('up', code);
            if (contacts.size) dispatchTouch('cancel', [...contacts.values()]);
        },
    });
}
