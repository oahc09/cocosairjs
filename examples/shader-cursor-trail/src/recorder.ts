/**
 * E08 host polyline recorder — an exact, example-local port of the upstream CursorTrail recipe
 * (shaders/CursorTrail/index.ts @ dbfd42ab, MIT): the pointer-velocity tracker, the anchor/head
 * polyline with Chaikin relax, pen-pressure width, monotone age + front-cull, and the 64×1
 * rgba16float packing with the head duplicate and signed-width link flag. Pure TypeScript, no
 * engine imports — total numeric input rejection, NaN-safe, deterministic under a fixed frame
 * script. `toHalfFloat` is the exact upstream bit-exact converter (dataEncoding.ts @ dbfd42ab).
 */

export const MAX_POINTS = 64;
export const WIDTH_MIN = 0.2;
export const SPEED_FULL = 1.5;
export const BEZIER_SUBDIVISIONS = 3;

/** Exact upstream half-float converter (kit/dataEncoding.ts, MIT). Returns raw half bits. */
export function toHalfFloat(val: number): number {
    const v = Math.max(-65504, Math.min(65504, val));
    const f32 = new Float32Array(1),
        i32 = new Int32Array(f32.buffer);
    f32[0] = v;
    const x = i32[0];
    let bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) {
        bits |= 0x7c00;
        bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
        return bits;
    }
    if (e < 113) {
        m |= 0x0800;
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
}

/** Decode half-float bits back to f64 (for CPU-side inspection only; the GPU keeps them packed). */
export function fromHalfFloat(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1;
    const exp = (bits >> 10) & 0x1f;
    const frac = bits & 0x3ff;
    if (exp === 0) return sign * frac * Math.pow(2, -24);
    if (exp === 31) return frac ? Number.NaN : sign * Number.POSITIVE_INFINITY;
    return sign * (frac / 1024 + 1) * Math.pow(2, exp - 15);
}

export interface TrailPoint {
    x: number;
    y: number;
    age: number;
    link: number;
    width: number;
}

export interface TrackerMove {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    dx: number;
    dy: number;
    dragDist: number;
    smoothSpeed: number;
}

export interface RecorderFrame {
    pointer: { x: number; y: number };
    deltaTime: number;
    length: number;
    radius: number;
    aspect: number;
}

/** Upstream pointer-velocity tracker (host/pointer.ts): smoothing 0.2, no teleport guard here. */
export class PointerVelocityTracker {
    private prevX: number;
    private prevY: number;
    private smoothVelX = 0;
    private smoothVelY = 0;
    constructor(
        private readonly smoothing = 0.2,
        initialX = 0.5,
        initialY = 0.5,
    ) {
        this.prevX = initialX;
        this.prevY = initialY;
    }
    update(pointer: { x: number; y: number }, dt: number): TrackerMove {
        const oldX = this.prevX,
            oldY = this.prevY;
        const x = Number.isFinite(pointer.x) ? pointer.x : oldX;
        const y = Number.isFinite(pointer.y) ? pointer.y : oldY;
        const dx = x - oldX,
            dy = y - oldY;
        this.prevX = x;
        this.prevY = y;
        const invDt = 1 / Math.max(dt, 0.001);
        this.smoothVelX = this.smoothVelX * (1 - this.smoothing) + dx * invDt * this.smoothing;
        this.smoothVelY = this.smoothVelY * (1 - this.smoothing) + dy * invDt * this.smoothing;
        return {
            x,
            y,
            prevX: oldX,
            prevY: oldY,
            dx,
            dy,
            dragDist: Math.hypot(dx, dy),
            smoothSpeed: Math.hypot(this.smoothVelX, this.smoothVelY),
        };
    }
}

const finiteNumber = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * The trail recorder. Feed `frame()` every tick; read `packed` (the Uint16Array texture payload)
 * and `count` (live texels including the head duplicate; 0 = all dead / clear frame).
 */
export class TrailRecorder {
    readonly points: TrailPoint[] = [];
    readonly texData = new Uint16Array(MAX_POINTS * 4);
    private tracker = new PointerVelocityTracker(0.2);
    private headDist = 0;
    private wasActive = false;
    /** The number of texels written in the last pack (0 when the trail is empty). */
    count = 0;
    /** How many frames the recorder has packed (diagnostic only). */
    generations = 0;
    constructor(origin = { x: 0.5, y: 0.5 }) {
        this.tracker = new PointerVelocityTracker(0.2, origin.x, origin.y);
        this.trackerMoveCache = { ...origin };
        const one = toHalfFloat(1);
        for (let i = 0; i < MAX_POINTS; i++) this.texData[i * 4 + 2] = one;
    }
    /** Total numeric-input gate: non-finite pointer/dt/length/radius/aspect are rejected. */
    frame(input: RecorderFrame): { count: number; packed: Uint16Array } {
        if (
            !input ||
            !input.pointer ||
            ![input.pointer.x, input.pointer.y, input.deltaTime, input.length, input.radius, input.aspect].every(
                Number.isFinite,
            ) ||
            input.deltaTime < 0 ||
            input.length <= 0 ||
            input.radius < 0 ||
            input.aspect <= 0
        )
            throw Object.assign(new Error('Invalid recorder frame'), { code: 'TRAIL_FRAME' });
        const pointer = input.pointer;
        const rawDt = Math.max(0, finiteNumber(input.deltaTime, 0));
        const dt = Math.min(rawDt, 0.1);
        const length = Math.max(0.1, finiteNumber(input.length, 0.5));
        const radius = finiteNumber(input.radius, 0.5);
        const aspect = Math.max(1e-6, finiteNumber(input.aspect, 1));
        const drawRadius = radius * 0.1;
        const move = this.tracker.update(
            {
                x: finiteNumber(pointer.x, this.trackerMoveCache.x),
                y: finiteNumber(pointer.y, this.trackerMoveCache.y),
            },
            dt,
        );
        this.trackerMoveCache = { x: move.x, y: move.y };
        // Age + front-cull (monotone oldest-first).
        const ageRate = Math.min(rawDt, 0.25) / Math.max(0.1, length);
        for (const p of this.points) p.age = Math.min(1, p.age + ageRate);
        while (this.points.length > 0 && this.points[0].age >= 1) this.points.shift();
        if (move.dragDist > 0.001) {
            const stepDist = Math.hypot(move.dx * aspect, move.dy);
            const widthNow = Math.min(1, Math.max(WIDTH_MIN, Math.sqrt(Math.max(0, move.smoothSpeed) / SPEED_FULL)));
            if (this.points.length === 0) {
                this.points.push({ x: move.prevX, y: move.prevY, age: 0, link: 0, width: widthNow });
                this.points.push({ x: move.x, y: move.y, age: 0, link: 1, width: widthNow });
                this.headDist = stepDist;
            } else {
                const head = this.points[this.points.length - 1];
                head.x = move.x;
                head.y = move.y;
                head.age = 0;
                head.width = widthNow;
                this.headDist += stepDist;
                if (this.headDist >= Math.max(0.006, drawRadius * 0.5)) {
                    const n = this.points.length;
                    if (n >= 3 && this.points[n - 2].link === 1) {
                        const a = this.points[n - 3],
                            b = this.points[n - 2],
                            c = this.points[n - 1];
                        b.x = 0.25 * a.x + 0.5 * b.x + 0.25 * c.x;
                        b.y = 0.25 * a.y + 0.5 * b.y + 0.25 * c.y;
                    }
                    this.points.push({ x: move.x, y: move.y, age: 0, link: 1, width: widthNow });
                    this.headDist = 0;
                }
            }
            while (this.points.length > MAX_POINTS - 1) this.points.shift();
        }
        // Pack (with the head duplicate), or emit one final all-dead frame after the last point.
        const active = this.points.length > 0;
        if (active || this.wasActive) {
            const count = this.points.length > 0 ? this.points.length + 1 : 0;
            const one = toHalfFloat(1);
            for (let i = 0; i < MAX_POINTS; i++) {
                const base = i * 4;
                if (i < count) {
                    const p = this.points[Math.min(i, this.points.length - 1)];
                    this.texData[base] = toHalfFloat(p.x);
                    this.texData[base + 1] = toHalfFloat(p.y);
                    this.texData[base + 2] = toHalfFloat(p.age);
                    this.texData[base + 3] = toHalfFloat(i === this.points.length || p.link === 1 ? p.width : -p.width);
                } else {
                    this.texData[base] = 0;
                    this.texData[base + 1] = 0;
                    this.texData[base + 2] = one;
                    this.texData[base + 3] = 0;
                }
            }
            this.count = count;
            this.generations++;
        }
        this.wasActive = active;
        return { count: this.count, packed: this.texData };
    }
    private trackerMoveCache = { x: 0.5, y: 0.5 };
    /** Hard reset (Escape / release): clears points and emits an all-dead payload next frame. */
    reset(): void {
        this.points.length = 0;
        this.headDist = 0;
        this.wasActive = true; // one final all-dead frame
        this.tracker = new PointerVelocityTracker(0.2, this.trackerMoveCache.x, this.trackerMoveCache.y);
    }
}
