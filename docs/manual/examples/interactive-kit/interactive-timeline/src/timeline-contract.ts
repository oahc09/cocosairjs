/** Local example arithmetic; native Node, session and clocks remain the runtime APIs. */
export const PART_COUNT = 18;
export const RANGE_END = 499;
export const POSE_TOLERANCE = 0.002;
export const CUES = Object.freeze([0.4, 1.5, 2.8, 4, 5.3, 6.6, 7.9, 9.2, 10.5, 11.8, 13.1, 14.4]);
export interface PartPose {
    position: [number, number, number];
    scale: [number, number, number];
}
function number(value: number, name: string): void {
    if (!Number.isFinite(value)) throw Error(`TIMELINE_INVALID_${name}`);
}
export function targets(stage: number): PartPose[] {
    if (!Number.isInteger(stage) || stage < 0 || stage > 2) throw Error('TIMELINE_INVALID_STAGE');
    return Array.from({ length: PART_COUNT }, (_, i) => {
        const x = ((i % 6) - 2.5) * 0.5,
            y = (Math.floor(i / 6) - 1) * 0.7;
        return {
            position: [x * (stage === 1 ? 1.5 : 1), y * (stage === 1 ? 1.5 : 1), 0],
            scale: stage === 2 ? [1.4, 0.45, 1] : [1, 1, 1],
        };
    });
}
export function poseError(actual: readonly PartPose[], target: readonly PartPose[]): number {
    if (actual.length !== PART_COUNT || target.length !== PART_COUNT) throw Error('TIMELINE_PART_COUNT');
    let error = 0;
    for (let i = 0; i < PART_COUNT; i++)
        for (const key of ['position', 'scale'] as const)
            for (let j = 0; j < 3; j++) {
                number(actual[i][key][j], 'POSE');
                number(target[i][key][j], 'TARGET');
                error = Math.max(error, Math.abs(actual[i][key][j] - target[i][key][j]));
            }
    return error;
}
export function advanceMotion(actual: readonly PartPose[], target: readonly PartPose[], dt: number): PartPose[] {
    number(dt, 'DT');
    if (dt < 0) throw Error('TIMELINE_INVALID_DT');
    poseError(actual, target);
    const blend = 1 - Math.exp(-18 * Math.min(dt, 0.1));
    return actual.map((p, i) => ({
        position: p.position.map((v, j) => v + (target[i].position[j] - v) * blend) as [number, number, number],
        scale: p.scale.map((v, j) => v + (target[i].scale[j] - v) * blend) as [number, number, number],
    }));
}
export function sectionProgress(
    scrollY: number,
    height: number,
    documentHeight: number,
    offsets: readonly number[],
): { progress: number; section: number } {
    for (const v of [scrollY, height, documentHeight, ...offsets]) number(v, 'SCROLL');
    if (
        height <= 0 ||
        documentHeight < height ||
        !offsets.length ||
        offsets.some((v, i) => v < 0 || (i > 0 && v <= offsets[i - 1]))
    )
        throw Error('TIMELINE_INVALID_SCROLL');
    const end = documentHeight - height,
        progress = end === 0 ? 1 : Math.max(0, Math.min(1, scrollY / end));
    let section = 0;
    for (let i = 0; i < offsets.length; i++) if (scrollY + height / 2 >= offsets[i]) section = i;
    if (progress === 1) section = offsets.length - 1;
    return { progress, section };
}
export function crossedCues(previous: number, current: number): number[] {
    number(previous, 'TIME');
    number(current, 'TIME');
    if (current < previous) return [];
    return CUES.map((time, i) => ({ time, i }))
        .filter((x) => x.time > previous && x.time <= current)
        .map((x) => x.i);
}
