export const ANGULAR_SPEED = 0.35;
export const STREAM_COUNT = 256;
export const BACKGROUND_COUNT = 2200;

export class BlackHoleState {
    elapsed = 0;
    cameraDistance = 14;
    targetDistance = 14;
    get diskRotation(): number {
        return this.elapsed * ANGULAR_SPEED;
    }
    get accretionPhase(): number {
        return (this.diskRotation / (Math.PI * 2)) % 1;
    }
    update(seconds: number): void {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        this.elapsed += seconds;
        this.cameraDistance += (this.targetDistance - this.cameraDistance) * (1 - Math.exp(-6 * seconds));
    }
    wheel(scrollY: number): void {
        if (Number.isFinite(scrollY))
            this.targetDistance = Math.max(5, Math.min(28, this.targetDistance * Math.exp(-scrollY * 0.0003)));
    }
    reset(): void {
        this.elapsed = 0;
        this.cameraDistance = this.targetDistance = 14;
    }
}

/** Same analytic trajectory sent to the stream vertex shader, available for inspection. */
export function streamPosition(
    angle: number,
    offset: number,
    elapsed: number,
): { x: number; y: number; phase: number; radius: number } {
    const phase = (((offset + elapsed * 0.09) % 1) + 1) % 1;
    const radius = 7.7 - (7.7 - 1.22) * Math.pow(phase, 1.7);
    const theta = angle + phase * 10 + elapsed * ANGULAR_SPEED * 0.8;
    return { x: radius * Math.cos(theta), y: radius * Math.sin(theta), phase, radius };
}

export function backgroundPositions(): number[] {
    let seed = 50419;
    function random(): number {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    }
    const positions: number[] = [];
    for (let i = 0; i < BACKGROUND_COUNT; i++)
        positions.push((random() - 0.5) * 90, (random() - 0.5) * 52, -8 - random() * 6);
    return positions;
}

export function streamSeeds(): number[] {
    const values: number[] = [];
    for (let i = 0; i < STREAM_COUNT; i++) values.push(((i * 0.61803398875) % 1) * Math.PI * 2, i / STREAM_COUNT, 0);
    return values;
}
