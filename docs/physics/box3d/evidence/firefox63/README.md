# EX01 actual Firefox run, limited observation

This is the first real cloud Firefox158.0.1 run after fixing native identity decoding. It exercised normal production ESM208, the real Box3D WASM backend, 100-brick reset, Sphere/Capsule automatic shots, manual Capsule launch, one upper-brick pick/drag, pause and close. It is not formal EX01/Gate completion.

Run `python3 verify-raw.py` here to check every stored evidence byte. The two `.json.gz` files decompress to the exact original exports with lengths and SHA256 in `manifest.json`. No historical static pending labels were edited. `review.json` separates independent export checks from actual UI observations.

Pause is supported by 196 samples across frames1710..4528 at nativeStep1357, followed by the retained close-export samples. The top-level close frame is18768; latest sample frame18756 is not the same field. Close receipt is released with no pending/failures; module/world preparation cleanup released and diagnostic reads explicitly DISPOSED. Runtime, scheduler, builtin resources and shared asset caches remain retained. GPU bytes and post-close native bytes were not measured by this export, so this is not a whole-app zero-allocation claim and does not replace historical close7/8 RED.

The first export has647 finite-transform samples; full-span minimum geometry Y is -0.023m, latest -0.0015m, with no configured below-floor flag. This is sampled evidence, not a continuous collision/penetration proof. The unshot reset wall's155 running samples cover native269..885 with zero displaced bricks and no projectiles, ending awake0. The actual wall-clock wait over15 seconds does not prove15 seconds of native integration. One drag-selected event identifies Brick-1-096, but the exported lastSubmission is an attempted hook call rather than a standalone native completion certificate.

The second1200-sample ring buffer no longer retains early wall/drag observations; both original exports are required. The screenshot is the genuine post-close retained final frame, with disposed diagnostics, not a live running-world screenshot. All2128 formal cells and nine Gates remain NOT_RUN; Hull, full EX01 resource cycling and other original requirements remain incomplete.

Format correction: the original filename `ex01-source63-after-close.png` is retained for provenance, but its actual bytes are JPEG/JFIF (1188×848, no EXIF), not PNG. Source65 incorrectly called the format PNG; this correction changes no screenshot byte or hash.
