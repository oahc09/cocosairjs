# DOM audio cancellation and stop completion

The follow-up [readiness and request contract](../manual/audio-readiness-ownership.md) adds load cancellation,
bounded metadata waits and source-local playback requests. The limits below describe the original PR3 scope,
not a claim that the follow-up or original products passed browser acceptance.

`AudioSource.stop()` retains its `void` signature, including TypeScript subclasses that override it.
`AudioSource.stopAsync(): Promise<void>` adds a DOM-only completion boundary. For DOM audio, both methods cancel
playback requested before that call; `stopAsync` never waits for or invents a `STARTED` event.

```ts
let playbackEpoch = 0;
function play(source: AudioSource): void {
    ++playbackEpoch;
    source.play();
}
async function stop(source: AudioSource): Promise<void> {
    const epoch = ++playbackEpoch;
    await source.stopAsync();
    if (epoch !== playbackEpoch) return; // A later user command owns the source now.
    // The current stop completed. A test may additionally assert state/time and native media.
}
```

## Completion contract

- For DOM audio, `pause`, `stop`, and `destroy` reach the original native element synchronously,
  even when its `play()` promise is pending. Stop rewinds to zero; pause preserves position.
- Superseded PAL play promises reject with `AbortError`. Their late native fulfilment/rejection
  cannot mutate a newer play or emit a stale `STARTED`. Cancellation is internally observed so
  fire-and-forget PAL calls do not create unhandled cancellation rejections.
- A stop during clip loading clears earlier queued playback and resolves without waiting for
  the load. The clip may become ready later, but it needs a subsequent `play()` to start.
- Stops with no clip/player, repeated stops, and stops after destruction resolve. A backend
  failure rejects `stopAsync`; legacy `stop` observes it and emits an engine warning.
- The promise covers commands preceding its call. `const stopped = source.stopAsync();
source.play(); await stopped;` does **not** establish that the later play is stopped.
  Callers coordinating cancellation should retain their own request epoch and time bound.
- Other loaded backends reject `stopAsync` with `error.code === 'AUDIO_STOP_ASYNC_UNSUPPORTED'`
  before changing playback. Before loading, only an explicit DOM clip load mode is accepted.
  A WebAudio request that later falls back to DOM is supported only after the actual DOM player
  exists. Legacy `stop()` retains its existing WebAudio queue behavior, without a new completion
  guarantee. The shared queue may still coalesce operations; this PR does not fix that backend.
- Only `NotAllowedError` installs gesture-retry listeners on the selected canvas. Actual native
  success completes a retry. Cancellation removes listeners; `AbortError` never schedules replay.
- Valid clip replacement tears down the previous player immediately. Load generations distinguish
  A→B→A requests even if A is the same `AudioClip` object. Invalid clips retain previous behavior.

## Verification and limits

`test/smoke/audio-cancellation.test.ts` runs actual engine classes against explicit CPU media and
promise doubles. It covers cancellation, late callbacks, gesture retries, EOS ordering, same-player
manager races, public stop completion, clip-load ownership, destruction, and one-shot cancellation.
It does not establish native browser playback, audible output, or product acceptance.

The frozen public PAL source is unchanged. `tools/build/audio-cancellation-patch.cjs` applies the
DOM-only adaptation during `node tools/build/pal-source.cjs --write`; `--check` verifies reproduction.
The shared operation queue, WebAudio, and video implementation are not modified.

The historical WebKit delayed native promise and product 27 epoch5 PLAYING/time0 without ENDED
remain distinct observations. These regressions do not establish their browser-level cause or
upgrade the historical game/A-B runs to passing. Existing game cancellation checks require an
explicit adoption of the completion contract; dropping their epoch or 250 ms checks is not valid.

There is also a known application-protocol gap: a real native EOS can occur before the native
play promise acknowledges startup. The current source then emits a genuine `ENDED` without
inventing a late `STARTED`. An application lane that requires `STARTED` before accepting `ENDED`
can remain pending and coalesce later cues. Public events currently carry only the source, not
an application-mappable playback token. `stopAsync` does not solve this natural-completion
protocol; applications must not simply accept an unmatched `ENDED`. A request-identity and
terminal-completion protocol needs separate design and review. The cancellation tests do not
establish compatibility or acceptance of the historical game lanes.

## Standalone browser regression

After `npm run build:all`, run the bounded WebKit harness with resolvable Playwright tooling:

```sh
REVIEW_TAG=unique-run FULL=0 AUDIO_QA_OUT=output/audio-cancellation \
  node tools/verify/audio-cancellation/supervise.cjs
```

`AUDIO_QA_WEBKIT` can select the environment's verified WebKit executable. `AUDIO_QA_A` and
`AUDIO_QA_B` can select two existing local WAV files; defaults use the repository's tone fixture.
The server is loopback-only, supports byte ranges, and uses only the isolated worktree bundle.
The supervisor enforces a 15-second launch-to-ready/frame watchdog and a 179-second outer bound,
records actual browser/server/reviewer process exit and stdio close events, and never treats a
missing receipt as success. `SUPERVISOR_CPU_TEST=1` exercises both process roles without a browser.

The native context checks early stop, repeated same-source playback, pause/resume, six natural-EOS
replays, rapid clip replacement, original-media release, and public scene disposal. Two separate
contexts explicitly inject one `NotAllowedError` each to check gesture cancellation/recovery.
Those injections are labelled; they are not evidence that the real browser denied autoplay.
Snapshots retain original native element IDs, promise timing, media events, and sampled clocks.

The quality workflow also runs this harness after the existing full browser matrix, using the
repository's 1.6-second tone WAV and the pinned Playwright installation. It uploads its raw reports,
process receipts, and screenshots even on failure. Browser ownership matches the exact configured
executable (the default Playwright path or an explicit wrapper), not a filename substring.
Post-stop observations extend past the original media's predicted EOS plus a margin; the actual
stop fence remains 250 ms. This bounded regression accepts fixtures up to five seconds long.
