# Fixed-snapshot example evidence campaigns

This workflow collects genuine browser results in small, bounded attempts, then publishes one complete, strictly validated campaign. A subset is never a release PASS. The current ordinary-browser scope is **182 examples and 183 sessions**, including the extra interactive-geometry mode. Scope is derived from independent discovery of all example specifications, matched one-to-one against the live manifest before filtering DevTools, rather than a permanent numeric allowlist. Every non-DevTools example and every declared mode must be present; deleting an ID from the manifest or changing only its DevTools flag cannot shrink the campaign. A missing entry page is an error, not a reason to skip its example.

The five historical `requiresDevTools` examples remain a separate contract, collected by `tools/verify/devtools-examples.cjs`. Their evidence neither fills ordinary-browser gaps nor becomes current merely because the ordinary campaign passed.

## Before freezing

1. Finish the runtime, SDK, example, dependency, validator, collector, supervisor, and consumer changes. Run the focused CPU tests, including their negative controls.
2. Format all edited source and tooling with the repository's Prettier configuration, then check the same paths. Do this **before** freezing or collecting evidence. Do not format generated evidence, extracted source, or third-party assets. Formatting after capture changes source bytes and invalidates the freeze.
3. Install actual project dependencies with `npm ci` in a clean checkout, or the repository's documented install procedure in an existing worktree. `node_modules` must be a real dependency directory for declaration generation. Do not substitute a symlink to another checkout to make declaration generation appear successful.
4. Build the current main runtime, its declarations, and the separate Spark runtime/declarations. Keep the real exit codes and logs; an existing build file does not establish a fresh build.

   ```bash
   npm run build:all
   npm run build:spark
   ```

   Runtime builds advance the build counter. Rebuilding after freezing changes the candidate and requires a new campaign. Spark is a separate shipped artifact and must not be omitted from build or fingerprint checks.

5. This bounded evidence collector requires Linux with `/proc` and Python 3 standard-library support for the process-local child-subreaper and private inherited-pipe custody protocol. This requirement applies to the collector, not to the browser runtime SDK. Preflight must identify the real interpreter and helper bytes and reject unsupported custody; there is no polling-only fallback.

6. Check browser tooling before consuming a browser budget: Playwright must resolve in the authorized tooling environment, its selected browser binary must exist, and the browser executable/version must match the identity recorded by the freeze. Installing project npm dependencies alone does not install that browser. Check local references with the collector's workspace preflight; cross-example imports, shared modules, recipe dependencies, assets, and served build inputs must resolve without rewriting source imports or flattening their layout.

   This CPU-only preflight validates every non-DevTools workspace without launching a browser or writing canonical evidence:

   ```bash
   node - <<'NODE'
   const fs = require('fs');
   const path = require('path');
   const workspace = require('./tools/verify/example-workspace.cjs');
   const root = process.cwd();
   const inputs = workspace.listWorkspaceInputs(root);
   const manifest = JSON.parse(fs.readFileSync('examples/files.json', 'utf8'));
   for (const example of manifest.examples.filter((entry) => !entry.requiresDevTools)) {
       workspace.validateReferences(root, example, inputs);
   }
   for (const name of ['cocosair.module.js', 'cocosair.module.js.map', 'cocosair.module.min.js', 'cocosair.module.min.js.map', 'cocosair.module.d.ts', 'spark.module.js', 'spark.module.js.map', 'spark.module.d.ts']) {
       const file = path.join(root, 'build', name);
       const stat = fs.lstatSync(file);
       if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw Error('Invalid build input: ' + file);
   }
   console.log('Workspace dependencies and required build files are present.');
   NODE
   ```

The freeze records the complete input inventory and SHA-256 hashes, exact ordered scope/modes, browser identity, main and Spark build artifacts and declarations, collection tooling, both CI workflows, contracts, and bounded execution limits. Only `promotion` fields in specification/manifest metadata receive publication-specific normalization. Their original raw hashes and values are also retained. Status, manifest generation time/revision, and all other metadata remain part of the immutable input contract.

## Freeze, collect, and retain every attempt

Use one new directory outside the repository for each campaign. Keep the freeze, raw reports, receipts, stdout/stderr, screenshots, response-body CAS, attempt records, segments, and merged output under that directory. Do not reuse an existing attempt directory.

```bash
CAMPAIGN=/absolute/external/path/to/new-example-campaign
node tools/verify/example-evidence-campaign.cjs freeze \
    --out="$CAMPAIGN/freeze.json"

node tools/verify/run-example-evidence-campaign.cjs \
    --freeze="$CAMPAIGN/freeze.json" \
    --id=html-texture-experimental \
    --out="$CAMPAIGN/attempts/html-texture-experimental/1" \
    --execute-authorized
```

`--execute-authorized` records the caller's already-obtained execution authorization; the flag is not a replacement for permission. The freeze command identifies the browser but does not run the example suite. The orchestrator runs **one** exact frozen ID per invocation, covering that ID's declared modes, and never promotes metadata or overwrites canonical evidence. Repeat it for every frozen ID using small, deterministic, serial batches. Do not launch the next attempt until the preceding supervisor has confirmed physical closure.

The supervised collector fixes `ESBUILD_WORKER_THREADS=0` before the first esbuild load and records the actual mode in its observer receipt. Its synchronous build/transform calls then use esbuild's synchronous subprocess path, which waits for the compiler and collects its pipes before returning. The default synchronous API internally starts a persistent, unreferenced worker-thread service; merely awaiting `esbuild.stop()` does not prove that service has exited. Do not substitute a mode that can leave a compiler child behind, ignore a zombie, or relax forced-closure validation. Real compiler output-equivalence and process-lifecycle controls cover this constraint.

The supervisor bounds original invocation-to-readiness, native-frame readiness (or the UI shell's explicit DOM readiness), attempt duration, graceful close, abort, and final stop. Receipts identify the real worker and browser PID/start identity/namespace, native exit and stdio close, and the in-worker HTTP server's listen/close events. A fabricated server process, a timeout flag without physical closure, or a matching screenshot alone is insufficient. A Python parent holds process-local child-subreaper custody so a browser descendant cannot evade ownership by creating a new process group. Inner Node receipts stay provisional until all adopted children have been waited, kernel absence is established, and the custodian has genuinely exited and closed its streams. A runtime-close barrier uses private inherited file descriptors and the existing verified parent/worker IPC channel. It blocks a subsequent mode while an adopted child or zombie remains; unexpected identity, sequence, EOF, or missing acknowledgement fails closed. Raw custody receipts, logs, and provisional receipts are retained with hashes. If the worker exits with a custody acknowledgement in flight, retain the failure, drain only within the original barrier and absolute deadlines, and write the provisional failure receipt before closing the private pipes. Cancellation must still interrupt that drain; a late acknowledgement cannot turn a failed worker into a PASS. Unknown ownership, missing close, forced termination, or a startup deadline failure stops the campaign. Do not lengthen timeouts or wait for natural media end to manufacture a PASS.

Owned-process diagnostics are descriptive only. The supervisor records bounded, identity-checked observations at first ownership and on receipt of a runtime stop-begin event, retaining only fixed executable/role/flag enums. It never publishes raw command lines, arbitrary paths, unknown argument values, or hashes of those private values. A disappeared, reused, unreadable, or already-zombie process remains explicitly unknown; a later adopted-child record may be correlated only by its exact namespace, PID, and start ticks. These observations cannot identify a signal sender or turn a signalled child, failed custody barrier, or incomplete attempt into a PASS.

Each attempt and segment is immutable and remains `partial: true`, `completed: false`. Retain the first failed result even if an explicitly admitted same-input retry later passes. An allowed retry uses the next attempt number and a new directory:

```bash
node tools/verify/run-example-evidence-campaign.cjs \
    --freeze="$CAMPAIGN/freeze.json" \
    --id=html-texture-experimental --attempt=2 \
    --out="$CAMPAIGN/attempts/html-texture-experimental/2" \
    --execute-authorized
```

Resume is permitted only while the entire frozen input set and browser/tooling identity still match. **Any source, SDK, example, shared dependency, asset, contract, or collection-tool change requires a new freeze and fresh evidence.** Do not edit a stored fingerprint, copy an old PASS row, delete a failure, lower an example's status, or reinterpret a partial shard as full completion. Retain invalidated campaigns as historical records; they cannot supply rows to the new candidate.

## Strict merge and constrained publication

Merge every segment, including all retries, with the same freeze. The command below obtains a deterministic segment list without dropping earlier attempts:

```bash
SEGMENTS=$(node -e 'const fs=require("fs"),p=require("path"),d=p.join(process.argv[1],"segments"); process.stdout.write(fs.readdirSync(d).filter(n=>n.endsWith(".json")).sort().map(n=>p.join(d,n)).join(","))' "$CAMPAIGN")
node tools/verify/example-evidence-campaign.cjs merge \
    --freeze="$CAMPAIGN/freeze.json" --segments="$SEGMENTS" \
    --out="$CAMPAIGN/merged.json"
node tools/verify/example-evidence-campaign.cjs check \
    --evidence="$CAMPAIGN/merged.json"
```

### Example-owned specialized controls

Declared controlled-step or offscreen-render APIs must be exercised through the example's real controls and checked for their effects, not counted by calling exports from the harness. The ordinary Driver Pilot adapter runs only the frozen default holographic primary session. It preserves the existing 11 API claims and records the exact zero/positive step snapshots, per-frame time/uniform ledger, independent linear-pixel oracle, render-target disposal, actual renderer material restoration, and subsequent native-pacer progress. The shared consumer recomputes this raw protocol and rejects missing, mismatched, or non-driver reuse. This limited session does not replace the dedicated multi-engine Driver Pilot acceptance matrix.

Keep synchronous harness observations inside the API tracer's `observing` guard, restored in `finally`; never hold it across an `await` or around real example actions. Restore the native pacer in `finally` and retain any probe or restoration error as a failure. A newly declared control-only API requires a reviewed executable adapter plus effect assertions and negative tests before collecting a fresh full campaign. Do not delete the claim or manufacture invocation counts to satisfy coverage.

The strict validator checks the complete current scope, unique IDs/attempt numbers, exact modes, frozen input hashes, declared validator coverage, recomputed API proof, screenshots, every recorded served response body, raw collector/receipt/log provenance, and actual process/server closure. Unknown schemas, incomplete coverage, duplicate IDs/modes, changed bytes, absent proof, forced exits, or omitted failed attempts cannot publish. A diagnostic merge with `--allow-partial` remains incomplete and is never publishable.

After the full merged campaign passes review, publish it with:

```bash
node tools/verify/publish-example-evidence.cjs \
    --campaign="$CAMPAIGN/merged.json" --source-dir="$CAMPAIGN"
node tools/verify/example-evidence-campaign.cjs check
npm run verify:example-chain
```

The publisher copies the entire source campaign into `docs/evidence/example-campaigns/<freeze-id>/`, preserving original raw report, receipt, log, PNG, and response-body bytes. It derives canonical artifact paths afresh from the copied immutable attempts. Every dereferenced provenance file must be inside the repository and use portable relative references; deleting the original external campaign must not break verification. Absolute launch/output paths inside an unmodified historical raw receipt describe the capture environment and are not publication artifact references.

Before any canonical mutation, the publisher constructs and validates a complete staged file set with real input copies. Publication may refresh only an **existing** `promotion` field of an example that was already `stable`, deriving the value with `specCommon.promotionOf` from that example's full current result. It changes only the corresponding existing promotion in `examples/files.json`. All statuses, draft promotions, `generatedAt`, `revision`, and every other field remain unchanged. It does not run Gallery manifest regeneration or the legacy promote/demote operation. Its publication manifest binds the exact allowed file delta and resulting raw hashes to the freeze.

Publication is a guarded multi-file transaction, not an assertion that many filesystem writes can be one rename. It retains and fsyncs the exact old bytes of every existing target in a separate staging backup, then writes and fsyncs `docs/evidence/.examples-publication-incomplete.json` with the backup location and before/after hashes. It installs immutable provenance, then atomically replaces individual allowed metadata files. `docs/evidence/examples-verified.json` is the last payload written. The guard is removed only after delivered hashes and normalized inputs verify. Strict consumers fail closed whenever the guard exists, even if an older canonical report remains readable.

If publication is interrupted, stop. Keep the guard, immutable package, and retained staging files. Inspect its listed before/after hashes and restore a consistent pre-publication state or complete a reviewed recovery; **never delete the guard merely to clear a gate**. The publisher refuses automatic retries over an incomplete transaction or an existing immutable package. Do not run the old canonical collector as a workaround.

## CI has two separate checks

1. **Committed-evidence integrity, before builds:** validate the committed campaign, its complete provenance, frozen scope, metadata delta, and byte identity before a CI build replaces the checked-in candidate. The official `tools/build/prepare-package.cjs` may first generate the ignored npm packaging copies from those committed bytes; it must not rebuild or relabel the candidate. This catches stale or hand-edited committed evidence.
2. **Fresh CI evidence, after builds:** build the current main runtime, declarations, and Spark artifacts; create a fresh freeze; run the full bounded campaign; strictly merge and publish it into that checkout. Upload the fresh canonical report and its complete provenance together, including failed attempts and interruption diagnostics. Downstream evidence-dependent tests must read this newly collected candidate's evidence.

Neither layer substitutes for the other. Passing the committed-evidence check does not prove the new CI bundle, and a fresh bundle cannot legitimately reuse committed evidence from its previous build identity. Tests may use clearly labelled synthetic CPU fixtures in disposable directories to verify protocol rejection; these are never production browser evidence.

### Recovering stale committed evidence on an authorized CI runner

If the local environment cannot launch the required browser, `.github/workflows/example-evidence.yml` can collect the committed candidate on an official GitHub runner. It checks out the exact same-repository PR head (or the explicit workflow-dispatch revision), has read-only repository permissions and no persisted checkout credentials, and never pushes changes. It installs real dependencies and runs the official package-copy preparation without rebuilding the SDK. All tracked build hashes are recorded before preparation and checked afterward and after collection; source-map and generated-source preflight must also pass.

A clean checkout does not contain the ignored `output/spark-runtime-tree-manifest.json` receipt. Before preflight, both workflows snapshot the three committed Spark generated-source files, run the official `tools/build/spark-runtime-tree.cjs` generator, and require all three original SHA-256 values plus the tracked Git diff to remain unchanged. This legitimately regenerates the missing receipt; it does not authorize updating or silently repairing a stale generated source. Never hand-write the receipt or rely on a local ignored output cache being present on CI.

The runner creates its own fresh browser/Python freeze. It first collects HTML, shader-driver, and Spark pilots, with genuine closure and strict admission after each, then collects the remaining exact frozen scope. Every invocation retains the same bounded supervisor and an external 174-second TERM /178-second KILL deadline. The 90-minute job records its budget before checkout and dependency installation; collection stops starting attempts before its 80-minute deadline, reserving time for publication and artifact upload. A failure retains partial originals and prevents publication. Only a successful strict full publication produces the new publication artifact; a failed run must not label the old canonical files as its result.

Download and independently validate the complete portable publication, its exact committed candidate identity, and the permitted promotion-only delta before applying it to the branch. Submit those verified files normally. Do not use this recovery workflow to bypass the quality workflow's committed-evidence gate or to import evidence from rebuilt, different SDK bytes. The next quality run still performs its independent fresh-build collection and full tests.

## Auxiliary GPU mismatch diagnostics

The Driver Pilot collector may retain a separate diagnostic replay after its original pixel readback. It must preserve the original pixels, sample locations, dimensions, tolerance, validator failure, and API proof. A replay is interpretable only after the unchanged submitted shader, copied uniform data, and draw state reproduce every original sample byte exactly. Instrumented UV, SDF, and transition values are auxiliary observations from a separately compiled program, never replacement acceptance pixels or evidence that the original compiler evaluated every intermediate identically. Restore all touched GL state and dispose temporary resources; retain diagnostic failures and limitations. Do not hide original GL errors, alter example behavior, or relax a pixel oracle to clear a collection gate.

A process may first be observed by `/proc` between fork and detached process-group
creation. Preserve that first observation. A later exact browser-spawn event may
prove the same PID/start-ticks/namespace became its own group leader, provided
its embedded initial identity and detached group match and the spawn precedes
group observation. Retain every previously known group member and require all
exact disappearance events before group-empty. Missing, mismatched, or late
leader proof must fail; never rewrite an old receipt to repair its verdict.

## Shutdown signal diagnostics

A signaled adopted process remains a failed campaign attempt under the current
custody contract. Chromium can send SIGTERM during normal child-host shutdown,
but source code, a GPU process-name hint, or temporal proximity alone does not
identify the sender of a particular signal. Keep historical failures unchanged.

The separate shutdown-trace probe runs outside the existing outer supervisor.
It never replaces the browser executable or inserts a process into the
Python-to-inner-Node custody channel. Its reports are diagnostic-only with
`canonicalEligible: false`; they cannot be merged or published as example
evidence. The ordinary campaign uses another fresh freeze and all original
182-example / 183-session admission rules.

Run the parser tests first. The official runner then makes one non-privileged,
self-spawned strace availability probe. A ptrace restriction is a diagnostic
failure: do not change sysctl, capabilities, seccomp, sandbox flags, or security
settings to enable tracing. Never retry a denied local probe through escalation.
Known-sender CPU controls must retain the original positive and negative
verdicts, exact exit/stdio-close receipts, and kernel ECHILD before browser
diagnostics can start.

The tracer wrapper also has two explicit real-process CPU cancellation controls:
TERM delivered to that wrapper and a parser input-limit cancellation. These must
remain failed diagnostics while proving outer/custodian/inner identity-linked
closure, adopted-process reaping and absence, final ECHILD, and tracer
exit/stdio-close plus FIFO EOF. Their retained originals are uploaded separately;
a missing pending receipt cannot satisfy ordinary campaign admission. The live
control suite receives the original global deadline, reserves its full two-case
budget before starting, and rechecks 180 seconds of remaining time before each
case. A failed case must finish cleanup before the suite stops; it must never
start its next case while the failed case has unknown closure. A failure
to prove closure stops the job before any target browser. These controls do not
establish safety after a wrapper or parent SIGKILL; missing closure in that case
is UNKNOWN and stops the job.

Only an explicit signal/wait syscall list and selected signal deliveries are
observed. Persist fixed numeric identities, signal and result enums, and bounded
filtered records. Do not retain raw argv, environment values, arbitrary text,
or address contents. Mark filtered traces as such rather than calling them
complete raw strace logs. Bind sender and target to their exact PID namespace,
start ticks and executable-image observations; ambiguous or missing links stay
UNKNOWN. Process-role hints are not executable authentication.

Each diagnostic keeps the original attempt deadlines. The whole diagnostic
phase is bounded to the lesser of 600 seconds and the remaining original job
budget, with one untraced target control and at most
six traced target attempts. Do not start another target with fewer than 180
seconds remaining; stop after the first complete attribution, otherwise retain
UNKNOWN. At least one complete untraced/traced target pair is required; an
unexecuted or half-finished pair cannot satisfy the diagnostic preflight. Keep
every attempt, including failed and untraced results. Any missing
physical closure, output overflow, timeout, ptrace failure, or incomplete trace
ends the diagnostic phase and prevents the ordinary campaign from starting.
No count of successful repeats can erase an earlier failed attempt.
