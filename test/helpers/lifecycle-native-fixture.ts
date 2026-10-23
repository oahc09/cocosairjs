/** Unit-only director event fixture. This is not native rendering or GPU settlement evidence. */
export function createLifecycleNativeFixture() {
    const listeners = new Map<string, Set<() => void>>();
    const Director = { EVENT_AFTER_UPDATE: 'after-update', EVENT_AFTER_DRAW: 'after-draw' };
    let frame = 0;
    let scheduled = false;
    let turns = 0;
    const pump = () => {
        scheduled = false;
        // Bound a broken mock rather than starving Jest's timeout with endless microtasks.
        if (++turns > 100) throw new Error('Unit director settlement exceeded 100 frame pairs');
        for (const event of [Director.EVENT_AFTER_UPDATE, Director.EVENT_AFTER_DRAW])
            for (const callback of [...(listeners.get(event) || [])]) callback();
        frame++;
        if ([...listeners.values()].some((set) => set.size)) schedule();
    };
    const schedule = () => {
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(pump);
        }
    };
    return {
        isValid: (ref: any) => ref?.isValid === true,
        Director,
        director: {
            getTotalFrames: () => frame,
            on(event: string, callback: () => void) {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event)!.add(callback);
                schedule();
            },
            off(event: string, callback: () => void) {
                listeners.get(event)?.delete(callback);
            },
        },
    };
}
