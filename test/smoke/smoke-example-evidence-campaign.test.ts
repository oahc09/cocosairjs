const fs = require('fs');
const path = require('path');
const campaign = require('../../tools/verify/example-evidence-campaign.cjs');
const common = require('../../tools/verify/example-spec-common.cjs');
const {
    fixture,
    attempt,
    segment,
    complete,
    merge,
    check,
    read,
    write,
    clone,
    installSyntheticReceiptValidationSpy,
} = require('../../tools/verify/example-evidence-campaign.cpu-fixture.cjs');

describe('fixed-snapshot segmented example evidence', () => {
    let state;
    let receiptValidationSpy;
    beforeEach(() => {
        receiptValidationSpy = installSyntheticReceiptValidationSpy(jest);
        state = fixture();
    });
    afterEach(() => {
        receiptValidationSpy.mockRestore();
        fs.rmSync(state.temp, { recursive: true, force: true });
    });

    test('exact complete union of three IDs/four modes validates; each raw segment stays partial', () => {
        const data = complete(state);
        expect(data.total).toBe(3);
        expect(data.sessionTotal).toBe(4);
        expect(data.completed).toBe(true);
        expect(check(state, data)).toEqual({ ok: true, errors: [] });
        for (const file of state.segmentFiles) expect(read(file)).toMatchObject({ partial: true, completed: false });
        expect(read(path.join(state.repo, 'examples/alpha/example.json')).status).toBe('stable');
    });
    test('current real manifest includes all 183 examples and 184 ordered modes including Spark and WebGPU', () => {
        const scope = campaign.collectScope(path.resolve(__dirname, '../..'));
        expect(scope).toHaveLength(183);
        expect(scope.reduce((n, e) => n + e.modes.length, 0)).toBe(184);
        expect(scope.some((e) => e.id === 'spark-splats')).toBe(true);
        expect(scope.find((e) => e.id === 'webgpu-basic').modes).toEqual([
            expect.objectContaining({ id: 'primary', query: 'renderer=webgl2' }),
        ]);
    });
    test('production consumers reject the identical synthetic package when the explicit test spy is removed', () => {
        const data = complete(state);
        const first = read(path.resolve(state.artifacts, data.attempts[0].report.path));
        expect(first.receipt.cpuDummy).toBe(true);
        expect(first.receipt.events.every((event) => event.cpuDummy === true)).toBe(true);
        receiptValidationSpy.mockRestore();
        const rejected = check(state, data);
        expect(rejected.ok).toBe(false);
        expect(rejected.errors.join(' ')).toMatch(/CPU dummy receipt is not production evidence/);
    });
    test.each(['screenshot', 'probe', 'scene', 'HTTP prefix'])(
        'final %s cannot replace the immutable pre-close application original',
        (field) => {
            expect(() =>
                complete(state, {
                    alpha: {
                        report(report) {
                            const row = report.result.modeEvidence[0];
                            if (field === 'screenshot') {
                                const replacement = row.artifact.path.replace(/\.png$/, '-substituted.png');
                                fs.copyFileSync(row.artifact.path, replacement);
                                row.artifact = { ...row.artifact, path: replacement };
                            }
                            if (field === 'probe') row.probeContracts = { fabricated: true };
                            if (field === 'scene') row.sceneObservation = { substituted: true };
                            if (field === 'HTTP prefix') row.networkAssets = row.networkAssets.slice(1);
                            report.result.artifact = { ...row.artifact };
                            report.result.networkAssets = clone(row.networkAssets);
                            // Re-seal the genuine raw collector bytes, so rejection depends on the application binding.
                            write(report.receipt.output.report, {
                                completed: false,
                                partial: true,
                                scopePassed: true,
                                results: [report.result],
                            });
                        },
                    },
                }),
            ).toThrow(/pre-close application measurements were discarded or changed/);
        },
    );
    test('UI shell legitimately has zero APIs while still proving declared validators and DOM closure', () => {
        const data = complete(state);
        expect(data.results.find((r) => r.id === 'shell').apiProof).toEqual([]);
    });
    test('missing index cannot silently shrink scope', () => {
        fs.unlinkSync(path.join(state.repo, 'examples/spark-splats/index.html'));
        expect(() => campaign.collectScope(state.repo)).toThrow();
    });
    test.each(['id', 'dir'])('duplicate manifest %s is rejected', (key) => {
        const file = path.join(state.repo, 'examples/files.json');
        const m = read(file);
        m.examples[1][key] = m.examples[0][key];
        write(file, m);
        expect(() => campaign.collectScope(state.repo)).toThrow(/duplicate/);
    });
    test('unknown schema and historical completed:true fail closed', () => {
        for (const value of [
            { completed: true },
            { schema: 'unknown/v9', completed: true },
            { mode: 'spec-driven-v3', completed: true, total: 180 },
        ]) {
            expect(check(state, value).ok).toBe(false);
        }
    });
    test('partial checkpoint outside canonical never becomes complete', () => {
        segment(state, [attempt(state, 'alpha')]);
        expect(() => merge(state)).toThrow(/incomplete/);
        const partial = merge(state, { allowPartial: true });
        expect(partial).toMatchObject({ completed: false, partial: true, remaining: ['spark-splats', 'shell'] });
        expect(check(state, partial).ok).toBe(false);
        expect(() =>
            merge(state, { allowPartial: true, out: path.join(state.repo, 'docs/evidence/examples-verified.json') }),
        ).toThrow();
    });
    test('empty segments rejected instead of vacuous all-pass', () => {
        expect(() => segment(state, [])).toThrow(/empty/);
        expect(() => merge(state)).toThrow(/no segments/);
    });
    test('duplicate segments and duplicate attempt IDs rejected', () => {
        const a = attempt(state, 'alpha');
        segment(state, [a]);
        segment(state, [a]);
        expect(() => merge(state)).toThrow(/duplicate example attempt/);
        state.segmentFiles = [state.segmentFiles[0], state.segmentFiles[0]];
        expect(() => merge(state)).toThrow(/duplicate segment/);
    });
    test('raw segment completed:true rejected even with passing rows', () => {
        const file = segment(state, [attempt(state, 'alpha')]);
        const data = read(file);
        data.completed = true;
        write(file, data);
        expect(() => merge(state)).toThrow(/falsely marked/);
    });
    test('unknown attempt ID rejected', () => {
        const file = segment(state, [attempt(state, 'alpha')]);
        const data = read(file);
        data.attempts[0].id = 'unknown';
        write(file, data);
        expect(() => merge(state)).toThrow(/mismatch|unknown/);
    });
    test('a clean failed first attempt is retained when an explicit same-freeze retry passes', () => {
        segment(state, [attempt(state, 'alpha', { failed: true }), attempt(state, 'alpha', { attempt: 2 })]);
        segment(state, [attempt(state, 'spark-splats'), attempt(state, 'shell')]);
        const data = merge(state);
        expect(data.attempts).toHaveLength(4);
        expect(data.completed).toBe(true);
        const first = path.resolve(
            path.dirname(path.join(state.artifacts, 'completed.json')),
            data.attempts[0].report.path,
        );
        expect(read(first).result.result).toBe('FAIL');
    });
    test('omitting the first failure and starting with attempt 2 is rejected', () => {
        segment(state, [attempt(state, 'alpha', { attempt: 2 })]);
        expect(() => merge(state)).toThrow(/omitted retry/);
    });
    test('a later failure cannot silently select an earlier success', () => {
        segment(state, [attempt(state, 'alpha'), attempt(state, 'alpha', { attempt: 2, failed: true })]);
        segment(state, [attempt(state, 'spark-splats'), attempt(state, 'shell')]);
        expect(() => merge(state)).toThrow(/incomplete/);
    });
    test.each([
        '.github/workflows/format.yml',
        '.github/workflows/example-evidence.yml',
        'build/cocosair.module.js',
        'build/spark.module.js',
        'build/spark.module.d.ts',
        'src/fixture.txt',
        'examples/alpha/src/main.ts',
        'examples/alpha/index.html',
        'tools/recipes/fixture.txt',
        'tools/verify/fixture.txt',
        'tools/benchmark/runner/fixture.txt',
        'tools/debug/fixture.txt',
        'tools/build/fixture.txt',
        'package-lock.json',
    ])('changed frozen input %s rejects reuse', (file) => {
        const data = complete(state);
        fs.appendFileSync(path.join(state.repo, file), '\nstale');
        expect(check(state, data).ok).toBe(false);
    });
    test('new dependency file changes inventory even when old paths still match', () => {
        const data = complete(state);
        write(path.join(state.repo, 'examples/alpha/assets/new.bin'), 'new');
        expect(check(state, data).ok).toBe(false);
    });
    test('symbolic-link inputs fail closed, including unprivileged Windows junctions', () => {
        const link = path.join(state.repo, 'examples/linked-input');
        // Windows file symlinks require extra privileges; a real directory junction exercises the same rejection.
        const windows = process.platform === 'win32';
        fs.symlinkSync(
            path.join(state.repo, windows ? 'tools' : 'package-lock.json'),
            link,
            windows ? 'junction' : 'file',
        );
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
        expect(() => campaign.collectInputs(state.repo)).toThrow(/symbolic/);
    });
    test.each(['status', 'stableReview'])('publication normalization never excludes %s', (key) => {
        const data = complete(state);
        const file = path.join(state.repo, 'examples/alpha/example.json');
        const spec = read(file);
        spec[key] = key === 'status' ? 'draft' : { reason: 'changed' };
        write(file, spec);
        expect(check(state, data).ok).toBe(false);
    });
    test('even promotion-only changes are forbidden during worker collection', () => {
        const file = path.join(state.repo, 'examples/alpha/example.json');
        const spec = read(file);
        spec.promotion = { arbitrary: true };
        write(file, spec);
        expect(() => campaign.assertFrozenInputs(state.freeze, { repo: state.repo })).toThrow(/raw frozen/);
    });
    test('publication allows only derived stable promotion and a recorded exact raw hash manifest', () => {
        const data = complete(state);
        const result = data.results.find((r) => r.id === 'alpha');
        const promotion = common.promotionOf(result);
        const specFile = path.join(state.repo, 'examples/alpha/example.json');
        const spec = read(specFile);
        spec.promotion = promotion;
        write(specFile, spec);
        const manifestFile = path.join(state.repo, 'examples/files.json');
        const manifest = read(manifestFile);
        manifest.examples.find((e) => e.id === 'alpha').promotion = promotion;
        write(manifestFile, manifest);
        data.publication = campaign.buildPublication(state.freeze, data.results, { repo: state.repo });
        expect(check(state, data).ok).toBe(true);
        spec.promotion.candidate = '0'.repeat(16);
        write(specFile, spec);
        expect(() => campaign.buildPublication(state.freeze, data.results, { repo: state.repo })).toThrow(
            /invalid promotion/,
        );
        expect(check(state, data).ok).toBe(false);
    });
    test('changed screenshot bytes reject even after successful merge', () => {
        const data = complete(state);
        const image = path.resolve(state.repo, data.results[0].artifact.path);
        fs.appendFileSync(image, 'changed');
        expect(check(state, data).errors.join(' ')).toMatch(/artifact changed/);
    });
    test('changed HTTP response bytes reject', () => {
        const data = complete(state);
        const file = path.resolve(state.repo, data.results[0].networkAssets[0].bodyArtifact.path);
        fs.appendFileSync(file, 'changed');
        expect(check(state, data).errors.join(' ')).toMatch(/artifact changed/);
    });
    test('changed raw collector, raw receipt, and logs are hash-bound', () => {
        const data = complete(state);
        const a = read(path.resolve(state.artifacts, data.attempts[0].report.path));
        const rawFile = path.resolve(
            path.dirname(path.resolve(state.artifacts, data.attempts[0].report.path)),
            a.rawCollector.path,
        );
        fs.appendFileSync(rawFile, '\n');
        expect(check(state, data).ok).toBe(false);
    });
    test.each([
        [
            'missing validator',
            (r) => {
                r.modeEvidence[0].validatorResults.pop();
            },
        ],
        [
            'failed validator',
            (r) => {
                r.modeEvidence[0].validatorResults[0].state = 'FAIL';
            },
        ],
        [
            'missing mode',
            (r) => {
                r.modeEvidence.pop();
            },
        ],
        [
            'duplicate mode',
            (r) => {
                r.modeEvidence[1].query = '';
            },
        ],
        [
            'mixed candidate',
            (r) => {
                r.candidateFingerprint = '0'.repeat(16);
            },
        ],
        [
            'missing proof',
            (r) => {
                r.modeEvidence[0].apiProof = [];
            },
        ],
        [
            'unobserved API',
            (r) => {
                for (const row of [r, ...r.modeEvidence]) {
                    row.apiProof[0].state = 'not-observed';
                    row.apiProof[0].proof = 'unproven';
                    row.apiProof[0].calls = 0;
                    row.apiProof[0].via = null;
                }
            },
        ],
        [
            'unsupported attestation',
            (r) => {
                r.modeEvidence[0].apiProof[0].state = 'no-trace';
                r.modeEvidence[0].apiProof[0].proof = 'attested';
                r.modeEvidence[0].apiProof[0].calls = 0;
                r.modeEvidence[0].apiProof[0].via = null;
            },
        ],
        [
            'missing response inventory',
            (r) => {
                delete r.modeEvidence[0].networkAssets;
            },
        ],
        [
            'missing body hash',
            (r) => {
                delete r.modeEvidence[0].networkAssets[0].sha256;
            },
        ],
        [
            'stale served source',
            (r) => {
                r.modeEvidence[0].networkAssets[0].source.sha256 = '0'.repeat(64);
            },
        ],
    ])('%s rejects completion', (name, mutate) => {
        expect(() => complete(state, { alpha: { result: mutate } })).toThrow();
    });
    test.each([
        [
            'forced browser',
            (r) => {
                r.forced = true;
            },
        ],
        [
            'missing stdio close',
            (r) => {
                r.worker.close = null;
            },
        ],
        [
            'missing server close',
            (r) => {
                r.servers[0].close = null;
            },
        ],
        [
            'missing browser close',
            (r) => {
                r.browsers[0].close = null;
            },
        ],
        [
            'missing ready',
            (r) => {
                r.runtimes[0].ready = null;
            },
        ],
        [
            'runtime identity mismatch',
            (r) => {
                r.runtimeIdentity.executableSha256 = '0'.repeat(64);
            },
        ],
        [
            'CPU dummy cannot be relabeled as production',
            (r) => {
                r.cpuDummy = false;
            },
        ],
    ])('%s rejects completion without trusting ok:true', (name, mutate) => {
        expect(() => complete(state, { alpha: { receipt: mutate } })).toThrow();
    });
    test('stale before/after input digests and mixed freeze reject', () => {
        expect(() =>
            complete(state, {
                alpha: {
                    report: (r) => {
                        r.inputDigestAfter = '0'.repeat(64);
                    },
                },
            }),
        ).toThrow(/stale attempt/);
    });
    test('immutable attempts cannot overwrite a previous attempt file', () => {
        const a = attempt(state, 'alpha');
        const report = read(a.report.path);
        expect(() =>
            campaign.writeAttempt({ repo: state.repo, freeze: state.freeze, report, out: a.report.path }),
        ).toThrow();
    });
    test('a campaign copied into the repository stays portable without rewriting raw report bytes', () => {
        complete(state);
        const target = path.join(state.repo, 'docs/evidence/campaigns/fixture');
        fs.cpSync(state.artifacts, target, { recursive: true });
        const segments = state.segmentFiles.map((file) => path.join(target, path.basename(file)));
        fs.rmSync(state.artifacts, { recursive: true, force: true });
        const out = path.join(state.repo, 'docs/evidence/examples-verified.json');
        const data = campaign.mergeCampaign({
            repo: state.repo,
            freeze: state.freeze,
            segments,
            out,
            publicationStaging: true,
        });
        expect(campaign.validateCampaign(data, { repo: state.repo, evidencePath: out }).ok).toBe(true);
        expect(data.results.every((r) => !r.artifact.path.startsWith('..'))).toBe(true);
    });
    test('in-repository canonical output cannot depend on external report or PNG paths', () => {
        complete(state);
        expect(() =>
            merge(state, {
                out: path.join(state.repo, 'docs/evidence/examples-verified.json'),
                publicationStaging: true,
            }),
        ).toThrow(/outside repository/);
    });
    test('tampered completed header counts, rows, or attempt history are rejected', () => {
        const data = complete(state);
        for (const mutate of [
            (d) => {
                d.total = 0;
            },
            (d) => {
                d.results.pop();
            },
            (d) => {
                d.attempts.pop();
            },
            (d) => {
                d.candidateFingerprint = '0'.repeat(16);
            },
        ]) {
            const bad = clone(data);
            mutate(bad);
            expect(check(state, bad).ok).toBe(false);
        }
    });
    test.each(['omit', 'relabel'])('manifest cannot %s a discovered non-DevTools example', (action) => {
        const file = path.join(state.repo, 'examples/files.json');
        const manifest = read(file);
        if (action === 'omit') manifest.examples = manifest.examples.filter((e) => e.id !== 'spark-splats');
        else manifest.examples.find((e) => e.id === 'spark-splats').requiresDevTools = true;
        write(file, manifest);
        expect(() => campaign.collectScope(state.repo)).toThrow(/manifest/);
    });
    test('missing collector is sealed as failed history and cannot be merged or silently renumbered', () => {
        const original = attempt(state, 'alpha', { failed: true });
        const report = read(original.report.path);
        fs.unlinkSync(report.receipt.output.report);
        report.result = { id: 'alpha', result: 'FAIL', errors: ['collector failed before creating output'] };
        const sealed = campaign.writeAttempt({
            repo: state.repo,
            freeze: state.freeze,
            report,
            out: path.join(path.dirname(original.report.path), 'sealed-failure.json'),
        });
        expect(read(sealed.report.path).rawCollector).toBe(null);
        segment(state, [sealed]);
        expect(() => merge(state)).toThrow(/admission errors/);
    });
    test('cross-example overlapping workers cannot be called a serial campaign', () => {
        expect(() =>
            complete(state, {
                'spark-splats': {
                    beforeCustody: (receipt) => {
                        const delta = Date.parse(receipt.startedAt) - Date.parse(state.freeze.createdAt);
                        receipt.startedAt = state.freeze.createdAt;
                        receipt.endedAt = new Date(Date.parse(receipt.endedAt) - delta).toISOString();
                        for (const event of receipt.events)
                            event.receivedUtc = new Date(Date.parse(event.receivedUtc) - delta).toISOString();
                    },
                },
            }),
        ).toThrow(/overlap/);
    });
    test('reusing one physical attempt identity across IDs is rejected', () => {
        let first;
        expect(() =>
            complete(state, {
                alpha: {
                    beforeCustody: (receipt) => {
                        first = receipt.attemptId;
                    },
                },
                'spark-splats': {
                    beforeCustody: (receipt) => {
                        receipt.attemptId = first;
                    },
                },
            }),
        ).toThrow(/duplicate physical/);
    });
    test('publication transaction guard blocks otherwise valid complete evidence', () => {
        const data = complete(state);
        write(path.join(state.repo, 'docs/evidence/.examples-publication-incomplete.json'), '{}');
        expect(check(state, data).errors.join(' ')).toMatch(/incomplete evidence publication/);
    });
    test('changing a draft manifest promotion cannot be hidden by normalization', () => {
        const data = complete(state);
        const specPath = path.join(state.repo, 'examples/alpha/example.json');
        const spec = read(specPath);
        spec.promotion = common.promotionOf(data.results[0]);
        write(specPath, spec);
        const manifestPath = path.join(state.repo, 'examples/files.json');
        const manifest = read(manifestPath);
        manifest.examples.find((e) => e.id === 'alpha').promotion = spec.promotion;
        manifest.examples.find((e) => e.id === 'spark-splats').promotion = { forged: true };
        write(manifestPath, manifest);
        expect(() => campaign.buildPublication(state.freeze, data.results, { repo: state.repo })).toThrow(
            /draft\/DevTools/,
        );
    });
    test('raw screenshots cannot escape the admitted origin root', () => {
        expect(() =>
            complete(state, {
                alpha: {
                    report: (report) => {
                        report.captureRoot = path.join(state.artifacts, 'unrelated');
                    },
                },
            }),
        ).toThrow(/capture root/);
    });
    test('established unresolved attestation stays attested only with live instrumentation and validator/source binding', () => {
        const data = complete(state, {
            'spark-splats': {
                result: (row) => {
                    const proof = row.apiProof[0];
                    Object.assign(proof, {
                        state: 'unresolved',
                        mechanism: 'unresolved',
                        proof: 'attested',
                        calls: 0,
                        reads: 0,
                        via: null,
                    });
                },
            },
        });
        expect(data.results.find((r) => r.id === 'spark-splats').apiProof[0].proof).toBe('attested');
        expect(check(state, data).ok).toBe(true);
    });
    test('single-mode rows cannot hide an unproven top-level claim behind an artificial mode wrapper', () => {
        expect(() =>
            complete(state, {
                'spark-splats': {
                    result: (row) => {
                        row.modeEvidence = [clone(row)];
                        row.apiProof[0].proof = 'unproven';
                        row.apiProof[0].state = 'not-observed';
                    },
                },
            }),
        ).toThrow(/unexpected mode/);
    });
    test.each([
        [
            'missing custody',
            (runtime) => {
                delete runtime.custody;
            },
        ],
        [
            'unknown custody schema',
            (runtime) => {
                runtime.custody.schemaVersion = 'unknown/2';
            },
        ],
        [
            'unsupported custody platform',
            (runtime) => {
                runtime.custody.platform = 'unsupported';
            },
        ],
        [
            'missing custody IPC contract',
            (runtime) => {
                delete runtime.custody.ipc;
            },
        ],
        [
            'unknown custody IPC contract',
            (runtime) => {
                runtime.custody.ipc = 'filesystem-polling/unknown';
            },
        ],
        [
            'missing Python hash',
            (runtime) => {
                delete runtime.custody.python.sha256;
            },
        ],
        [
            'unknown helper',
            (runtime) => {
                runtime.custody.helper.path = '/other/helper.py';
            },
        ],
    ])('%s cannot be frozen as runtime identity', (label, mutate) => {
        const runtime = clone(state.freeze.runtimeIdentity);
        mutate(runtime);
        expect(() => campaign.validateRuntimeIdentity(runtime)).toThrow(/custody/);
    });
    test('the custodian identity must hash the frozen helper source', () => {
        const runtimeIdentity = clone(state.freeze.runtimeIdentity);
        runtimeIdentity.custody.helper.sha256 = '0'.repeat(64);
        expect(() => campaign.freezeCampaign({ repo: state.repo, runtimeIdentity })).toThrow(/custody helper differs/);
    });
    test.each(['executablePath', 'version', 'sha256'])('a changed custody Python %s prevents resume', (field) => {
        const runtimeIdentity = clone(state.freeze.runtimeIdentity);
        runtimeIdentity.custody.python[field] += '-changed';
        expect(() => campaign.assertFrozenInputs(state.freeze, { repo: state.repo, runtimeIdentity })).toThrow(
            /runtime identity changed/,
        );
    });
    test('changing the frozen custodian source prevents resume', () => {
        fs.appendFileSync(path.join(state.repo, 'tools/verify/example-evidence-custodian.py'), '# changed\n');
        expect(() => campaign.assertFrozenInputs(state.freeze, { repo: state.repo })).toThrow(/frozen inputs changed/);
    });
    test.each(['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr'])(
        'kernel custody %s originals are content-hash bound',
        (role) => {
            const data = complete(state);
            const reportPath = path.resolve(state.artifacts, data.attempts[0].report.path);
            const report = read(reportPath);
            const artifact = path.resolve(path.dirname(reportPath), report.custodyArtifacts[role].path);
            fs.appendFileSync(artifact, 'changed custody original');
            expect(check(state, data).ok).toBe(false);
        },
    );
    test.each(['raw', 'nodeReceipt', 'journal'])(
        'rehashing a changed custody %s cannot sever its original semantic binding',
        (role) => {
            expect(() =>
                complete(state, {
                    alpha: {
                        receipt: (receipt) => {
                            const ref = receipt.custody.artifacts[role];
                            if (role === 'journal') fs.appendFileSync(ref.path, '{"unobserved":true}\n');
                            else {
                                const content = read(ref.path);
                                if (role === 'raw') content.forced = true;
                                else content.worker.pid += 1;
                                write(ref.path, content);
                            }
                            Object.assign(ref, campaign.fileDigest(ref.path));
                        },
                    },
                }),
            ).toThrow(/kernel custody originals invalid/);
        },
    );
    test('a missing custody proof is preserved as failed admission, never accepted by a completed marker', () => {
        expect(() =>
            complete(state, {
                alpha: {
                    receipt: (receipt) => {
                        delete receipt.custody;
                    },
                },
            }),
        ).toThrow(/custody|admission/);
    });
});
