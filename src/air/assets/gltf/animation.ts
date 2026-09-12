import { AnimationClip } from '../../../cocos/animation/animation-clip';
import { VectorTrack } from '../../../cocos/animation/tracks/vector-track';
import { QuatTrack } from '../../../cocos/animation/tracks/quat-track';
import { RealTrack } from '../../../cocos/animation/tracks/real-track';
import { Channel, Track, TrackEval, TrackPath } from '../../../cocos/animation/tracks/track';
import { RealCurve } from '../../../cocos/core/curves/curve';
import { createEvalSymbol } from '../../../cocos/animation/define';
import { RealInterpolationMode } from '../../../cocos/core/curves/curve';
import { QuatInterpolationMode } from '../../../cocos/core/curves/quat-curve';
import { Quat } from '../../../cocos/core/math';
import { MeshRenderer } from '../../../cocos/3d/framework/mesh-renderer';
import { Node } from '../../../cocos/scene-graph/node';
import { GLTFContext } from './context';
import { check, item } from './schema';

/** glTF component-wise Hermite quaternion interpolation, evaluated by Cocos Animation. */
export class GLTFCubicQuatTrack extends Track {
    private readonly quaternionChannels: Channel<RealCurve>[];
    constructor (private readonly times: number[], private readonly values: number[]) {
        super();
        // Native clip evaluation excludes tracks without nonempty channels. Keep the actual
        // component curves here; the evaluator normalizes their joint Hermite result.
        this.quaternionChannels = [0, 1, 2, 3].map((c) => {
            const curve = new RealCurve(); curve.assignSorted(realKeys(times, values, 4, c, 'CUBICSPLINE'));
            return new Channel(curve);
        });
    }
    public channels (): Iterable<Channel<RealCurve>> { return this.quaternionChannels; }
    public range (): { min: number; max: number } { return { min: this.times[0], max: this.times[this.times.length - 1] }; }
    public [createEvalSymbol] (): TrackEval<Quat> {
        const result = new Quat();
        return { requiresDefault: false, evaluate: (time: number): Quat => {
            const values = sampleCubicQuaternion(this.times, this.values, time);
            result.set(values[0], values[1], values[2], values[3]); return result;
        } };
    }
}
export function sampleCubicQuaternion (times: number[], values: number[], time: number): number[] {
    let lo = 0; let hi = times.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (times[mid] <= time) { lo = mid; } else { hi = mid; } }
    let result: number[];
    if (time <= times[0]) { result = values.slice(4, 8); }
    else if (time >= times[times.length - 1]) { result = values.slice((times.length - 1) * 12 + 4, (times.length - 1) * 12 + 8); }
    else {
        const dt = times[hi] - times[lo]; const t = (time - times[lo]) / dt;
        const t2 = t * t; const t3 = t2 * t;
        result = [0, 1, 2, 3].map((c) => (2 * t3 - 3 * t2 + 1) * values[lo * 12 + 4 + c]
            + (t3 - 2 * t2 + t) * dt * values[lo * 12 + 8 + c]
            + (-2 * t3 + 3 * t2) * values[hi * 12 + 4 + c] + (t3 - t2) * dt * values[hi * 12 + c]);
    }
    const length = Math.hypot(...result);
    check(length > 1e-12, 'CUBICSPLINE produced zero quaternion');
    return result.map((v) => v / length);
}

export function createGLTFAnimations (context: GLTFContext, paths: string[], included?: Set<number>): AnimationClip[] {
    const clips: AnimationClip[] = [];
    try {
        for (const [clipIndex, source] of (context.json.animations || []).entries()) {
            const clip = new AnimationClip(); clips.push(clip);
            // Duplicate names must not overwrite states in Animation's name-keyed map.
            const base = source.name || `animation_${clipIndex}`;
            clip.name = clips.slice(0, -1).some((c) => c.name === base) ? `${base}__${clipIndex}` : base;
            const seen = new Set<string>();
            for (const channel of source.channels) {
                const target = channel.target;
                if (target.node === undefined) { continue; }
                const node = item(context.json.nodes, target.node, 'animation node');
                const key = `${target.node}:${target.path}`;
                check(!seen.has(key), 'duplicate animation target'); seen.add(key);
                check(['translation', 'rotation', 'scale', 'weights'].includes(target.path), `unsupported animation target ${target.path}`);
                check(target.path === 'weights' || !node.matrix, 'TRS animation cannot target a matrix node');
                const sampler = item(source.samplers, channel.sampler, 'animation sampler');
                const input = context.accessor(sampler.input); const output = context.accessor(sampler.output);
                const times = input.values;
                check(input.source.type === 'SCALAR' && input.source.componentType === 5126 && times.every((v, i) => v >= 0 && (!i || v > times[i - 1])), 'invalid animation times');
                const interpolation = sampler.interpolation || 'LINEAR';
                check(['STEP', 'LINEAR', 'CUBICSPLINE'].includes(interpolation), 'invalid animation interpolation');
                const cubic = interpolation === 'CUBICSPLINE';
                const mesh = target.path === 'weights' ? item(context.json.meshes, node.mesh!, 'morph mesh') : undefined;
                const width = mesh ? (mesh.primitives[0].targets?.length || 0) : target.path === 'rotation' ? 4 : 3;
                check(width > 0 && output.source.componentType === 5126 && output.values.length === times.length * width * (cubic ? 3 : 1)
                    && output.source.type === (mesh ? 'SCALAR' : width === 4 ? 'VEC4' : 'VEC3'), 'invalid animation output');
                clip.duration = Math.max(clip.duration, times[times.length - 1]);
                if (included && !included.has(target.node)) { continue; }
                const path = new TrackPath().toHierarchy(paths[target.node]);
                if (target.path !== 'weights') { path.toProperty(target.path === 'translation' ? 'position' : target.path); }
                if (target.path === 'rotation') {
                    let track: Track;
                    if (cubic) { track = new GLTFCubicQuatTrack(times.slice(), output.values.slice()); }
                    else {
                        const quat = new QuatTrack();
                        quat.channel.curve.assignSorted(times.map((time, i) => {
                            const q = new Quat(...output.values.slice(i * 4, i * 4 + 4) as [number, number, number, number]);
                            check(Math.hypot(q.x, q.y, q.z, q.w) > 1e-12, 'invalid animation quaternion'); Quat.normalize(q, q);
                            return [time, { value: q, interpolationMode: interpolation === 'STEP' ? QuatInterpolationMode.CONSTANT : QuatInterpolationMode.SLERP }];
                        }));
                        track = quat;
                    }
                    track.path = path; clip.addTrack(track);
                } else if (target.path === 'weights') {
                    for (let c = 0; c < width; ++c) {
                        const track = new RealTrack(); track.path = path;
                        track.proxy = { forTarget: (object: Node) => ({
                            get: () => object.getComponent(MeshRenderer)?.getWeight(0, c) || 0,
                            set: (value: number) => {
                                const renderer = object.getComponent(MeshRenderer)!;
                                for (let sub = 0; sub < mesh!.primitives.length; ++sub) { renderer.setWeight(value, sub, c); }
                            },
                        }) };
                        track.channel.curve.assignSorted(realKeys(times, output.values, width, c, interpolation));
                        clip.addTrack(track);
                    }
                } else {
                    const track = new VectorTrack(); track.componentsCount = 3; track.path = path;
                    for (let c = 0; c < 3; ++c) { track.channels()[c].curve.assignSorted(realKeys(times, output.values, 3, c, interpolation)); }
                    clip.addTrack(track);
                }
            }
        }
        return clips;
    } catch (error) { clips.forEach((clip) => clip.destroy()); throw error; }
}
function realKeys (times: number[], values: number[], width: number, component: number, interpolation: string): [number, {
    value: number; interpolationMode: RealInterpolationMode; leftTangent: number; rightTangent: number;
}][] {
    const cubic = interpolation === 'CUBICSPLINE';
    return times.map((time, i) => [time, {
        value: values[(i * (cubic ? 3 : 1) + (cubic ? 1 : 0)) * width + component],
        interpolationMode: cubic ? RealInterpolationMode.CUBIC : interpolation === 'STEP' ? RealInterpolationMode.CONSTANT : RealInterpolationMode.LINEAR,
        leftTangent: cubic ? values[i * 3 * width + component] : 0,
        rightTangent: cubic ? values[(i * 3 + 2) * width + component] : 0,
    }]);
}
