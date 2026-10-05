/** Opt-in inspection of native legacy queues; no engine import or sorting.
 * Private-field pin: ForwardStage._renderQueues, RenderQueue._passDesc,
 * CachedArray.array/length. Missing pins produce unavailable, never an estimate.
 */
export interface AirRenderQueueEntry {
    readonly order: number;
    readonly modelIndex: number;
    readonly node: Readonly<{ name: string; uuid: string | null }>;
    readonly subModelIndex: number;
    readonly passIndex: number;
    readonly priority: number;
    readonly passPriority: number;
    readonly subModelPriority: number;
    readonly depth: number;
    readonly sortHash: number;
    readonly shaderId: number;
    readonly program: string;
    readonly blend: boolean;
    readonly depthTest: boolean;
    readonly depthWrite: boolean;
}
export interface AirRenderQueueSnapshot {
    readonly status: 'available' | 'unavailable';
    readonly scope: 'legacy-sorted-render-queues';
    readonly timing: 'caller-snapshot' | 'render-camera-end';
    readonly pin: string;
    readonly reason?: string;
    readonly camera: Readonly<{ name: string; uuid: string | null }>;
    readonly queues: readonly Readonly<{
        flow: string;
        stage: string;
        queueIndex: number;
        transparent: boolean;
        entries: readonly AirRenderQueueEntry[];
    }>[];
    /** Queues are not a global GPU draw trace. These paths execute outside them. */
    readonly excluded: readonly string[];
}
type NativeRoot = {
    usesCustomPipeline: boolean;
    pipeline: { flows: any[] };
    pipelineEvent: {
        on(type: string, callback: (camera: unknown) => void): unknown;
        off(type: string, callback: (camera: unknown) => void): void;
    };
};
const pin = 'ForwardStage._renderQueues / RenderQueue._passDesc / CachedArray.array,length';
const excluded = Object.freeze([
    'custom-pipeline',
    'instanced/batched draws',
    'UI draws',
    'auxiliary draws outside RenderQueue',
]);
function nodeIdentity(node: any): { name: string; uuid: string | null } {
    return Object.freeze({
        name: typeof node?.name === 'string' ? node.name : '',
        uuid: typeof node?.uuid === 'string' ? node.uuid : null,
    });
}

/** Snapshot a queue already owned/ordered by the renderer. Prefer the observer
 * for CAMERA_END timing. Direct callers must supply the actual native camera.
 */
export function inspectAirRenderQueues(root: unknown, camera: unknown): AirRenderQueueSnapshot {
    const native = root as NativeRoot;
    const view = camera as any;
    const identity = nodeIdentity(view?.node);
    const unavailable = (reason: string): AirRenderQueueSnapshot =>
        Object.freeze({
            status: 'unavailable',
            scope: 'legacy-sorted-render-queues',
            timing: 'caller-snapshot',
            pin,
            reason,
            camera: identity,
            queues: Object.freeze([]),
            excluded,
        });
    if (!native || native.usesCustomPipeline !== false)
        return unavailable(
            'Only the native legacy pipeline is covered; custom/unidentified pipelines are unavailable.',
        );
    try {
        if (!Array.isArray(native.pipeline?.flows) || !Array.isArray(view?.scene?.models))
            return unavailable('Missing native pipeline.flows or camera.scene.models pin.');
        const owners = new Map<any, { model: any; modelIndex: number; subModelIndex: number }>();
        view.scene.models.forEach((model: any, modelIndex: number) => {
            if (Array.isArray(model.subModels))
                model.subModels.forEach((subModel: any, subModelIndex: number) =>
                    owners.set(subModel, { model, modelIndex, subModelIndex }),
                );
        });
        const queues: AirRenderQueueSnapshot['queues'][number][] = [];
        for (const [flowIndex, flow] of native.pipeline.flows.entries()) {
            if (!Array.isArray(flow.stages)) return unavailable('Missing native flow.stages pin.');
            for (const [stageIndex, stage] of flow.stages.entries()) {
                if (!('_renderQueues' in stage)) continue;
                if (!Array.isArray(stage._renderQueues)) return unavailable('Missing native stage._renderQueues pin.');
                for (const [queueIndex, queue] of stage._renderQueues.entries()) {
                    const cached = queue.queue;
                    if (
                        typeof queue._passDesc?.isTransparent !== 'boolean' ||
                        !Array.isArray(cached?.array) ||
                        !Number.isInteger(cached.length) ||
                        cached.length < 0 ||
                        cached.length > cached.array.length
                    )
                        return unavailable('Missing/malformed native RenderQueue descriptor or CachedArray pin.');
                    const entries: AirRenderQueueEntry[] = [];
                    // CachedArray keeps stale capacity after clear. Read only active length.
                    for (let order = 0; order < cached.length; ++order) {
                        const entry = cached.array[order];
                        const owner = owners.get(entry?.subModel);
                        const pass = entry?.subModel?.passes?.[entry.passIdx];
                        if (
                            !owner ||
                            !pass?.blendState?.targets?.[0] ||
                            !pass.depthStencilState ||
                            typeof pass.program !== 'string'
                        )
                            return unavailable(
                                'A queued native submodel/pass cannot be mapped to the current camera scene.',
                            );
                        entries.push(
                            Object.freeze({
                                order,
                                modelIndex: owner.modelIndex,
                                node: nodeIdentity(owner.model.node),
                                subModelIndex: owner.subModelIndex,
                                passIndex: entry.passIdx,
                                priority: entry.priority,
                                passPriority: pass.priority,
                                subModelPriority: entry.subModel.priority,
                                depth: entry.depth,
                                sortHash: entry.hash,
                                shaderId: entry.shaderId,
                                program: pass.program,
                                blend: pass.blendState.targets[0].blend,
                                depthTest: pass.depthStencilState.depthTest,
                                depthWrite: pass.depthStencilState.depthWrite,
                            }),
                        );
                    }
                    queues.push(
                        Object.freeze({
                            flow: typeof flow.name === 'string' ? flow.name : `flow-${flowIndex}`,
                            stage: typeof stage.name === 'string' ? stage.name : `stage-${stageIndex}`,
                            queueIndex,
                            transparent: queue._passDesc.isTransparent,
                            entries: Object.freeze(entries),
                        }),
                    );
                }
            }
        }
        if (!queues.length) return unavailable('No native legacy RenderQueue pins were found.');
        return Object.freeze({
            status: 'available',
            scope: 'legacy-sorted-render-queues',
            timing: 'caller-snapshot',
            pin,
            camera: identity,
            queues: Object.freeze(queues),
            excluded,
        });
    } catch (error) {
        return unavailable(`Native queue inspection failed: ${String(error)}`);
    }
}

/** Observe after native sorting/recording, before the next camera clears queues.
 * Disposing twice is safe; the observer never changes renderer data or order.
 */
export function attachAirRenderQueueObserver(
    root: unknown,
    onSnapshot: (snapshot: AirRenderQueueSnapshot) => void,
): () => void {
    const native = root as NativeRoot;
    if (
        !native ||
        native.usesCustomPipeline !== false ||
        typeof native.pipelineEvent?.on !== 'function' ||
        typeof native.pipelineEvent?.off !== 'function'
    ) {
        onSnapshot(inspectAirRenderQueues(root, null));
        return () => {};
    }
    const callback = (camera: unknown): void => {
        const snapshot = inspectAirRenderQueues(root, camera);
        onSnapshot(Object.freeze({ ...snapshot, timing: 'render-camera-end' }));
    };
    native.pipelineEvent.on('render-camera-end', callback);
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        native.pipelineEvent.off('render-camera-end', callback);
    };
}
