/** Generated PNGs test validation; they are not audio/browser evidence. */
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os'),
    crypto = require('node:crypto'),
    { PNG } = require('pngjs');
const { expected, poseError, checkState, checkReport } = require('../../tools/verify/interactive-timeline-browser.cjs');
let dir: string;
beforeAll(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-timeline-'))));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
function fixture(): any {
    const p = new PNG({ width: 600, height: 600 }),
        poses = expected(1);
    for (const v of poses) {
        const x = 300 + (v.position[0] * 600) / 5.5,
            y = 300 - (v.position[1] * 600) / 5.5;
        for (let py = Math.floor(y - 8); py < y + 8; py++)
            for (let px = Math.floor(x - 8); px < x + 8; px++) {
                const i = (py * 600 + px) * 4;
                p.data[i] = 240;
                p.data[i + 1] = 65;
                p.data[i + 2] = 65;
                p.data[i + 3] = 255;
            }
    }
    const b = PNG.sync.write(p),
        file = path.join(dir, 'view.png');
    fs.writeFileSync(file, b);
    return {
        kind: 'assembly',
        expectedStage: 1,
        expectConverged: true,
        snapshot: {
            disposed: false,
            submitted: 3,
            sequence: 3,
            submissionTimestamp: new Date().toISOString(),
            frames: 10,
            clock: { method: 'NATIVE_PACER' },
            poses,
            camera: { z: 7, orthoHeight: 2.75 },
            layout: { rect: { left: 0, top: 0, width: 600, height: 600 }, dpr: 1 },
        },
        png: { path: file, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') },
    };
}
const row = { clock: 'NATIVE_PACER', viewport: { width: 600, height: 600 } };
describe('IER-07/08 independent evidence validation', () => {
    test('actual 18 poses, camera and visible pixels are accepted', () =>
        expect(checkState(row, fixture())).toEqual({ pass: true, errors: [] }));
    test.each([
        [
            'label without convergence',
            (s: any) => {
                s.snapshot.poses = expected(0);
                s.snapshot.status = 'converged';
            },
        ],
        ['missing part', (s: any) => s.snapshot.poses.pop()],
        ['nonfinite pose', (s: any) => (s.snapshot.poses[0].position[0] = NaN)],
        ['camera not at target', (s: any) => (s.snapshot.camera.z = 6)],
        ['no draw', (s: any) => (s.snapshot.submitted = 0)],
        ['no timestamp', (s: any) => (s.snapshot.submissionTimestamp = '')],
        ['NaN frame', (s: any) => (s.snapshot.frames = NaN)],
        ['future sequence', (s: any) => (s.snapshot.sequence = Infinity)],
        ['clock swap', (s: any) => (s.snapshot.clock.method = 'STEP_CLOCK')],
        ['PNG drift', (s: any) => (s.png.sha256 = '0'.repeat(64))],
        ['wrong viewport', (_s: any, r: any) => (r.viewport.width = 500)],
    ])('rejects %s', (_name, change: any) => {
        const s = fixture(),
            r = JSON.parse(JSON.stringify(row));
        change(s, r);
        expect(checkState(r, s).pass).toBe(false);
    });
    test('hash-correct black screenshot cannot compensate native pose', () => {
        const s = fixture(),
            b = PNG.sync.write(new PNG({ width: 600, height: 600 }));
        fs.writeFileSync(s.png.path, b);
        s.png.bytes = b.length;
        s.png.sha256 = crypto.createHash('sha256').update(b).digest('hex');
        expect(checkState(row, s).errors).toContain('native part not visible');
    });
    test('intermediate state must still differ from target even when label already changed', () => {
        const s = fixture();
        s.expectConverged = false;
        expect(checkState(row, s).errors).toContain('native convergence');
        s.snapshot.poses = expected(0);
        expect(checkState(row, s).pass).toBe(true);
    });
    test('pose error includes native scale and camera', () => {
        const s = fixture().snapshot;
        s.poses[0].scale[1] = 0.5;
        expect(poseError(s, 1)).toBe(0.5);
    });
    test('malformed report is rejected without throwing', () => expect(checkReport(null).scopePassed).toBe(false));
});
export {};

// Synthetic receipts below test rejection only; real EOS requires browser collection.
const { checkAudioCompletion, requestedEngines } = require('../../tools/verify/interactive-timeline-browser.cjs');
function completionFixture(): any {
    const snapshot = (
        playing: boolean,
        endedCurrent: number,
        sourceStops: number,
        ended: boolean,
        stopped: boolean,
    ) => ({
        audio: { playing, endedCurrent, sourceStops, sourceCreates: 1, startedSources: [{ id: 1, ended, stopped }] },
    });
    return {
        contract: 'natural-and-explicit/1',
        beforeNatural: snapshot(true, 0, 0, false, false),
        naturalEnd: snapshot(false, 1, 0, true, false),
        beforeStop: snapshot(true, 1, 0, false, false),
        afterStop: snapshot(false, 1, 1, false, true),
    };
}
describe('timeline selection and independent completion contract', () => {
    test('selects exactly one engine or the full matrix', () => {
        expect(requestedEngines()).toEqual(['chromium', 'firefox', 'webkit']);
        expect(requestedEngines('webkit')).toEqual(['webkit']);
        expect(() => requestedEngines('unknown')).toThrow('browser must be');
    });
    test('malformed declared selection cannot validate as a focused pass', () => {
        for (const requestedEngines of [undefined, [], ['webkit', 'webkit'], ['unknown']]) {
            const result = checkReport({ requestedEngines }, { selected: true });
            expect(result.selectedScopePassed).toBe(false);
            expect(result.errors).toContain('invalid requested browser matrix');
        }
    });
    test('distinct natural completion and explicit stop are accepted', () => {
        expect(checkAudioCompletion(completionFixture())).toEqual({ pass: true, errors: [] });
    });
    test.each([
        ['missing contract', (r: any) => delete r.contract],
        ['no natural EOS', (r: any) => r.naturalEnd.audio.endedCurrent--],
        ['stop reported as EOS', (r: any) => r.naturalEnd.audio.sourceStops++],
        ['no natural source ended', (r: any) => (r.naturalEnd.audio.startedSources[0].ended = false)],
        ['EOS reported as stop', (r: any) => r.afterStop.audio.endedCurrent++],
        ['stopped source is marked ended', (r: any) => (r.afterStop.audio.startedSources[0].ended = true)],
        ['no explicit source stop', (r: any) => r.afterStop.audio.sourceStops--],
        ['swapped natural source', (r: any) => r.naturalEnd.audio.startedSources[0].id++],
        ['swapped stopped source', (r: any) => r.afterStop.audio.startedSources[0].id++],
        ['non-finite counters', (r: any) => (r.beforeNatural.audio.sourceCreates = Infinity)],
    ])('rejects %s', (_name, mutate: any) => {
        const receipt = completionFixture();
        mutate(receipt);
        expect(checkAudioCompletion(receipt).pass).toBe(false);
    });
});

const { submittedSnapshot, waitForSubmittedSnapshot } = require('../../tools/verify/interactive-timeline-browser.cjs');
describe('native submission synchronization', () => {
    const failed = {
        disposed: false,
        frames: 3,
        sequence: 1,
        submitted: 0,
        submissionTimestamp: '2026-10-19T12:10:12.038Z',
    };
    test('real f963 initial snapshot stays unready despite three existing frames', () => {
        expect(submittedSnapshot(failed)).toBe(false);
        const drawn = { ...failed, submitted: 1 };
        expect(submittedSnapshot(drawn)).toBe(drawn);
    });
    test.each([
        ['zero frames', { frames: 0 }],
        ['disposed', { disposed: true }],
        ['invalid timestamp', { submissionTimestamp: '' }],
        ['non-finite sequence', { sequence: Infinity, submitted: Infinity }],
    ])('never accepts %s', (_name, change) =>
        expect(submittedSnapshot({ ...failed, submitted: 1, ...change })).toBe(false),
    );
    test('returns predicate snapshot handle and disposes it without a later evaluate', async () => {
        const snapshot = { ...failed, submitted: 1 };
        const handle = { jsonValue: jest.fn(async () => snapshot), dispose: jest.fn(async () => {}) };
        const page = { waitForFunction: jest.fn(async () => handle), evaluate: jest.fn() };
        expect(await waitForSubmittedSnapshot(page)).toBe(snapshot);
        expect(page.waitForFunction).toHaveBeenCalledWith(submittedSnapshot, undefined, {
            polling: 20,
            timeout: 20000,
        });
        expect(handle.dispose).toHaveBeenCalledTimes(1);
        expect(page.evaluate).not.toHaveBeenCalled();
    });
    test('missing submission rejects rather than fabricating a snapshot or retrying', async () => {
        const page = {
            waitForFunction: jest.fn(async () => {
                throw new Error('submission timeout');
            }),
        };
        await expect(waitForSubmittedSnapshot(page)).rejects.toThrow('submission timeout');
        expect(page.waitForFunction).toHaveBeenCalledTimes(1);
    });
});

const { checkResetBoundary } = require('../../tools/verify/interactive-timeline-browser.cjs');
function resetBoundaryFixture(): any {
    const event = { type: 'reset', sequence: 8, generation: 3, isTrusted: true, wallTime: '2026-10-19T12:55:51.048Z' };
    return {
        observations: {
            resetBefore: { sequence: 6, generation: 2 },
            reset: {
                logicalTime: 0,
                rangeValue: 0,
                sequence: 8,
                generation: 3,
                poses: expected(0),
                camera: { z: 6, orthoHeight: 2.5 },
                events: [{ type: 'session', reason: 'reset', sequence: 7, generation: 3 }, event],
            },
            resetBoundary: {
                contract: 'trusted-reset-boundary/1',
                selector: '#reset',
                targetId: 'reset',
                type: 'click',
                isTrusted: true,
                sequence: 8,
                generation: 3,
                capturedAt: '2026-10-19T12:55:51.048Z',
            },
        },
        receivedEvents: [event],
    };
}
describe('reset zero-time observation is bound to the real event, before native time resumes', () => {
    test('same-event zero-time result passes independently from later native advancement', () => {
        expect(checkResetBoundary(resetBoundaryFixture())).toEqual({ pass: true, errors: [] });
    });
    test.each([
        [
            'e330 asynchronous observation is not the reset boundary',
            (r: any) => (r.observations.reset.logicalTime = 0.0714000000001397),
        ],
        ['missing boundary', (r: any) => delete r.observations.resetBoundary],
        ['wrong target', (r: any) => (r.observations.resetBoundary.targetId = 'replay')],
        ['wrong selector', (r: any) => (r.observations.resetBoundary.selector = '#replay')],
        ['untrusted observation', (r: any) => (r.observations.resetBoundary.isTrusted = false)],
        ['untrusted application event', (r: any) => (r.observations.reset.events.at(-1).isTrusted = false)],
        ['stale generation', (r: any) => (r.observations.resetBefore.generation = 3)],
        ['stale sequence', (r: any) => (r.observations.resetBefore.sequence = 8)],
        ['wrong event sequence', (r: any) => r.observations.resetBoundary.sequence++],
        ['wrong event generation', (r: any) => r.observations.resetBoundary.generation++],
        ['missing received event', (r: any) => (r.receivedEvents = [])],
        ['duplicate received event', (r: any) => r.receivedEvents.push(r.receivedEvents[0])],
        ['missing reset session', (r: any) => r.observations.reset.events.shift()],
        ['capture before event', (r: any) => (r.observations.resetBoundary.capturedAt = '2026-10-19T12:55:50.000Z')],
        ['nonzero range', (r: any) => (r.observations.reset.rangeValue = 1)],
        ['nonzero pose', (r: any) => (r.observations.reset.poses[0].position[0] += 0.01)],
    ])('rejects %s', (_name, change: any) => {
        const row = resetBoundaryFixture();
        change(row);
        expect(checkResetBoundary(row).pass).toBe(false);
    });
});

describe('audio cue records use the same raw context clock sample as their activation', () => {
    function cueBlock(): string {
        const ts = require('typescript');
        const file = path.join(__dirname, '../../examples/interactive-timeline/src/main.ts');
        const source = fs.readFileSync(file, 'utf8');
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const advance = ast.statements.find((n: any) => ts.isFunctionDeclaration(n) && n.name?.text === 'advanceScene');
        const block = advance.body.statements.filter(
            (n: any) => ts.isIfStatement(n) && n.getText(ast).includes('cueRecords.push'),
        );
        expect(block).toHaveLength(1);
        return block[0].getText(ast);
    }
    function execute(block: string): any {
        let reads = 0;
        const context = {
            get currentTime() {
                return 0.56 + reads++ * (256 / 44100);
            },
        };
        const result = new Function(
            'ctx',
            `
            let mode='audio',audioPlaying=true,audioPaused=false,audioTime=0,lastAudioTime=-1;
            const audioToken={isCurrent:()=>true},origin=0.15,buffer={duration:16.2},CUES=[0.4];
            const cueNodes=[{active:false}],cueRecords=[],scope={generation:3},cc={director:{getTotalFrames:()=>9}};
            ${block}
            return {audioTime,cueRecords,active:cueNodes[0].active};
        `,
        )(context);
        return { ...result, reads };
    }
    test('actual advanceScene cue block reads once and preserves exact activation/origin relation', () => {
        const result = execute(cueBlock());
        expect(result.reads).toBe(1);
        expect(result.active).toBe(true);
        expect(result.cueRecords).toHaveLength(1);
        const cue = result.cueRecords[0];
        expect(cue.nodeActivationTime).toBe(cue.contextTime - cue.origin);
        expect(cue.nodeActivationTime).toBe(result.audioTime);
    });
    test('old independent getter receipt reproduces the retained two-quantum failure without changing tolerance', () => {
        const block = cueBlock().replace(
            '                    contextTime,',
            '                    contextTime: ctx.currentTime,',
        );
        expect(block).not.toBe(cueBlock());
        const result = execute(block),
            cue = result.cueRecords[0];
        expect(result.reads).toBe(2);
        expect(Math.abs(cue.nodeActivationTime - (cue.contextTime - cue.origin))).toBeGreaterThan(0.004);
        expect(cue.nodeActivationTime - (cue.contextTime - cue.origin)).toBeCloseTo(-0.005804988662131194, 12);
    });
});
