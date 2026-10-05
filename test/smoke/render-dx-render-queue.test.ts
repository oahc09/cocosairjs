import { attachAirRenderQueueObserver, inspectAirRenderQueues } from '../../tools/debug/render-queue';

function fixture() {
    const firstPass = {
        program: 'first',
        priority: 9,
        blendState: { targets: [{ blend: true }] },
        depthStencilState: { depthWrite: false, depthTest: true },
    };
    const secondPass = { ...firstPass, program: 'second', priority: 1 };
    const first = { passes: [firstPass], priority: 2 };
    const second = { passes: [secondPass], priority: 3 };
    const queue = {
        _passDesc: { isTransparent: true },
        queue: {
            length: 2,
            array: [
                { priority: 4, hash: 99, depth: 2, shaderId: 1, subModel: first, passIdx: 0 },
                { priority: 1, hash: 1, depth: 9, shaderId: 2, subModel: second, passIdx: 0 },
                { subModel: null }, // stale CachedArray capacity is deliberately invalid.
            ],
        },
    };
    const camera = {
        node: { name: 'Camera', uuid: 'camera-1' },
        scene: {
            models: [
                { node: { name: 'First', uuid: 'first-1' }, subModels: [first] },
                { node: { name: 'Second', uuid: 'second-1' }, subModels: [second] },
            ],
        },
    };
    const root = {
        usesCustomPipeline: false,
        pipeline: { flows: [{ name: 'Forward', stages: [{ name: 'ForwardStage', _renderQueues: [queue] }] }] },
        pipelineEvent: { on: jest.fn(), off: jest.fn() },
    };
    return { root, camera, queue };
}

describe('opt-in native legacy queue observation', () => {
    test('preserves the actual active array order rather than recalculating priority/depth sorting', () => {
        const { root, camera, queue } = fixture();
        const before = queue.queue.array.slice();
        const report = inspectAirRenderQueues(root, camera);
        expect(report.status).toBe('available');
        expect(report.queues[0].entries.map((entry) => entry.node.name)).toEqual(['First', 'Second']);
        expect(report.queues[0].entries.map((entry) => entry.passPriority)).toEqual([9, 1]);
        expect(report.queues[0].entries.map((entry) => entry.depth)).toEqual([2, 9]);
        expect(report.queues[0].entries[0]).toMatchObject({
            modelIndex: 0,
            subModelIndex: 0,
            passIndex: 0,
            priority: 4,
            program: 'first',
            blend: true,
            depthWrite: false,
        });
        expect(queue.queue.array).toEqual(before);
        expect(report.excluded).toContain('instanced/batched draws');
        expect(Object.isFrozen(report.queues[0].entries)).toBe(true);
    });

    test('custom pipelines and changed private pins are unavailable instead of estimated', () => {
        const { root, camera, queue } = fixture();
        expect(inspectAirRenderQueues({ ...root, usesCustomPipeline: true }, camera).status).toBe('unavailable');
        queue.queue.length = 100;
        expect(inspectAirRenderQueues(root, camera).status).toBe('unavailable');
        queue.queue.length = 1;
        (queue as any)._passDesc = {};
        expect(inspectAirRenderQueues(root, camera).status).toBe('unavailable');
    });

    test('captures CAMERA_END synchronously before next-camera mutation and detaches idempotently', () => {
        const { root, camera, queue } = fixture();
        const sink = jest.fn();
        const detach = attachAirRenderQueueObserver(root, sink);
        const [event, callback] = root.pipelineEvent.on.mock.calls[0];
        expect(event).toBe('render-camera-end');
        callback(camera);
        queue.queue.length = 0;
        expect(sink.mock.calls[0][0].timing).toBe('render-camera-end');
        expect(sink.mock.calls[0][0].queues[0].entries).toHaveLength(2);
        detach();
        detach();
        expect(root.pipelineEvent.off).toHaveBeenCalledTimes(1);
        expect(root.pipelineEvent.off).toHaveBeenCalledWith(event, callback);
    });
});
