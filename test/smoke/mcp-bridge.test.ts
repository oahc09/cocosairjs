/** Bridge lifecycle regressions; protocol/browser coverage lives in tools/mcp. */
const mockClock = { begin: jest.fn(), step: jest.fn(), end: jest.fn() };
const mockSession = { captureFrame: jest.fn(), dispatch: jest.fn(), inspectNode: jest.fn(), close: jest.fn() };
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
