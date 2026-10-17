/** CPU control-flow regressions for the real example functions, not media playback evidence. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../examples/video-basic/main.js'), 'utf8');
function exampleFunction(name, dependencies) {
    const start = source.indexOf(`async function ${name}(`);
    const end = source.indexOf('\n// ----------------------------------------------------------------', start);
    assert.ok(start >= 0 && end > start, `locate actual example function ${name}`);
    return new Function(...Object.keys(dependencies), `return (${source.slice(start, end)});`)(
        ...Object.values(dependencies),
    );
}

test('LOCAL source readiness ignores the previous REMOTE metadata event', async () => {
    const eventLog = [];
    const before = {};
    const remote = { readyState: 1 };
    const local = { readyState: 0 };
    let resourceType = 'LOCAL';
    let remoteURL = '';
    const player = {
        nativeVideo: before,
        get resourceType() {
            return resourceType;
        },
        set resourceType(value) {
            resourceType = value;
            this.nativeVideo = value === 'REMOTE' ? null : local;
        },
        get remoteURL() {
            return remoteURL;
        },
        set remoteURL(value) {
            remoteURL = value;
            this.nativeVideo = remote;
            eventLog.push('meta-loaded');
        },
    };
    const initialHits = [];
    const results = {};
    const run = exampleFunction('p6SourceSwitch', {
        player,
        eventLog,
        results,
        clip: { nativeUrl: 'clip.mp4' },
        CLIP_URL: 'clip.mp4',
        VideoPlayer: { ResourceType: { REMOTE: 'REMOTE', LOCAL: 'LOCAL' } },
        domVideos: () => (player.nativeVideo ? [player.nativeVideo] : []),
        document: { contains: () => false },
        status: {},
        waitFor: async (predicate) => {
            const hit = predicate();
            initialHits.push(hit);
            if (hit) return 0;
            local.readyState = 1;
            eventLog.push('meta-loaded');
            return predicate() ? 20 : -1;
        },
    });
    await run();
    assert.deepEqual(initialHits, [true, false]);
    assert.equal(results.p6SourceSwitch.backToLocalWithinMs, 20);
});

test('LOCAL metadata timeout rejects instead of continuing with an old callback', async () => {
    const eventLog = ['meta-loaded'];
    const results = {};
    const player = { nativeVideo: { readyState: 0 }, resourceType: 'REMOTE', remoteURL: 'clip.mp4' };
    const run = exampleFunction('p6SourceSwitch', {
        player,
        eventLog,
        results,
        clip: { nativeUrl: 'clip.mp4' },
        CLIP_URL: 'clip.mp4',
        VideoPlayer: { ResourceType: { REMOTE: 'REMOTE', LOCAL: 'LOCAL' } },
        domVideos: () => [player.nativeVideo],
        document: { contains: () => false },
        status: {},
        waitFor: async (predicate) => {
            assert.equal(Boolean(predicate()), false);
            return -1;
        },
    });
    await assert.rejects(run(), /Replacement LOCAL video did not load metadata/);
    assert.equal(results.p6SourceSwitch, undefined);
});

function loopFixture({
    stuckSeek = false,
    unlandedSeek = false,
    stalledPlayback = false,
    loopWorks = true,
    pauseAfterWrap = false,
} = {}) {
    const video = { currentTime: 0, seeking: false, paused: true, ended: false, readyState: 4 };
    const calls = [];
    let seekTicks = 0;
    let seekTarget = 0;
    let overlappingPlay = false;
    let clock = 0;
    let wrapPausePending = false;
    const player = {
        nativeVideo: video,
        duration: 3,
        state: 'paused',
        isPlaying: false,
        loop: false,
        get currentTime() {
            return video.currentTime;
        },
        set currentTime(value) {
            const overlapping = video.seeking;
            seekTarget = value;
            video.currentTime = unlandedSeek && value === 2 ? 0 : Math.min(3, value);
            video.seeking = true;
            seekTicks = 2;
            calls.push({ kind: 'seek', value, paused: video.paused, overlapping });
        },
        pause() {
            video.paused = true;
            this.isPlaying = false;
            this.state = 'paused';
            calls.push({ kind: 'pause' });
        },
        play() {
            calls.push({ kind: 'play', loop: this.loop, seeking: video.seeking, currentTime: video.currentTime });
            overlappingPlay = video.seeking;
            video.paused = false;
            this.isPlaying = true;
            this.state = 'playing';
        },
    };
    function tick() {
        clock += 20;
        if (wrapPausePending) {
            video.paused = true;
            player.isPlaying = false;
            wrapPausePending = false;
        }
        if (video.seeking) {
            if ((stuckSeek && seekTarget === 2) || overlappingPlay) return;
            if (--seekTicks <= 0) video.seeking = false;
        } else if (!video.paused && !stalledPlayback) {
            video.currentTime += 0.02;
            if (video.currentTime >= 3) {
                if (player.loop && loopWorks) {
                    video.currentTime = 0;
                    wrapPausePending = pauseAfterWrap;
                } else {
                    video.currentTime = 3;
                    video.paused = true;
                }
            }
        }
    }
    const waitFor = async (predicate, timeout) => {
        const start = clock;
        while (clock - start <= timeout) {
            if (predicate()) return clock - start;
            tick();
        }
        return -1;
    };
    const results = {};
    const status = {};
    const run = exampleFunction('p7Completed', {
        player,
        completedEvents: 0,
        waitFor,
        results,
        num: (value) => value,
        VideoPlayer: { EventType: { PLAYING: 'playing' } },
        status,
        sleep: async (ms) => {
            for (let n = 0; n < ms; n += 20) tick();
        },
    });
    return { run, calls, results, status };
}

test('loop playback begins only after the paused seek has settled', async () => {
    const fixture = loopFixture();
    await fixture.run();
    assert.equal(fixture.calls.filter((call) => call.kind === 'play' && !call.loop).length, 1);
    const plays = fixture.calls.filter((call) => call.kind === 'play' && call.loop);
    assert.equal(plays.length, 1);
    assert.equal(plays[0].seeking, false);
    assert.equal(plays[0].currentTime, 2);
    assert.equal(fixture.calls.find((call) => call.kind === 'seek' && call.value === 2).overlapping, false);
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, true);
    assert.equal(fixture.results.p8Loop.completedDeltaDuringLoop, 0);
});

test('an unsettled loop seek cannot start playback or report a loop', async () => {
    const fixture = loopFixture({ stuckSeek: true });
    await fixture.run();
    assert.equal(
        fixture.calls.some((call) => call.kind === 'play' && call.loop),
        false,
    );
    assert.equal(fixture.results.p8Loop.seekSettledWithinMs, -1);
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, false);
    assert.equal(fixture.status.string, 'video loop failed');
});

test('a playing state with a stalled media clock is not a successful loop', async () => {
    const fixture = loopFixture({ stalledPlayback: true });
    await fixture.run();
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, false);
    assert.equal(fixture.status.string, 'video loop failed');
});

test('playback that reaches the end without wrapping still fails', async () => {
    const fixture = loopFixture({ loopWorks: false });
    await fixture.run();
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, false);
    assert.equal(fixture.status.string, 'video loop failed');
});

test('a transient loop reset followed by a pause is not continuous playback', async () => {
    const fixture = loopFixture({ pauseAfterWrap: true });
    await fixture.run();
    assert.ok(fixture.results.p8Loop.wrapWithinMs >= 0);
    assert.equal(fixture.results.p8Loop.continuedAfterWrapWithinMs, -1);
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, false);
});

test('a low stale time during an unfinished seek is not mistaken for a wrap', async () => {
    const fixture = loopFixture({ stuckSeek: true, unlandedSeek: true });
    await fixture.run();
    assert.equal(fixture.results.p8Loop.seekSettledWithinMs, -1);
    assert.equal(fixture.results.p8Loop.wrappedBelowSeekTarget, false);
    assert.equal(fixture.status.string, 'video loop failed');
});
