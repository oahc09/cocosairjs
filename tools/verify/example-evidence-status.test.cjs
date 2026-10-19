'use strict';
// CPU-only protocol fixtures. Synthetic rows are not browser or publication evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function fixture(t, specification = 'stable', gallery = specification) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-status-admission-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (relative, value) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    };
    // Load the actual implementation in an isolated fixture, including its real
    // fingerprint helpers. The empty inventory is intentional: these tests do
    // not collect API coverage or claim a browser execution.
    for (const name of [
        'example-evidence-campaign.cjs',
        'example-spec-common.cjs',
        'api-trace.cjs',
        'example-evidence-limits.json',
    ]) {
        write('tools/verify/' + name, fs.readFileSync(path.join(__dirname, name), 'utf8'));
    }
    write('docs/example-api-inventory.json', { units: {} });
    write('examples/one/index.html', '<canvas></canvas>');
    const spec = {
        id: 'one',
        status: specification,
        requiresDevTools: false,
        bench: { entryQuery: 'view=main' },
        api: { claims: [] },
    };
    const entry = { dir: 'one', ...structuredClone(spec), status: gallery };
    const manifest = { generatedAt: '2026-01-01T00:00:00Z', revision: 'historical', examples: [entry] };
    const save = () => {
        write('examples/one/example.json', spec);
        write('examples/files.json', manifest);
    };
    save();
    const protocol = require(path.join(root, 'tools/verify/example-evidence-campaign.cjs'));
    return { root, spec, entry, manifest, protocol, save };
}

for (const [specification, gallery] of [
    ['draft', 'draft'],
    ['experimental', 'experimental'],
    ['stable', 'stable'],
    ['stable', 'draft'],
    ['stable', 'experimental'],
    ['experimental', 'draft'],
]) {
    test(`execution records conservative Gallery ${gallery} / specification ${specification}`, (t) => {
        const f = fixture(t, specification, gallery);
        const before = fs.readFileSync(path.join(f.root, 'examples/files.json'));
        const [scope] = f.protocol.collectScope(f.root);
        assert.deepEqual(scope.statusAdmission, { specification, gallery });
        assert.equal(scope.modes[0].query, 'view=main');
        assert.deepEqual(fs.readFileSync(path.join(f.root, 'examples/files.json')), before);
        assert.equal(Object.hasOwn(f.entry, 'promotion'), false);
    });
}
for (const [specification, gallery] of [
    ['draft', 'experimental'],
    ['draft', 'stable'],
    ['experimental', 'stable'],
]) {
    test(`execution rejects Gallery ${gallery} exceeding specification ${specification}`, (t) => {
        const f = fixture(t, specification, gallery);
        assert.throws(() => f.protocol.collectScope(f.root), /manifest status exceeds specification/);
    });
}
for (const [specification, gallery] of [
    ['unknown', 'draft'],
    ['stable', 'unknown'],
    ['__proto__', 'draft'],
    ['stable', null],
]) {
    test(`execution rejects unknown status ${String(specification)} / ${String(gallery)}`, (t) => {
        const f = fixture(t, specification, gallery);
        assert.throws(() => f.protocol.collectScope(f.root), /unknown manifest\/spec status/);
    });
}
for (const [field, value, error] of [
    ['bench', { entryQuery: 'wrong-mode' }, /manifest\/spec contract mismatch/],
    ['id', 'different-id', /manifest\/spec ID mismatch/],
    ['requiresDevTools', true, /manifest\/spec DevTools mismatch/],
]) {
    test(`conservative Gallery cannot bypass executable ${field} consistency`, (t) => {
        const f = fixture(t, 'stable', 'draft');
        f.entry[field] = value;
        f.save();
        assert.throws(() => f.protocol.collectScope(f.root), error);
    });
}

function publicationFixture(t, specification, gallery, hadPromotion = false) {
    const f = fixture(t, specification, gallery);
    if (hadPromotion) {
        f.spec.promotion = { historical: true };
        f.entry.promotion = { historical: true };
        f.save();
    }
    const paths = ['examples/files.json', 'examples/one/example.json'];
    const raw = () =>
        paths.map((relative) => ({ path: relative, ...f.protocol.fileDigest(path.join(f.root, relative)) }));
    const freeze = {
        scope: [{ id: 'one' }],
        inputs: paths.map((relative) => ({ path: relative })),
        rawInputs: raw(),
        promotionBaseline: [
            { id: 'one', dir: 'one', status: specification, hadPromotion, promotion: f.spec.promotion },
        ],
        manifestPromotionBaseline: [{ id: 'one', hadPromotion, promotion: f.entry.promotion }],
    };
    const result = {
        id: 'one',
        result: 'PASS',
        specFingerprint: 'fixture-spec',
        sourceFingerprint: 'fixture-source',
        candidateFingerprint: 'fixture-candidate',
        apiProof: [{ api: 'fixture-api', proof: 'verified' }],
    };
    const proof = require(path.join(f.root, 'tools/verify/example-spec-common.cjs')).promotionOf(result);
    const publication = () => ({
        schema: f.protocol.SCHEMAS.publication,
        files: raw().flatMap((item, i) =>
            JSON.stringify(item) === JSON.stringify(freeze.rawInputs[i])
                ? []
                : [{ ...item, before: { bytes: freeze.rawInputs[i].bytes, sha256: freeze.rawInputs[i].sha256 } }],
        ),
    });
    return {
        ...f,
        freeze,
        result,
        proof,
        check: () => f.protocol.validatePublication(freeze, publication(), [result], f.root),
    };
}
for (const [specification, gallery] of [
    ['stable', 'draft'],
    ['stable', 'experimental'],
    ['experimental', 'draft'],
]) {
    test(`publication rejects conservative ${gallery}/${specification} identity even with PASS-shaped proof`, (t) => {
        const f = publicationFixture(t, specification, gallery, true);
        f.spec.promotion = f.proof;
        f.entry.promotion = f.proof;
        f.save();
        assert.throws(f.check, /publication status drift/);
    });
}
test('publication rejects unknown frozen status', (t) => {
    const f = publicationFixture(t, 'unknown', 'unknown');
    assert.throws(f.check, /publication status drift/);
});
test('publication preserves an unchanged draft and rejects adding a new draft promotion', (t) => {
    const f = publicationFixture(t, 'draft', 'draft');
    assert.doesNotThrow(f.check);
    f.spec.promotion = f.proof;
    f.entry.promotion = f.proof;
    f.save();
    assert.throws(f.check, /publication invalid promotion/);
});
test('publication permits matching stable identities with existing promotion fields and bound proof', (t) => {
    const f = publicationFixture(t, 'stable', 'stable', true);
    f.spec.promotion = f.proof;
    f.entry.promotion = f.proof;
    f.save();
    assert.doesNotThrow(f.check);
});
