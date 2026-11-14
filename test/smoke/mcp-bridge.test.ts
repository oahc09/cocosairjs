/** Bridge lifecycle regressions; protocol/browser coverage lives in tools/mcp. */
const mockClock = { begin: jest.fn(), step: jest.fn(), end: jest.fn() };
const mockSession = {
    inspectScene: jest.fn(),
    captureFrame: jest.fn(),
    dispatch: jest.fn(),
    inspectNode: jest.fn(),
    close: jest.fn(),
};
jest.mock('cocosair', () => ({ createStepClock: () => mockClock }));
jest.mock('../../tools/debug/agent-session', () => ({ createAgentSession: () => mockSession }));
import { attachMcpBridge } from '../../tools/debug/mcp-bridge';
import type { AirApp } from '../../src';

function fixture(writable = true) {
    const scene = {};
    const app = { getScene: jest.fn(() => scene) };
    return { app, bridge: attachMcpBridge(app as unknown as AirApp, writable) };
}
beforeEach(() => {
    jest.resetAllMocks();
});
test('capture rejection waits for pending step before releasing clock', async () => {
    const { bridge } = fixture();
    let release!: () => void;
    let pending = true;
    mockSession.captureFrame.mockRejectedValue(new Error('capture timeout'));
    mockClock.step.mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                release = () => {
                    pending = false;
                    resolve();
                };
            }),
    );
    mockClock.end.mockImplementation(() => {
        expect(pending).toBe(false);
    });
    const call = bridge.call('capture', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(mockClock.end).not.toHaveBeenCalled();
    release();
    await expect(call).rejects.toThrow('capture timeout');
    expect(mockClock.end).toHaveBeenCalledTimes(1);
});
test('post-write destroyed target retains committed success and frame error', async () => {
    const { bridge } = fixture();
    mockSession.inspectNode.mockReturnValueOnce({ local: { position: [0, 0, 0] } }).mockImplementation(() => {
        throw new Error('destroyed');
    });
    mockSession.dispatch.mockResolvedValue({ ok: true, requestId: 'r', result: { applied: ['position'] } });
    mockClock.step.mockRejectedValue(new Error('draw failed'));
    const result = (await bridge.call('setTransform', { requestId: 'r', nodeId: 'n', position: [1, 0, 0] })) as any;
    expect(result.ok).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.frame.committed).toBe(true);
    expect(result.after.unavailable).toContain('destroyed');
    expect(mockClock.end).toHaveBeenCalledTimes(1);
});
test('read-only, closed and replaced scenes reject without a write or clock lease', async () => {
    const { bridge, app } = fixture(false);
    expect((await bridge.call('createNode', {}))?.error?.code).toBe('OUT_OF_SCOPE');
    app.getScene.mockReturnValue({});
    expect((await bridge.call('capture', {}))?.error?.code).toBe('STALE_TARGET');
    bridge.close();
    bridge.close();
    expect((await bridge.call('capture', {}))?.error?.code).toBe('SESSION_CLOSED');
    expect(mockSession.close).toHaveBeenCalledTimes(1);
    expect(mockSession.dispatch).not.toHaveBeenCalled();
    expect(mockClock.begin).not.toHaveBeenCalled();
});

function reviewFixture() {
    const f = fixture();
    let pose = { position: [0, 2, 6], rotationEuler: [-18, 0, 0], scale: [1, 1, 1] };
    mockSession.inspectScene.mockReturnValue({ cameraCount: 1 });
    mockSession.inspectNode.mockImplementation(() => ({
        active: true,
        components: [{ type: 'Camera', enabled: true }],
        local: JSON.parse(JSON.stringify(pose)),
    }));
    mockSession.dispatch.mockImplementation(async (request) => {
        pose = { ...pose, ...request.params };
        return { ok: true };
    });
    mockSession.captureFrame.mockResolvedValue({
        png: 'data:image/png;base64,eA==',
        width: 640,
        height: 480,
        frameIndex: 1,
        sceneId: 'scene',
    });
    mockClock.step.mockResolvedValue({ afterDraw: true });
    return {
        ...f,
        pose: () => pose,
        shots: [
            { label: 'Front', position: [0, 0, 6], rotationEuler: [0, 0, 0] },
            { label: 'Side', position: [6, 0, 0], rotationEuler: [0, 90, 0] },
        ],
    };
}
test('review captures bounded independent camera poses and restores original before releasing clock', async () => {
    const f = reviewFixture();
    const original = JSON.parse(JSON.stringify(f.pose()));
    const result = (await f.bridge.call('review', { cameraNodeId: 'camera', shots: f.shots })) as any;
    expect(result.ok).toBe(true);
    expect(result.cameraRestored).toBe(true);
    expect(result.frames).toHaveLength(2);
    expect(result.frames[1].requestedCamera.position).toEqual([6, 0, 0]);
    expect(f.pose().position).toEqual(original.position);
    expect(f.pose().rotationEuler).toEqual(original.rotationEuler);
    expect(mockClock.step.mock.calls).toEqual([[0], [0]]);
    expect(mockClock.end).toHaveBeenCalledTimes(1);
});
test('review validates every shot and rejects unsupported cameras before mutation', async () => {
    const f = reviewFixture();
    const bad = (await f.bridge.call('review', {
        cameraNodeId: 'camera',
        shots: [f.shots[0], { ...f.shots[1], position: [NaN, 0, 0] }],
    })) as any;
    expect(bad.error.code).toBe('INVALID_ARGUMENT');
    mockSession.inspectScene.mockReturnValue({ cameraCount: 2 });
    expect(((await f.bridge.call('review', { cameraNodeId: 'camera', shots: f.shots })) as any).error.code).toBe(
        'UNSUPPORTED_REVIEW',
    );
    expect(mockSession.dispatch).not.toHaveBeenCalled();
    expect(mockClock.begin).not.toHaveBeenCalled();
});
test('review capture failure restores camera and returns no partial frames', async () => {
    const f = reviewFixture();
    mockSession.captureFrame.mockRejectedValue(new Error('tainted canvas'));
    const result = (await f.bridge.call('review', { cameraNodeId: 'camera', shots: f.shots })) as any;
    expect(result.ok).toBe(false);
    expect(result.cameraRestored).toBe(true);
    expect(result.frames).toBeUndefined();
    expect(f.pose().position).toEqual([0, 2, 6]);
    expect(mockClock.end).toHaveBeenCalledTimes(1);
});
test('review restore failure requests fail-closed browser shutdown', async () => {
    const f = reviewFixture();
    mockSession.dispatch.mockImplementation(async (request) =>
        request.requestId.endsWith('-restore')
            ? { ok: false, error: { code: 'STALE_TARGET', message: 'gone' } }
            : { ok: true },
    );
    const result = (await f.bridge.call('review', { cameraNodeId: 'camera', shots: f.shots })) as any;
    expect(result.error.code).toBe('RESTORE_FAILED');
    expect(result.cameraRestored).toBe(false);
    expect(result.closeRequired).toBe(true);
    expect(mockClock.end).toHaveBeenCalledTimes(1);
});
test('failed review clock acquisition never releases another owner', async () => {
    const f = reviewFixture();
    mockClock.begin.mockImplementation(() => {
        throw new Error('clock busy');
    });
    await expect(f.bridge.call('review', { cameraNodeId: 'camera', shots: f.shots })).rejects.toThrow('clock busy');
    expect(mockSession.dispatch).not.toHaveBeenCalled();
    expect(mockClock.end).not.toHaveBeenCalled();
});
