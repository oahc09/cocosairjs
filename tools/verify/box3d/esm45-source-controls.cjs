/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// AST/syntax only. Does not load engine, builder, loader, facade, WASM, compiler program or fixture runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2]);
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const contract = require('./esm45-contract.json');
const baseline = require('./esm45-baseline.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const parse = (filename) => {
    const text = fs.readFileSync(filename, 'utf8');
    const tree = ts.createSourceFile(
        filename,
        text,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    assert.equal(tree.parseDiagnostics.length, 0, 'Parse diagnostics: ' + filename);
    return tree;
};
const all = (tree, predicate) => {
    const result = [];
    function visit(node) {
        if (predicate(node)) result.push(node);
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return result;
};
const checks = [];
const check = (name, value) => {
    assert(value, name);
    checks.push(name);
};
for (const row of baseline.inputFiles) {
    const bytes = fs.readFileSync(path.join(root, row.path));
    assert.equal(bytes.length, row.bytes, row.path);
    assert.equal(sha(bytes), row.sha256, row.path);
}
check('all frozen source dependency and N4 bytes match original baseline', true);
const own = fs.readdirSync(__dirname).filter((name) => /^esm45-.*\.(cjs|mjs|ts)$/.test(name));
for (const name of own) parse(path.join(__dirname, name));
check('all new JavaScript and TypeScript sources parse without diagnostics', true);
const entry = parse(path.join(root, 'src/exports/physics-box3d.ts'));
const imports = all(entry, ts.isImportDeclaration).map((node) => node.moduleSpecifier.text);
assert.deepEqual(imports, ['../air/physics/box3d/feature']);
check('production optional entry imports feature only', true);
const feature = parse(path.join(root, 'src/air/physics/box3d/feature.ts'));
const featureCalls = all(feature, ts.isCallExpression).map((node) => node.expression.getText(feature));
check(
    'production feature registers only loader not adapter',
    featureCalls.includes('registerBox3DFeature') &&
        !featureCalls.includes('registerBox3DWorldAdapter') &&
        !featureCalls.includes('createBox3DWorldAdapter'),
);
const preparation = parse(path.join(root, 'src/air/physics/box3d/prepare.ts'));
const prepare = all(preparation, (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'prepareBox3D')[0];
const statements = [...prepare.body.statements];
const refusal = statements.findIndex(
    (node) => ts.isIfStatement(node) && node.expression.getText(preparation) === '!worldAdapter',
);
const loader = statements.findIndex((node) => node.getText(preparation).includes('loader ??= feature.createLoader()'));
check(
    'missing-adapter rejection precedes loader construction',
    refusal >= 0 && loader > refusal && statements[refusal].getText(preparation).includes('AIR_E_BOX3D_UNSUPPORTED'),
);
const test = parse(path.join(__dirname, 'esm45-test-only-entry.mjs'));
check(
    'TEST-ONLY entry invokes real registration and adapter factory exactly once',
    all(test, (node) => ts.isCallExpression(node) && node.expression.getText(test) === 'registerBox3DWorldAdapter')
        .length === 1 &&
        all(test, (node) => ts.isCallExpression(node) && node.expression.getText(test) === 'createBox3DWorldAdapter')
            .length === 1,
);
check(
    'TEST-ONLY entry never constructs substitute PhysicsSystem',
    all(test, (node) => ts.isNewExpression(node) && node.expression.getText(test) === 'PhysicsSystem').length === 0,
);
const builder = parse(path.join(__dirname, 'esm45-build.cjs'));
const loops = all(builder, ts.isForOfStatement);
check(
    'exactly two ESM graphs in fixed serial source loop',
    loops.some(
        (node) =>
            ts.isArrayLiteralExpression(node.expression) &&
            JSON.stringify(node.expression.elements.map((item) => item.text)) === JSON.stringify(contract.graphs) &&
            node.statement.getText(builder).includes('await withESMHelpers'),
    ),
);
check(
    'actual buildEngine is called under supported wrapper',
    all(builder, (node) => ts.isCallExpression(node) && node.expression.getText(builder) === 'buildEngine').length ===
        1 &&
        all(builder, (node) => ts.isCallExpression(node) && node.expression.getText(builder) === 'withESMHelpers')
            .length === 1,
);
const flagObjects = all(builder, (node) => ts.isPropertyAssignment(node) && node.name.getText(builder) === 'flags');
assert.equal(flagObjects.length, 1);
check(
    'only production SUPPORT_JIT=false flag is present',
    flagObjects[0].initializer.getText(builder).replace(/\s/g, '') === '{SUPPORT_JIT:false}',
);
check(
    'no TEST/EDITOR flag override or build-number commit in builder',
    !builder.text.includes('commitBuildNumber(') && !/\b(?:TEST|EDITOR)\s*:/.test(builder.text),
);
const consuming = parse(path.join(__dirname, 'esm45-typed-consumer.ts'));
check(
    'typed consumer imports only generated public package',
    all(consuming, ts.isImportDeclaration).every((node) => node.moduleSpecifier.text === 'cocosair.js'),
);
check(
    'typed consumer retains exactly three negative type controls',
    consuming.text.split('@ts-expect-error').length - 1 === 3,
);
check('legacy consumer skipLibCheck boundary fixed before run', contract.consumerSkipLibCheck === true);
check(
    'global campaign remains NOT_RUN',
    contract.globalAcceptance.matrixCells === 2128 &&
        contract.globalAcceptance.gates === 9 &&
        contract.globalAcceptance.matrixStatus === 'NOT_RUN' &&
        contract.globalAcceptance.gateStatus === 'NOT_RUN',
);
console.log(
    JSON.stringify(
        {
            schema: 'box3d-esm45-static-controls-v1',
            status: 'STATIC_ONLY_NOT_RUNTIME',
            checkedInputCount: baseline.inputFiles.length,
            parsedOwnFiles: own,
            checks,
            baselineCommit: baseline.baseCommit,
        },
        null,
        2,
    ),
);
