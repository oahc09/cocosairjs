# EX09 gift workshop — source checkpoint

This checkpoint is a new formatting revision of the delivered workshop source, retaining five unchanged JSON contracts and the additive read-only committed-motion export button. It contains no SDK runtime, native binaries, dependency installation, browser artifacts, or original upstream Git history.

## Runtime and candidate boundaries

The default, non-candidate page previously received a **limited SDK 222 post-close visibility smoke**. That is historical evidence, not a fresh test of this repository branch or complete business acceptance. The transport candidate remains pinned to **SDK 220**, and the separate historical contact candidate remains pinned to **SDK 217**. Both original JSON locks are unchanged. Do not edit their build numbers or hashes to make SDK 222 pass candidate admission. Three-order gameplay, native/backend qualification, and full BIZ acceptance are not asserted by this checkpoint.

The server requires an explicitly supplied, existing runtime directory via `BOX3D_RUNTIME`; there is no machine-specific default path. For default-page SDK 222 smoke, supply the separately verified SDK 222 runtime and do not enable candidate query flags. Candidate modes require the exact runtime and manifest hashes in their respective locks. A mismatch deliberately rejects rather than falling back.

## Local commands

From the repository root, with the existing root development dependencies installed (`esbuild` is already locked to 0.28.2):

```sh
node --test tools/verify/box3d/gift-workshop/committed-motion-export.test.mjs
node --test examples/box3d-gift-workshop/tests/idle-boundary.test.mjs
BOX3D_RUNTIME=/absolute/path/to/verified/runtime node examples/box3d-gift-workshop/serve.cjs
```

The server binds only to `127.0.0.1` (default port 7469), mounts the supplied runtime read-only, and transforms the example TypeScript in memory. It does not build the engine, copy artifacts, or install watchers. Runtime files must include `cocosair.module.js` and the `physics/box3d/st` manifest/module/WASM/facade/distribution receipt expected by `/identity.json`. Supplying a runtime does not grant it qualification.

## Tests and provenance

Fresh isolated CPU/VM controls on Node 24.22.1 and lock-verified esbuild 0.28.2 pass 6/6 committed-motion export tests and 9/9 idle-boundary tests. The TypeScript transform is syntax/transpile coverage only, not an engine build or typecheck. No fresh browser, full SDK build, or native test was run for this checkpoint.

The export test originally used `git show` against a local recovered snapshot that does not exist in upstream history. Its portable version compares SHA-256 digests of the exact same five baseline byte strings, with unchanged handler/HTML removal and behavioral assertions. Original test text, exact baseline digests, local-snapshot provenance, and fresh logs are retained under `tools/verify/box3d/ex09-checkpoint-20261025/`. No original Git ancestry is fabricated.

The export button reads the guarded committed-motion observer once per click. It does not pause, step, flush, or mutate physics. Unknown pending-write state stays unknown; running, enabled-system, and stale-scope reads reject. An exported snapshot is not proof that the SDK has no pending writes.

## New formatting revision — no historical acceptance transfer

Five delivered example files were formatted with the authoritative repository configuration and Prettier 3.9.9: `index.html`, `mechanical-selection.json`, `src/hinge-door.mjs`, `src/recovery-fixtures.mjs`, and `src/report-export.mjs`. The export test was migrated to the purpose-based `tools/verify/box3d/gift-workshop/` directory and formatted. The original 54-file candidate and D delivery remain historical snapshots; **their fingerprints and browser/D results do not qualify this new revision**. The 217/220 runtime locks and all five contracts are unchanged. No fresh browser or SDK build was performed.

The migrated test pins original delivered HTML and report-export fixture bytes by SHA-256. On the original HTML it performs the unchanged two-line removal and checks the original baseline hash; it then proves current HTML is exactly Prettier 3.9.9 output of that original. The report fixture first matches its original baseline SHA, then its formatter output must equal the current file. The original main/observer/server baseline checks are unchanged. Historical baseline constants were not replaced with current hashes.

The three formatted JavaScript modules have identical esbuild 0.28.2 output under explicit whitespace normalization, with identifier and syntax minification disabled. Parsed mechanical JSON is deeply equal. The initial default esbuild pretty-output comparison retained a source newline and differed; that limitation is retained in the equivalence report. These are narrow format-equivalence proofs, not physics or browser acceptance. Fresh 6/6 export and 9/9 idle CPU tests pass for this revision. Raw results and equivalence hashes are under `tools/verify/box3d/gift-workshop/evidence/format-revision/`; older checkpoint logs are retained separately and not relabelled.
