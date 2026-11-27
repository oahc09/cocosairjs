# Runtime performance: startup baseline

Separate from the frozen Agent benchmark. This first slice (G0 / G1 diagnostic)
measures an empty clear (S01) and a clickable unlit cube (S02) through a fresh
browser process, a loopback HTTP navigation, and a real production-bundled npm
consumer. The catalog reserves all 24 case IDs; only S01/S02 are implemented.
There is no hardware ranking or release gate in this tool.

## Reproduce

From an isolated, clean checkout with repo dependencies installed, run
`npm run build:all` (writes JS, declarations, npm copies and increments the
build counter). Pack with `npm pack --ignore-scripts --pack-destination <dir>`
only after that succeeds. If the build changed only the counter, restore that
counter in the isolated checkout before planning; retain the emitted SDK bytes and
the build log. Do not reset or stage generated artifacts.

Prepare three isolated npm installation roots under `<inputs>`: `air` with
the AIR tarball and `three-frozen`/`three-current` with the exact Three.js
tarballs 0.186.1 and 0.187.0 respectively. Use offline local installs with
`--ignore-scripts`; each directory must contain a lockfile and node_modules.
Use resolvable Playwright and pngjs (pngjs only for the correctness run).
Pass an installed browser executable if required; no flags relax its safety
settings. Plan, build and run do not download packages or browser binaries.

```sh
CLI=tools/benchmark/runtime-performance/cli.cjs
node "$CLI" plan --campaign startup-001 --out /tmp/startup-001.json
node "$CLI" build --manifest /tmp/startup-001.json --inputs <inputs> --out /tmp/startup-apps-001
node "$CLI" doctor --browser webkit --executable <WPE-wrapper> --out /tmp/startup-doctor-001.json
node "$CLI" run --manifest /tmp/startup-001.json --artifacts /tmp/startup-apps-001 \
  --browser webkit --executable <WPE-wrapper> --mode correctness --out /tmp/startup-correctness-001
node "$CLI" run --manifest /tmp/startup-001.json --artifacts /tmp/startup-apps-001 \
  --browser webkit --executable <WPE-wrapper> --samples 3 --out /tmp/startup-diagnostics-001
node --test tools/benchmark/runtime-performance/evidence.test.cjs
```

Each output path must be new. Artifacts carry the input package-lock and bundle
hashes. The production comparison uses the same esbuild target and options.
The AIR min-input arm explicitly picks the already shipped minified entry in
the same installed package. It does not change the package default. JS goes over
gzip on loopback with disk-cache reuse disabled; fresh browser instances do not
flush OS caches. Record raw per-attempt measurements, including failures.
The correctness mode takes independent pixel probes and verifies that a real
click changes the drawn silhouette. Do not use those screenshot-contaminated
timestamps as timing samples. The diagnostic mode does not take screenshots.
A renderer callback is not proof of content presentation; physical-present and
first-content metrics remain null. Device attestation, throttled/warm protocols,
formal A/A or paired statistics, S03–S07 and all runtime/lifecycle arms are open.

## First run: 2026-11-27

Baseline source `9ea3ea951b5b452f2809864ce76b7fca71f37fd6`. Rebuilt dev/min/SDK,
passed the package markers, then installed the resulting npm tarball offline.
WebKit 26.5 WPE, WebGL2 on a GPU-less Linux host; reported renderer string is not
hardware attestation. 8/8 correctness attempts and 24/24 diagnostic attempts
passed the local contracts. These are not physical GPU results or a speed ranking.

| Input            | Package entry raw bytes | Consumer raw bytes | Consumer gzip bytes | Consumer Brotli bytes |
| ---------------- | ----------------------: | -----------------: | ------------------: | --------------------: |
| AIR regular      |               9,191,403 |          5,551,862 |           1,171,424 |               933,162 |
| AIR min input    |               5,808,266 |          5,544,108 |           1,169,922 |               931,069 |
| Three.js 0.186.1 |                 662,772 |            529,155 |             132,708 |               123,086 |
| Three.js 0.187.0 |                 658,900 |            532,136 |             132,831 |               123,456 |

The AIR min bundle looks 37% smaller when compared as raw package entry
files, but the production consumer only saves 1,502 gzip bytes (0.13%).
Do not change the public package entry on the strength of raw file sizes.
Next: identify module and registration closure, then measure opt-in candidates
against this unchanged full entry. No engine optimization or Three.js victory
is claimed.

SHA-256 of the baseline npm tarball:
`e1b5bf3a0371c92996ea6486a18322e489d2edff7c21ad66bf939fcdc92976bf`.
Run manifest: `0e37f860d96a4c9c19cf1120b8e5bdc39fc9e1c7b91e57ec2b3227533626aeb1`.
Artifact index: `43b5912826cf3e677d55ff6ce3e7d9a3388185f1b470604dd38a349b587f6774`.
