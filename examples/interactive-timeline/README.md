# Cancelable motion and WebAudio time

Run `npm run dev -- --example interactive-timeline` from the SDK repository after a build. The page uses the native pacer by default; `?test=1` selects the separate deterministic motion path. The canvas exists before importing the engine.

The 18 original `Node` groups have three position/scale targets. Pause freezes logical motion and camera pose, Resume continues, Reset returns to the first target, and a new target retires the old session. The range has a local 499-second endpoint. Scroll mode reads actual section offsets and document height. This is a new teaching scene, not the original 1188-part/155-stage application.

Audio mode uses a newly authored 16.2-second waveform and 12 cues. Click Play to unlock WebAudio. Its `AudioContext.currentTime` is the animation clock. Pause suspends the existing voice, Replay/Seek replace it, and Mute changes gain while time continues. Browsers without WebAudio display the actual capability error; deterministic stepping does not compensate for missing audio.

`window.__timeline` provides snapshots and an idempotent terminal `release()`. Release retires the session, cancels late callbacks, unbinds listeners/renderers, disconnects audio nodes, returns three owned asset references and closes the application. The [manual](../../docs/manual/interactive-timeline.md) describes current observations and limits; [asset license](assets/LICENSE.md) records waveform provenance.

For package use, follow the generated [consumer kit](../../docs/manual/examples/interactive-kit/README.md). Repository npm commands are not a consumer web server.
