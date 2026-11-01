import { director, Director } from 'cocosair';

/** Actual headless director updates, not arbitrary sleeps or a direct destruction-queue drain. */
export async function engineCycles(count = 2): Promise<number[]> {
    const frames: number[] = [];
    for (let cycle = 0; cycle < count; cycle++) {
        const events: string[] = [];
        const onUpdate = () => events.push('update');
        const onDraw = () => events.push('draw');
        director.on(Director.EVENT_AFTER_UPDATE, onUpdate);
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
        try {
            const frame = director.getTotalFrames();
            director.tick(0);
            if (events.join(',') !== 'update,draw' || director.getTotalFrames() !== frame + 1) {
                throw new Error(`Expected a complete increasing-frame engine cycle, received ${events}`);
            }
            frames.push(frame);
        } finally {
            director.off(Director.EVENT_AFTER_UPDATE, onUpdate);
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
        }
        // GLTFAsset releases ownership after NODE_DESTROYED in a native Promise microtask.
        await Promise.resolve();
    }
    return frames;
}
