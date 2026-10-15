/** Synthetic CPU-only publication tests. No real repository evidence is written,
 * no browser is launched, and no fixture result is production browser evidence.
 */
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');
const root = path.resolve('.');
const protocol = nodeRequire(path.join(root, 'tools/verify/example-evidence-campaign.cjs'));
const publication = nodeRequire(path.join(root, 'tools/verify/publish-example-evidence.cjs'));
const common = nodeRequire(path.join(root, 'tools/verify/example-spec-common.cjs'));
const fixtures = nodeRequire(path.join(root, 'tools/verify/example-evidence-campaign.cpu-fixture.cjs'));
const temporary: string[] = [];
let receiptValidationSpy: any;
beforeEach(() => {
    receiptValidationSpy = fixtures.installSyntheticReceiptValidationSpy(jest);
});

function fixture(): any {
    const state = fixtures.fixture();
    temporary.push(state.temp);
    fixtures.complete(state);
    return state;
}
function options(state: any): any {
    return { repo: state.repo, campaign: path.join(state.artifacts, 'completed.json'), sourceDir: state.artifacts };
}
function prepare(state: any): any {
    return publication.preparePublication(options(state));
}
function check(state: any): any {
    const evidencePath = path.join(state.repo, publication.CANONICAL);
    return protocol.validateCampaign(fixtures.read(evidencePath), { repo: state.repo, evidencePath });
}
function edit(file: string, change: (value: any) => void): void {
    const value = fixtures.read(file);
    change(value);
    fixtures.write(file, value);
}
function withoutPromotion(value: any): any {
    const copy = fixtures.clone(value);
    delete copy.promotion;
    for (const entry of copy.examples || []) delete entry.promotion;
    return copy;
}
function fileTree(directory: string): any[] {
    const result: any[] = [];
    function walk(current: string): void {
        for (const name of fs.readdirSync(current).sort()) {
            const file = path.join(current, name);
            if (fs.lstatSync(file).isDirectory()) walk(file);
            else result.push({ path: path.relative(directory, file), ...protocol.fileDigest(file) });
        }
    }
    walk(directory);
    return result;
}
function mutateAttemptAndRehash(state: any, change: (attempt: any, file: string) => void): void {
    const campaignFile = options(state).campaign;
    const data = fixtures.read(campaignFile);
    const segmentRef = data.segments[0];
    const segmentFile = path.resolve(path.dirname(campaignFile), segmentRef.path);
    const segment = fixtures.read(segmentFile);
    const attemptRef = segment.attempts[0].report;
    const attemptFile = path.resolve(path.dirname(segmentFile), attemptRef.path);
    const attempt = fixtures.read(attemptFile);
    change(attempt, attemptFile);
    fixtures.write(attemptFile, attempt);
    Object.assign(attemptRef, protocol.fileDigest(attemptFile));
    const listed = data.attempts.find((entry: any) => entry.id === attempt.id && entry.attempt === attempt.attempt);
    Object.assign(listed.report, protocol.fileDigest(attemptFile));
    fixtures.write(segmentFile, segment);
    Object.assign(segmentRef, protocol.fileDigest(segmentFile));
    fixtures.write(campaignFile, data);
}
function mutateReceiptAndRehash(state: any, change: (receipt: any) => void): void {
    mutateAttemptAndRehash(state, (attempt, attemptFile) => {
        change(attempt.receipt);
        // Keep both retained Node records and all hash references consistent so this
        // negative control reaches the structural closure validator, not just drift.
        const innerRef = attempt.custodyArtifacts.nodeReceipt;
        const innerFile = path.resolve(path.dirname(attemptFile), innerRef.path);
        const inner = fixtures.read(innerFile);
        change(inner);
        fixtures.write(innerFile, inner);
        const innerDigest = protocol.fileDigest(innerFile);
        Object.assign(innerRef, innerDigest);
        Object.assign(attempt.receipt.custody.artifacts.nodeReceipt, innerDigest);
        const receiptFile = path.resolve(path.dirname(attemptFile), attempt.rawReceipt.path);
        fixtures.write(receiptFile, attempt.receipt);
        Object.assign(attempt.rawReceipt, protocol.fileDigest(receiptFile));
    });
}
afterEach(() => {
    receiptValidationSpy?.mockRestore();
    jest.restoreAllMocks();
    for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Constrained fixed-snapshot evidence publication', () => {
    test('publishes the exact full scope, refreshes only existing stable promotion, and remains portable', () => {
        const state = fixture();
        const sourceFiles = fileTree(state.artifacts);
        const manifestBefore = fixtures.read(path.join(state.repo, 'examples/files.json'));
        const specsBefore = state.freeze.scope.map((entry: any) => ({
            path: `examples/${entry.dir}/example.json`,
            value: fixtures.read(path.join(state.repo, 'examples', entry.dir, 'example.json')),
        }));
        const oldCanonical = Buffer.from('{"previousCanonical":"preserve until commit"}\n');
        fixtures.write(path.join(state.repo, publication.CANONICAL), oldCanonical);
        const plan = prepare(state);
        expect(fs.readFileSync(path.join(state.repo, publication.CANONICAL)).equals(oldCanonical)).toBe(true);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
        const renames: string[] = [];
        const rename = fs.renameSync;
        jest.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
            renames.push(String(to));
            return rename(from, to);
        });
        const result = publication.commitPublication(plan);
        expect(result.published).toBe(true);
        expect(result.total).toBe(state.freeze.scope.length);
        expect(renames[renames.length - 1]).toBe(path.join(state.repo, publication.CANONICAL));
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
        expect(fs.existsSync(plan.stage)).toBe(false);
        const data = fixtures.read(path.join(state.repo, publication.CANONICAL));
        expect(data.publication.schema).toBe(protocol.SCHEMAS.publication);
        expect(data.publication.files.map((item: any) => item.path).sort()).toEqual([
            'examples/alpha/example.json',
            'examples/files.json',
        ]);
        for (const item of data.publication.files) {
            expect(item.before).toEqual(
                expect.objectContaining({ bytes: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
            );
            expect(protocol.fileDigest(path.join(state.repo, item.path))).toEqual({
                bytes: item.bytes,
                sha256: item.sha256,
            });
        }
        for (const item of specsBefore) {
            const after = fixtures.read(path.join(state.repo, item.path));
            expect(withoutPromotion(after)).toEqual(withoutPromotion(item.value));
            if (item.value.status === 'stable') {
                expect(after.promotion).toEqual(
                    common.promotionOf(data.results.find((row: any) => row.id === after.id)),
                );
            } else expect(after).toEqual(item.value);
        }
        const manifestAfter = fixtures.read(path.join(state.repo, 'examples/files.json'));
        expect(withoutPromotion(manifestAfter)).toEqual(withoutPromotion(manifestBefore));
        expect(manifestAfter.generatedAt).toBe(manifestBefore.generatedAt);
        expect(manifestAfter.revision).toBe(manifestBefore.revision);
        for (const entry of manifestBefore.examples.filter((item: any) => item.status !== 'stable')) {
            expect(manifestAfter.examples.find((item: any) => item.id === entry.id)).toEqual(entry);
        }
        expect(fileTree(path.join(state.repo, result.package))).toEqual(sourceFiles);
        expect(check(state)).toEqual({ ok: true, errors: [] });
        fs.rmSync(state.artifacts, { recursive: true });
        expect(check(state)).toEqual({ ok: true, errors: [] });
    });

    test.each([
        [
            'partial',
            (data: any) => {
                data.completed = false;
                data.partial = true;
            },
        ],
        [
            'unknown schema',
            (data: any) => {
                data.schema = 'unsupported';
            },
        ],
        [
            'missing result',
            (data: any) => {
                data.results.pop();
            },
        ],
        [
            'duplicate result',
            (data: any) => {
                data.results.push(data.results[0]);
            },
        ],
    ])('rejects %s before writing canonical or metadata', (_label: string, change: any) => {
        const state = fixture();
        const before = fileTree(state.repo);
        edit(options(state).campaign, change);
        expect(() => prepare(state)).toThrow();
        expect(fileTree(state.repo)).toEqual(before);
    });

    test.each(['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr'])(
        'requires unchanged original custody %s bytes before publication',
        (kind) => {
            const state = fixture();
            let originalFile = '';
            mutateAttemptAndRehash(state, (attempt, file) => {
                originalFile = path.resolve(path.dirname(file), attempt.custodyArtifacts[kind].path);
            });
            const before = fileTree(state.repo);
            const original = fs.readFileSync(originalFile);
            fs.appendFileSync(originalFile, '\nchanged after capture');
            expect(() => prepare(state)).toThrow();
            fs.writeFileSync(originalFile, original);
            fs.unlinkSync(originalFile);
            expect(() => prepare(state)).toThrow();
            expect(fileTree(state.repo)).toEqual(before);
        },
    );

    test('rejects absent custody provenance even when wrapper references are consistently rehashed', () => {
        const state = fixture();
        mutateAttemptAndRehash(state, (attempt) => {
            delete attempt.custodyArtifacts;
        });
        const before = fileTree(state.repo);
        expect(() => prepare(state)).toThrow();
        expect(fileTree(state.repo)).toEqual(before);
    });

    test('rejects custody provenance outside the captured source tree despite matching file bytes', () => {
        const state = fixture();
        mutateAttemptAndRehash(state, (attempt, file) => {
            const ref = attempt.custodyArtifacts.raw;
            const originalFile = path.resolve(path.dirname(file), ref.path);
            const outside = path.join(state.temp, 'outside-custody.json');
            fs.copyFileSync(originalFile, outside);
            ref.path = path.relative(path.dirname(file), outside).split(path.sep).join('/');
        });
        const before = fileTree(state.repo);
        expect(() => prepare(state)).toThrow();
        expect(fileTree(state.repo)).toEqual(before);
    });

    test.each(['status', 'stableReview'])('rejects %s drift even when promotion hashes could be recomputed', (key) => {
        const state = fixture();
        const plan = prepare(state);
        edit(path.join(plan.stage, 'examples/alpha/example.json'), (spec) => {
            spec[key] = key === 'status' ? 'draft' : { arbitrary: true };
        });
        expect(() => publication.commitPublication(plan)).toThrow(/frozen inputs changed|staged publication invalid/);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
        expect(fs.existsSync(path.join(state.repo, publication.CANONICAL))).toBe(false);
    });

    test.each(['examples/spark-splats/example.json', 'examples/files.json'])(
        'rejects a changed draft promotion in %s',
        (relative) => {
            const state = fixture();
            const plan = prepare(state);
            edit(path.join(plan.stage, relative), (value) => {
                const entry = value.examples ? value.examples.find((item: any) => item.id === 'spark-splats') : value;
                entry.promotion = { forged: true };
            });
            const data = fixtures.read(path.join(plan.stage, publication.CANONICAL));
            expect(() => protocol.buildPublication(data.freeze, data.results, { repo: plan.stage })).toThrow(
                /promotion/,
            );
            expect(() => publication.commitPublication(plan)).toThrow();
            expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
        },
    );

    test('rejects arbitrary stable promotion, even when it is the only semantic change', () => {
        const state = fixture();
        const plan = prepare(state);
        edit(path.join(plan.stage, 'examples/alpha/example.json'), (value) => {
            value.promotion.candidate = '0'.repeat(16);
        });
        const data = fixtures.read(path.join(plan.stage, publication.CANONICAL));
        expect(() => protocol.buildPublication(data.freeze, data.results, { repo: plan.stage })).toThrow(
            /invalid promotion/,
        );
        expect(() => publication.commitPublication(plan)).toThrow();
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
    });

    test.each(['generatedAt', 'revision'])('preserves manifest %s as an immutable input', (field) => {
        const state = fixture();
        const plan = prepare(state);
        edit(path.join(plan.stage, 'examples/files.json'), (value) => {
            value[field] = 'changed';
        });
        expect(() => publication.commitPublication(plan)).toThrow(/frozen inputs changed|staged publication invalid/);
    });

    test.each([
        [
            'forced exit',
            (receipt: any) => {
                receipt.forced = true;
            },
        ],
        [
            'missing actual server close',
            (receipt: any) => {
                delete receipt.servers[0].close;
            },
        ],
        [
            'missing actual browser close',
            (receipt: any) => {
                delete receipt.browsers[0].close;
            },
        ],
    ])('rejects %s despite a claimed PASS and consistently rehashed artifacts', (_label: string, change: any) => {
        const state = fixture();
        mutateReceiptAndRehash(state, change);
        const before = fileTree(state.repo);
        expect(() => prepare(state)).toThrow(/incomplete\/forced closure/);
        expect(fileTree(state.repo)).toEqual(before);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
    });

    test('rejects an interrupted transaction before canonical replacement and leaves its durable guard', () => {
        const state = fixture();
        const previous = '{"previous":"canonical"}\n';
        fixtures.write(path.join(state.repo, publication.CANONICAL), previous);
        const plan = prepare(state);
        const rename = fs.renameSync;
        jest.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
            if (String(to) === path.join(state.repo, publication.CANONICAL))
                throw Error('synthetic interrupted rename');
            return rename(from, to);
        });
        expect(() => publication.commitPublication(plan)).toThrow(/Publication incomplete; guard retained/);
        expect(fs.readFileSync(path.join(state.repo, publication.CANONICAL), 'utf8')).toBe(previous);
        expect(fs.existsSync(plan.stage)).toBe(true);
        const guard = fixtures.read(path.join(state.repo, publication.GUARD));
        expect(guard.schema).toBe(publication.GUARD_SCHEMA);
        expect(guard.writes[guard.writes.length - 1].path).toBe(publication.CANONICAL);
        for (const item of guard.writes.filter((entry: any) => entry.before)) {
            expect(protocol.fileDigest(path.join(state.repo, guard.backup, item.path))).toEqual(item.before);
        }
        expect(fs.readFileSync(path.join(state.repo, guard.backup, publication.CANONICAL), 'utf8')).toBe(previous);
        const staged = fixtures.read(path.join(plan.stage, publication.CANONICAL));
        expect(
            protocol
                .validateCampaign(staged, {
                    repo: state.repo,
                    evidencePath: path.join(state.repo, publication.CANONICAL),
                })
                .errors.join('; '),
        ).toMatch(/incomplete (?:evidence )?publication/);
        expect(() => prepare(state)).toThrow(/incomplete publication guard/);
    });

    test('guard still blocks a valid new canonical report when final guard removal is interrupted', () => {
        const state = fixture();
        const plan = prepare(state);
        const unlink = fs.unlinkSync;
        jest.spyOn(fs, 'unlinkSync').mockImplementation((file: any) => {
            if (String(file) === path.join(state.repo, publication.GUARD)) throw Error('synthetic interrupted commit');
            return unlink(file);
        });
        expect(() => publication.commitPublication(plan)).toThrow(/Publication incomplete/);
        expect(fixtures.read(path.join(state.repo, publication.CANONICAL)).completed).toBe(true);
        expect(check(state).errors.join('; ')).toMatch(/incomplete (?:evidence )?publication/);
    });

    test('restores the guard when its unlink succeeds but final directory fsync fails', () => {
        const state = fixture();
        const plan = prepare(state);
        const unlink = fs.unlinkSync;
        const sync = fs.fsyncSync;
        let guardRemoved = false;
        let failedOnce = false;
        jest.spyOn(fs, 'unlinkSync').mockImplementation((file: any) => {
            unlink(file);
            if (String(file) === path.join(state.repo, publication.GUARD)) guardRemoved = true;
        });
        jest.spyOn(fs, 'fsyncSync').mockImplementation((descriptor: number) => {
            if (guardRemoved && !failedOnce) {
                failedOnce = true;
                throw Error('synthetic directory fsync failure');
            }
            return sync(descriptor);
        });
        expect(() => publication.commitPublication(plan)).toThrow(/Publication incomplete; guard retained/);
        expect(guardRemoved && failedOnce).toBe(true);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(true);
        expect(check(state).errors.join('; ')).toMatch(/incomplete (?:evidence )?publication/);
    });

    test('rejects a staged PNG hash mismatch before acquiring the publication guard', () => {
        const state = fixture();
        const plan = prepare(state);
        const png = plan.packageFiles.find((item: any) => item.path.endsWith('.png'));
        fs.appendFileSync(path.join(plan.stage, plan.packageRelative, png.path), 'altered');
        expect(() => publication.commitPublication(plan)).toThrow(/artifact changed/);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
        expect(fs.existsSync(path.join(state.repo, publication.CANONICAL))).toBe(false);
    });

    test('retains the guard when a delivered package hash changes during publication', () => {
        const state = fixture();
        const plan = prepare(state);
        const body = plan.packageFiles.find((item: any) => item.path.endsWith('.body'));
        const rename = fs.renameSync;
        jest.spyOn(fs, 'renameSync').mockImplementation((from: any, to: any) => {
            rename(from, to);
            if (String(to) === path.join(state.repo, publication.CANONICAL)) {
                fs.appendFileSync(path.join(state.repo, plan.packageRelative, body.path), 'corrupted after write');
            }
        });
        expect(() => publication.commitPublication(plan)).toThrow(/published package hash mismatch/);
        expect(check(state).errors.join('; ')).toMatch(/incomplete (?:evidence )?publication/);
    });

    test('rejects a source directory symlink rather than following it into unrelated data', () => {
        const state = fixture();
        fs.symlinkSync(path.join(state.repo, 'package.json'), path.join(state.artifacts, 'unexpected-link'));
        expect(() => prepare(state)).toThrow(/symlink forbidden/);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
    });

    test('cannot expand a prepared write set to arbitrary repository files', () => {
        const state = fixture();
        const plan = prepare(state);
        plan.writes.unshift({ path: 'package.json', before: null, after: null });
        expect(() => publication.commitPublication(plan)).toThrow(/write set differs/);
        expect(fs.existsSync(path.join(state.repo, publication.GUARD))).toBe(false);
    });
});
