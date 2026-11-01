import { observeAirFirstFrame, AirReadinessOptions } from '../../tools/debug/readiness-observer';

describe('verification-side first-frame observation protocol (not browser evidence)', () => {
    const never = () => new Promise<never>(() => {});
    function fixture(overrides: Partial<AirReadinessOptions> = {}) {
        const state = { animationTime: 0, physicsStep: 0, randomSeed: 7, timers: 0, input: 0, businessEvents: 0 };
        const cleanup = jest.fn();
        const options: AirReadinessOptions = {
            engineCreated: Promise.resolve(),
            resources: [{ name: 'local-rig', promise: Promise.resolve() }],
            inspectPasses: () => ({ status: 'available', details: { synthetic: true } }),
            waitForSubmission: async () => ({ id: 'scene:1', scene: 'scene', frame: 1, afterDraw: true }),
            waitForPresentation: async (submission) => ({
                source: 'browser-compositor',
                submissionId: submission.id,
                sha256: 'a'.repeat(64),
                width: 10,
                height: 10,
                contentValidated: true,
            }),
            snapshotBusiness: () => state,
            timeoutMs: 100,
            cleanup,
            ...overrides,
        };
        return { state, cleanup, options };
    }
    test('keeps engine, resources, passes, submission and presentation as five distinct observations', async () => {
        const f = fixture();
        const report = await observeAirFirstFrame(f.options);
        expect(report.status).toBe('READY');
        expect(report.businessUnchanged).toBe(true);
        expect(report.stages.map((row) => row.name)).toEqual([
            'engine-created',
            'declared-resources',
            'scene-passes',
            'frame-submitted',
            'browser-presented',
        ]);
        expect(f.cleanup).toHaveBeenCalledTimes(1);
    });
    test('delayed resources are awaited without advancing or ticking business state', async () => {
        let resolve!: () => void;
        const resource = new Promise<void>((yes) => (resolve = yes));
        const inspect = jest.fn(() => ({ status: 'available' as const, details: {} }));
        const f = fixture({ resources: [{ name: 'delayed', promise: resource }], inspectPasses: inspect });
        const pending = observeAirFirstFrame(f.options);
        await Promise.resolve();
        await Promise.resolve();
        expect(inspect).not.toHaveBeenCalled();
        resolve();
        expect((await pending).businessUnchanged).toBe(true);
    });
    test('unobservable GPU/compiler availability is BLOCKED, never a fabricated ready()', async () => {
        const submit = jest.fn();
        const f = fixture({
            inspectPasses: () => ({ status: 'unknown', details: 'GPU completion unavailable' }),
            waitForSubmission: submit,
        });
        expect(await observeAirFirstFrame(f.options)).toMatchObject({
            status: 'BLOCKED',
            error: { code: 'READINESS_PASS_UNKNOWN' },
        });
        expect(submit).not.toHaveBeenCalled();
        expect(f.cleanup).toHaveBeenCalledTimes(1);
    });
    test.each(['resources', 'submission', 'presentation'] as const)(
        'deadline at %s retains the last stage and cleans up',
        async (stage) => {
            const f = fixture({ timeoutMs: 1 });
            if (stage === 'resources') f.options.resources = [{ name: 'never', promise: never() }];
            if (stage === 'submission') f.options.waitForSubmission = never;
            if (stage === 'presentation') f.options.waitForPresentation = never;
            const report = await observeAirFirstFrame(f.options);
            expect(report.status).toBe('TIMED_OUT');
            expect(report.error?.code).toBe('READINESS_TIMEOUT');
            expect(report.stages.at(-1)?.status).toBe('failed');
            expect(f.cleanup).toHaveBeenCalledTimes(1);
        },
    );
    test('declared resource rejection and shader/device loss become terminal failures', async () => {
        for (const overrides of [
            { resources: [{ name: 'missing', promise: Promise.reject(new Error('404')) }] },
            { inspectPasses: () => ({ status: 'failed' as const, details: 'shader compile failed' }) },
            { engineCreated: never(), fault: Promise.resolve(new Error('context lost')) },
        ]) {
            const f = fixture(overrides);
            expect((await observeAirFirstFrame(f.options)).status).toBe('FAILED');
            expect(f.cleanup).toHaveBeenCalledTimes(1);
        }
    });
    test('pre-abort and in-flight abort do not abort caller-owned resources', async () => {
        const controller = new AbortController();
        controller.abort();
        const pre = fixture({ signal: controller.signal });
        expect((await observeAirFirstFrame(pre.options)).status).toBe('ABORTED');
        const live = new AbortController();
        let done = false;
        const f = fixture({
            signal: live.signal,
            resources: [
                {
                    name: 'borrowed',
                    promise: new Promise<void>((resolve) =>
                        setTimeout(() => {
                            done = true;
                            resolve();
                        }, 10),
                    ),
                },
            ],
        });
        const pending = observeAirFirstFrame(f.options);
        live.abort();
        expect((await pending).status).toBe('ABORTED');
        await new Promise((resolve) => setTimeout(resolve, 15));
        expect(done).toBe(true);
    });
    test('GPU readback, blank screenshots and mismatched submission cannot replace compositor proof', async () => {
        for (const invalid of [
            { source: 'gpu-readback' },
            { contentValidated: false },
            { submissionId: 'old' },
            { sha256: '' },
            { width: 0 },
        ]) {
            const f = fixture();
            const original = f.options.waitForPresentation;
            f.options.waitForPresentation = async (receipt) => ({ ...(await original(receipt)), ...invalid }) as any;
            expect(await observeAirFirstFrame(f.options)).toMatchObject({
                status: 'FAILED',
                error: { code: 'READINESS_PRESENTATION_INVALID' },
            });
        }
    });
    test('tick(0)-style callback mutation is detected even if pixels would be ready', async () => {
        const f = fixture();
        const original = f.options.waitForSubmission;
        f.options.waitForSubmission = async () => {
            f.state.businessEvents++;
            return original();
        };
        expect(await observeAirFirstFrame(f.options)).toMatchObject({
            status: 'FAILED',
            businessUnchanged: false,
            error: { code: 'READINESS_BUSINESS_ADVANCED' },
        });
    });
});
