/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic parser/lifecycle/file-protection controls only. No SDK import/native/WASM execution.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import {
    validateProducerObjects,
    validateResult,
    EXPECTED_MODULE_QUALIFICATION,
    PUBLIC_FIXTURE_COMMIT,
    PROFILE,
    PASS,
    QUALIFICATION,
    HOST_SHA256,
    validateProvenance,
    validateNativeLayout,
    dependencyInventory,
    freezeInputs,
    SDK_FILES,
    ST_FILES,
    RUNNER_FILES,
    IMPORTED_FILES,
    RECEIPT_KEYS,
    PROVENANCE_SCHEMA,
    SCHEMA_SHA256,
    FEATURES,
    here,
    sha,
} from './inputs.mjs';
const H = 'a'.repeat(64),
    P = PUBLIC_FIXTURE_COMMIT ?? 'b'.repeat(40),
    N = P,
    NATIVE_RESULT_SHA256 = H,
    DTS_DRIVER_SHA256 = H;
const NATIVE_RELATIVE_OUTPUT = 'tools/physics/box3d/output/synthetic-new-producer';
const file = (path) => ({ path, bytes: 1, sha256: H });
function synthetic() {
    const nativeRoot = '/cpu/native-producer',
        stRoot = nativeRoot + '/' + NATIVE_RELATIVE_OUTPUT;
    const sdkRoot = '/cpu/sdk',
        dtsRoot = '/cpu/dts-source',
        driverRoot = '/cpu/dts-supervision';
    const provenance = {
        schema: PROVENANCE_SCHEMA,
        schemaSha256: SCHEMA_SHA256,
        dependenciesRoot: '/cpu/deps',
        nativeRelativeOutput: NATIVE_RELATIVE_OUTPUT,
        runtimeBuildNumber: 235,
        runtimeProducerCommit: P,
        nativeProducerCommit: N,
        fixtureCommit: 'd'.repeat(40),
        receipts: Object.fromEntries(RECEIPT_KEYS.map((name) => [name, file(name + '.json')])),
    };
    provenance.receipts.native.sha256 = NATIVE_RESULT_SHA256;
    provenance.receipts.dtsDriver.sha256 = DTS_DRIVER_SHA256;
    const sdk = SDK_FILES.map(file),
        st = ST_FILES.map(file);
    const closed = (sourceCommit) => ({
        sourceCommit,
        exitCode: 0,
        abort: null,
        postInputDrift: [],
        inputDrift: [],
        remainingDescendants: [],
        physicalClose: 'ECHILD_AND_NO_GROUP_MEMBERS',
    });
    const commands = ['build-dts', 'dts-inputs.test', 'dts-external-types.test', 'dts-symbols.test'].map(
        (name, index) =>
            index === 0
                ? ['/cpu/node', '--max-old-space-size=2048', 'tools/build/' + name + '.cjs']
                : ['/cpu/node', 'tools/build/' + name + '.cjs'],
    );
    for (const name of ['app', 'mesh', 'terrain'])
        commands.push([
            '/cpu/node',
            '/cpu/node_modules/typescript/bin/tsc',
            '-p',
            driverRoot + '/consumers/' + name + '.json',
        ]);
    const gates = commands.map((command, index) => ({ index: index + 1, command, cwd: dtsRoot, exitCode: 0 }));
    const nativeCommands = Array.from({ length: 47 }, () => ({
        command: '/cpu/node',
        args: ['explicit-synthetic-control'],
        exitCode: 0,
        error: null,
    }));
    nativeCommands[0].args = ['tools/physics/box3d/query-admission-contract.mjs'];
    nativeCommands[39].args = ['<repo>/' + NATIVE_RELATIVE_OUTPUT + '/air_box3d_world_storage_contract.cjs'];
    nativeCommands[40].args = ['tools/physics/box3d/wasm-storage-contract.mjs', '<repo>/' + NATIVE_RELATIVE_OUTPUT];
    const esmFiles = sdk.filter((item) => !item.path.endsWith('.d.ts'));
    const receipts = {
        esm: {
            ...closed(P),
            status: 'PASS_FRESH_ESM235_BUILD',
            buildNumber: 235,
            budget: {
                source: nativeRoot,
                out: sdkRoot,
                sourceCommit: P,
                nativeProducer: N,
                features: FEATURES,
                counterBefore: 234,
                buildNumber: 235,
                command: [
                    '/bin/bash',
                    '-c',
                    `export AIR_FEATURES="${FEATURES.join(',')}" AIR_OUT_DIR="${sdkRoot}" AIR_BOX3D_ST_BUILD_DIR="${stRoot}" AIR_BOX3D_PROVENANCE_ROOT="${nativeRoot}"; exec "/cpu/node" --max-old-space-size=4096 tools/build/build.cjs --format esm`,
                ],
                nativeResult: { ...file('/cpu/native.json'), sha256: NATIVE_RESULT_SHA256 },
                stRoot,
                stFiles: ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts', 'manifest.json'].map((name) =>
                    file(stRoot + '/' + name),
                ),
            },
            commands: [],
            files: esmFiles,
        },
        dts: {
            ...closed(P),
            status: 'PASS_FRESH_DTS235_SEVEN_GATES',
            buildNumber: 235,
            budget: {
                source: dtsRoot,
                producerSource: nativeRoot,
                evidence: '/cpu/dts-evidence',
                out: dtsRoot + '/build',
                sdk: sdkRoot,
                sourceCommit: P,
                esmResult: file('/cpu/esm.json'),
                esmFiles,
                command: ['/cpu/python', '-B', driverRoot + '/driver.py'],
                protectedRoots: [driverRoot + '/driver.json'],
            },
            sevenGatesSha256: H,
            sevenGates: gates,
            declarations: ['cocosair.module.d.ts', 'cocosair.legacy.d.ts'].map((name) => ({
                ...file(name),
                emittedSource: dtsRoot + '/build/' + name,
            })),
        },
        dtsGates: gates,
        dtsDriver: { commands, cwd: dtsRoot, evidence: '/cpu/dts-evidence' },
        native: {
            sourceProducer: N,
            status: 'PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION',
            exitCode: 0,
            abort: null,
            physicalClose: 'ECHILD',
            inputDrift: [],
            remainingDescendants: [],
            budget: {
                source: nativeRoot,
                out: stRoot,
                sourceCommit: N,
                command: [
                    '/bin/bash',
                    '-c',
                    'exec "/cpu/node" tools/physics/box3d/build-ready.mjs --out "' + stRoot + '"',
                ],
            },
            commands: nativeCommands,
            inputCount: 136,
            compiledSourceCount: 87,
            evidenceCount: 63,
            schemaSha256: SCHEMA_SHA256,
            moduleReleaseQualification: { ...EXPECTED_MODULE_QUALIFICATION },
            storageQualification: {
                status: 'PASS_LIMITED_PRODUCTION_EMPTY_STORAGE_CONTRACT',
                appC20Acceptance: false,
                afterCloseAppObservation: 'UNAVAILABLE',
                sameWorldOnly: true,
            },
            completionFiles: [
                'build-receipt.json',
                'artifact-audit.raw.json',
                'manifest.json',
                'consumer-ready.json',
            ].map((name) => file(stRoot + '/' + name)),
            artifacts: ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'].map(file),
        },
    };
    return { provenance, receipts, sdk, st };
}

function validate(value) {
    return validateProducerObjects(value.provenance, value.receipts, value.sdk, value.st);
}

test('synthetic receipts validate only parser behavior; not actual READY', () => validate(synthetic()));
test('file sets are SDK25, ST14, six runner files; original public fixture pinned', () => {
    assert.equal(SDK_FILES.length, 25);
    assert.equal(ST_FILES.length, 14);
    assert.equal(RUNNER_FILES.length, 6);
    assert(IMPORTED_FILES.some((r) => r.path.endsWith('/public-contract.mjs')));
});
for (const [name, mutate] of [
    ['missing receipt', (v) => delete v.provenance.receipts.native],
    ['unpublished fixture label', (v) => (v.provenance.fixtureCommit = 'HEAD')],
    ['old SDK234', (v) => (v.provenance.runtimeBuildNumber = 234)],
    ['wrong schema', (v) => (v.provenance.schemaSha256 = '0'.repeat(64))],
    ['wrong runtime/native source', (v) => (v.provenance.runtimeProducerCommit = 'c'.repeat(40))],
    ['relative dependencies root', (v) => (v.provenance.dependenciesRoot = 'node_modules')],
    ['receipt traversal', (v) => (v.provenance.receipts.esm.path = '../esm.json')],
    ['receipt absolute', (v) => (v.provenance.receipts.dts.path = '/tmp/dts.json')],
    ['old ESM status', (v) => (v.receipts.esm.status = 'PASS_FRESH_ESM230_BUILD')],
    ['wrong build', (v) => (v.receipts.esm.buildNumber = 230)],
    ['wrong producer', (v) => (v.receipts.esm.sourceCommit = 'c'.repeat(40))],
    ['ESM input drift', (v) => (v.receipts.esm.postInputDrift = ['drift'])],
    ['ESM failed close', (v) => (v.receipts.esm.physicalClose = 'SIGKILL')],
    ['ESM nonzero', (v) => (v.receipts.esm.exitCode = 1)],
    ['ESM abort', (v) => (v.receipts.esm.abort = 'timeout')],
    ['ESM remaining child', (v) => (v.receipts.esm.remainingDescendants = [123])],
    ['fake ESM command rows', (v) => (v.receipts.esm.commands = [{}])],
    ['wrong actual command', (v) => (v.receipts.esm.budget.command[2] += '; true')],
    ['omitted feature', (v) => (v.receipts.esm.budget.features = v.receipts.esm.budget.features.slice(1))],
    ['wrong counter', (v) => (v.receipts.esm.budget.counterBefore = 0)],
    ['wrong native receipt hash', (v) => (v.receipts.esm.budget.nativeResult.sha256 = 'f'.repeat(64))],
    ['different ST producer root', (v) => (v.receipts.esm.budget.stRoot = '/cpu/other')],
    ['SDK omitted file', (v) => v.receipts.esm.files.pop()],
    ['SDK substituted file', (v) => (v.sdk[6] = { ...v.sdk[6], sha256: 'f'.repeat(64) })],
    ['DTS old status', (v) => (v.receipts.dts.status = 'PASS_FRESH_DTS230_SEVEN_GATES')],
    ['DTS failed gate', (v) => (v.receipts.dtsGates[5].exitCode = 1)],
    ['DTS six gates', (v) => v.receipts.dtsGates.pop()],
    ['DTS wrong driver', (v) => (v.receipts.dtsDriver.commands[0] = ['/cpu/node', 'fake'])],
    ['DTS wrong emitted source', (v) => (v.receipts.dts.declarations[0].emittedSource = '/other.d.ts')],
    ['DTS wrong declaration hash', (v) => (v.receipts.dts.declarations[0].sha256 = 'f'.repeat(64))],
    ['DTS wrong ESM receipt', (v) => (v.receipts.dts.budget.esmResult.sha256 = 'f'.repeat(64))],
    ['DTS foreign consumer', (v) => (v.receipts.dtsDriver.commands[4][3] = '/cpu/not-the-driver-consumer.json')],
    ['missing module-release qualification', (v) => delete v.receipts.native.moduleReleaseQualification],
    [
        'module-release not original baseline',
        (v) => (v.receipts.native.moduleReleaseQualification.originalFactoryBaselinePreserved = false),
    ],
    [
        'invented app-close native qualification',
        (v) => (v.receipts.native.moduleReleaseQualification.appCloseExecuted = true),
    ],
    ['short native contract', (v) => (v.receipts.native.moduleReleaseQualification.nativeChecks = 119)],
    ['short WASM contract', (v) => (v.receipts.native.moduleReleaseQualification.wasmChecks = 7)],
    [
        'unpublished different same-source producer',
        (v) => {
            v.provenance.runtimeProducerCommit = 'c'.repeat(40);
            v.provenance.nativeProducerCommit = 'c'.repeat(40);
        },
    ],
    ['native whole attempt failed', (v) => (v.receipts.native.status = 'FAIL')],
    ['native raw passed but outer exit nonzero', (v) => (v.receipts.native.exitCode = 1)],
    ['native no ECHILD', (v) => (v.receipts.native.physicalClose = 'PGID_EMPTY')],
    ['native source drift', (v) => (v.receipts.native.inputDrift = ['drift'])],
    ['native wrong schema', (v) => (v.receipts.native.schemaSha256 = 'f'.repeat(64))],
    ['native missing new evidence', (v) => (v.receipts.native.evidenceCount = 58)],
    ['native missing gate', (v) => v.receipts.native.commands.pop()],
    ['native failed gate', (v) => (v.receipts.native.commands[42].exitCode = 1)],
    ['native failed command error', (v) => (v.receipts.native.commands[42].error = 'failed')],
    ['native old inputs', (v) => (v.receipts.native.inputCount = 111)],
    ['native omitted compiled unit', (v) => (v.receipts.native.compiledSourceCount = 84)],
    ['native false relative output', (v) => (v.receipts.native.budget.out += '/other')],
    [
        'native absolute file normalization bypass',
        (v) => (v.receipts.native.completionFiles[0].path = '/elsewhere/build-receipt.json'),
    ],
])
    test('reject synthetic ' + name, () => {
        const value = synthetic();
        mutate(value);
        assert.throws(() => validate(value));
    });
test('producer ROOT is not fixture ROOT; original relative OUT retained', () => {
    const v = synthetic(),
        root = '/cpu/execution',
        out = root + '/' + NATIVE_RELATIVE_OUTPUT;
    const result = validateNativeLayout(root, out, v.receipts.native, v.provenance);
    assert.equal(result.provenanceRoot, '/cpu/native-producer');
    assert.equal(result.relativeOutput, NATIVE_RELATIVE_OUTPUT);
    assert.throws(() => validateNativeLayout(root, '/cpu/arbitrary', v.receipts.native, v.provenance));
});
test('absent real artifacts cannot produce lock/READY', async () => {
    const root = mkdtempSync(join(tmpdir(), 'module-missing-'));
    try {
        await assert.rejects(
            freezeInputs({
                sourceRoot: root,
                sdkDir: root,
                stDir: root,
                evidenceRoot: root,
                provenancePath: 'missing.json',
                output: join(root, 'lock.json'),
            }),
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
test('dependency complete entity/hash inventory detects file, empty directory, symlink and escape changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'module-deps-'));
    try {
        writeFileSync(join(root, 'a'), 'one');
        const first = dependencyInventory(root);
        writeFileSync(join(root, 'a'), 'two');
        assert.notDeepEqual(dependencyInventory(root), first);
        writeFileSync(join(root, 'a'), 'one');
        assert.deepEqual(dependencyInventory(root), first);
        mkdirSync(join(root, 'empty'));
        assert.notDeepEqual(dependencyInventory(root), first);
        symlinkSync('a', join(root, 'link'));
        const linked = dependencyInventory(root);
        assert.equal(linked.links, 1);
        unlinkSync(join(root, 'link'));
        symlinkSync('/etc/passwd', join(root, 'link'));
        assert.throws(() => dependencyInventory(root));
        unlinkSync(join(root, 'link'));
        symlinkSync('missing', join(root, 'link'));
        assert.throws(() => dependencyInventory(root));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
test('source is CPU-before-consumer, SIGKILL timeout is failure, original supervisor semantics pinned', () => {
    const run = readFileSync(join(here, 'run.mjs'), 'utf8'),
        wrapper = readFileSync(join(here, 'execute-once.py'), 'utf8');
    assert(run.search(/run\(\s*'cpu-controls'/) < run.search(/run\(\s*'consumer'/));
    assert(run.includes("killSignal: 'SIGKILL'") || run.includes("killSignal:'SIGKILL'"));
    assert(run.includes('30000') && run.includes('300000'));
    for (const token of [
        '"wallSeconds": 334',
        '"rssBytes": 2 * 1024**3',
        '"outputBytes": 56 * 1024**2',
        '"waitpidScope") == "ALL_CHILDREN_-1"',
        '"remainingDescendants") == []',
        '"remainingProcessGroup") == []',
        'READONLY_BUDGET, 4',
    ])
        assert(wrapper.includes(token), token);
    assert(!wrapper.includes('os.killpg('));
});
test('actual consumer finally close decision uses own-property, never truthiness or retry after own close', async () => {
    const source = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    const start =
        source.indexOf('    report.fixtureOwnCloseObserved=') >= 0
            ? source.indexOf('    report.fixtureOwnCloseObserved=')
            : source.indexOf('    report.fixtureOwnCloseObserved =');
    const ifStart = source.indexOf('if', start),
        brace = source.indexOf('{', ifStart);
    let end = brace,
        depth = 0;
    for (; end < source.length; end++) {
        if (source[end] === '{') depth++;
        else if (source[end] === '}' && !--depth) {
            end++;
            break;
        }
    }
    assert(start > 0 && end > brace);
    // Execute the exact source block, only exposing mocked app.close and observation sinks.
    const block = source.slice(start, end);
    for (const initial of [{ close: null }, { closeError: '' }, { close: undefined }, {}]) {
        const report = { ...initial, fallbackCloseCalls: 0 },
            state = { calls: 0 };
        const context = {
            report,
            app: {
                async close() {
                    state.calls++;
                    return { status: 'released' };
                },
            },
            safeRecord() {},
            errorText: String,
            failure: undefined,
            Object,
        };
        await vm.runInNewContext('(async()=>{' + block + '})()', context);
        assert.equal(state.calls, Object.keys(initial).length ? 0 : 1);
    }
});

test('actual qualification adapter forwards full manifest; descriptor-only regression is rejected', () => {
    const source = readFileSync(join(here, 'inputs.mjs'), 'utf8');
    const a = source.indexOf('export function qualifyModuleArtifacts'),
        b = source.indexOf('export async function verifyReady', a);
    assert(a >= 0 && b > a);
    const code = source.slice(a, b).replace('export ', '');
    const manifest = {
        schemaVersion: 1,
        schemaSha256: SCHEMA_SHA256,
        artifacts: [{ path: 'native.wasm', sha256: H }],
        appliedPatches: ['exact'],
    };
    const input = {
        manifest,
        native: { schema: 'synthetic-only' },
        wasm: { identity: manifest },
        receipt: { syntheticOnly: true },
        fixtureSha256: H,
    };
    const evaluate = (text) =>
        vm.runInNewContext(text + ';qualifyModuleArtifacts(input)', {
            input,
            verifyModuleReleaseQualification(value) {
                assert.deepEqual(value.identity, manifest);
                return true;
            },
        });
    assert.equal(evaluate(code), true);
    const narrowed = code.replace(/identity:\s*manifest/, 'identity: manifest.identity');
    assert.notEqual(narrowed, code);
    assert.throws(() => evaluate(narrowed));
});
test('actual final journal close/read failures retain the existing primary and partial report', () => {
    const source = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    const closeAt = source.indexOf('closeSync(journal)');
    const start = source.lastIndexOf('    try', closeAt);
    const end = source.indexOf('    writeFileSync(', closeAt);
    assert(start > 0 && end > start);
    const primary = new Error('primary');
    const report = { status: 'PASS', journalErrors: [] };
    const context = {
        report,
        failure: primary,
        journal: 1,
        out: '/cpu/output',
        errorText: String,
        closeSync() {
            throw new Error('close-journal');
        },
        entry() {
            throw new Error('read-journal');
        },
    };
    vm.runInNewContext(source.slice(start, end), context);
    assert.equal(context.failure, primary);
    assert.equal(report.status, 'FAIL');
    assert.equal(report.journal.sha256, null);
    assert.equal(report.journalErrors.length, 2);
});
test('actual wrapper closes ALL_CHILDREN and never upgrades nonzero, timeout or remaining descendants', () => {
    const code = `import importlib.util,sys\nspec=importlib.util.spec_from_file_location('cpu_wrapper',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\ngood={'status':'PHYSICALLY_CLOSED','subreaper':True,'waitpidECHILD':True,'waitpidScope':'ALL_CHILDREN_-1','remainingDescendants':[],'remainingProcessGroup':[],'rawReturnCode':0,'budgetViolation':None}\nassert m.clean_child(good)\nfor key,value in [('status','FAILED'),('subreaper',False),('waitpidECHILD',False),('waitpidScope','PGID_ONLY'),('remainingDescendants',[1]),('remainingProcessGroup',[1]),('rawReturnCode',-9),('budgetViolation','wall')]:\n bad=dict(good);bad[key]=value;assert not m.clean_child(bad)\nassert m.BUDGET=={'wallSeconds':334,'rssBytes':2147483648,'outputBytes':58720256}\nassert m.PREPARATION_LIMIT==8388608 and m.TOTAL_LIMIT==67108864\nprint('PASS_CPU_WRAPPER_CLOSURE_11_CHECKS')`;
    const result = spawnSync('python3', ['-B', '-c', code, join(here, 'execute-once.py')], {
        encoding: 'utf8',
        timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.match(result.stdout, /PASS_CPU_WRAPPER/);
});
test('actual CLI missing provenance is NOT_READY before any SDK or lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'sphere-not-ready-'));
    try {
        const result = spawnSync(
            process.execPath,
            [join(here, 'inputs.mjs'), '--freeze', root, root, root, root, 'missing.json', join(root, 'lock.json')],
            { encoding: 'utf8', timeout: 5000 },
        );
        assert.equal(result.status, 2);
        assert.match(result.stderr, /NOT_READY/);
        assert.match(result.stderr, /NOT_RUN_BY_ADMISSION/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
test('actual Python output accounting counts exact regular bytes and fails closed on links, missed reads and special files', () => {
    const code = `import importlib.util,sys,tempfile,os\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('cpu_accounting',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nchecks=0\ndef rejects(call,kind):\n global checks\n try:call()\n except kind:checks+=1\n else:raise AssertionError('unsafe output accounting was accepted')\nwith tempfile.TemporaryDirectory() as d:\n root=Path(d)/'output';root.mkdir();assert m.disk_bytes(root)==0;checks+=1\n (root/'a').write_bytes(b'abc');(root/'sub').mkdir();(root/'sub'/'b').write_bytes(b'1234');assert m.disk_bytes(root)==7;checks+=1\n (root/'link').symlink_to('a');rejects(lambda:m.disk_bytes(root),ValueError);(root/'link').unlink()\n (root/'dirlink').symlink_to('sub',target_is_directory=True);rejects(lambda:m.disk_bytes(root),ValueError);(root/'dirlink').unlink()\n rootlink=Path(d)/'rootlink';rootlink.symlink_to(root,target_is_directory=True);rejects(lambda:m.disk_bytes(rootlink),ValueError)\n os.mkfifo(root/'fifo');rejects(lambda:m.disk_bytes(root),ValueError);(root/'fifo').unlink()\n original=m.os.walk\n def missing(root,**kwargs):\n  assert kwargs['followlinks'] is False\n  kwargs['onerror'](PermissionError('injected unreadable subtree'))\n  return iter([])\n m.os.walk=missing\n try:rejects(lambda:m.disk_bytes(root),PermissionError)\n finally:m.os.walk=original\n original_lstat=Path.lstat\n def vanished(self,*args,**kwargs):\n  if self.name=='b':raise FileNotFoundError('injected vanished file')\n  return original_lstat(self,*args,**kwargs)\n Path.lstat=vanished\n try:rejects(lambda:m.disk_bytes(root),FileNotFoundError)\n finally:Path.lstat=original_lstat\n assert m.disk_bytes(root)==7;checks+=1\nprint('PASS_CPU_STRICT_OUTPUT_ACCOUNTING',checks)\nassert checks==9`;
    const result = spawnSync('python3', ['-B', '-c', code, join(here, 'execute-once.py')], {
        encoding: 'utf8',
        timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.match(result.stdout, /PASS_CPU_STRICT_OUTPUT_ACCOUNTING 9/);
});

// Only a synthetic receipt-shaped object; no app/module is created by these validator controls.
function syntheticPublicResult() {
    const zero = {
        schema: 'air-box3d-module-release-snapshot-v1',
        schemaVersion: 1,
        core: { worlds: 0, trackedRequestedBytes: 1024 },
        bridge: {
            worlds: 0,
            allocations: 0,
            bytes: 0,
            debugShapeHandles: 0,
            temporaryNodes: 0,
            temporaryBytes: 0,
            wireBuffers: 0,
            wireCapacityRecords: 0,
            wireLengthRecords: 0,
            capturedWorlds: 0,
        },
        mesh: { resources: 0, leases: 0, references: 0, borrowNodes: 0, resourceStorageBytes: 0 },
    };
    const moduleRelease = {
        status: 'VERIFIED',
        verified: true,
        baseline: structuredClone(zero),
        terminal: structuredClone(zero),
        errors: [],
    };
    return {
        status: PASS,
        fixtureStatus: PASS,
        profile: PROFILE,
        harnessQualification: QUALIFICATION,
        qualification: { afterCloseNativeProbe: 'NOT_CALLED' },
        moduleFactoryReplaced: false,
        appCreateCalls: 1,
        fixtureOwnCloseObserved: true,
        fallbackCloseCalls: 0,
        sceneRunCalls: 1,
        releaseSceneCalls: 1,
        closeCalls: 1,
        completedFrames: 2,
        frames: [1, 2].map((step) => ({ step, dt: 1 / 60, afterDraw: true })),
        debug: { primitives: [{ explicitCPUSyntheticOnly: true }] },
        debugRetainedAfterClose: true,
        nonempty: { bodies: 4, shapes: 4, joints: 1 },
        activeResources: [{ cacheLeases: 1, shapeBorrows: 2 }],
        release: { status: 'released', physicsSceneRelease: { status: 'RESTORED' }, failures: [], pending: [] },
        sceneInvalid: true,
        materialInvalid: true,
        tokenCurrent: false,
        currentSceneNull: true,
        afterRelease: { bodies: 0, shapes: 0, contacts: 0, joints: 0 },
        resourcesAfterRelease: [],
        close: {
            status: 'released',
            failures: [],
            pending: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: ['module', 'world'].map((resource) => ({
                    backend: 'box3d',
                    resource,
                    cleanup: 'released',
                    retained: [],
                })),
                moduleRelease,
            },
        },
        moduleRelease,
        inputsUnchanged: true,
        hostClosed: true,
        hostErrors: [],
        journalErrors: [],
        hostSha256: HOST_SHA256,
        transport: ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].map((path) => ({ path })),
        moduleResolution: [{}],
    };
}
test('synthetic finite public result validates registered terminal chains only, not real qualification', () =>
    validateResult(syntheticPublicResult()));
for (const [name, mutate] of [
    ['single rather than shared terrain', (r) => (r.activeResources[0].shapeBorrows = 1)],
    ['no debug activity', (r) => (r.debug.primitives = [])],
    ['extra frame', (r) => r.frames.push({ step: 3, dt: 1 / 60, afterDraw: true })],
    ['second app', (r) => (r.appCreateCalls = 2)],
    ['duplicate close', (r) => (r.closeCalls = 2)],
    ['fallback used', (r) => (r.fallbackCloseCalls = 1)],
    ['failed module status with zero terminal', (r) => (r.moduleRelease.status = 'FAILED')],
    ['binding cleanup error with zero terminal', (r) => r.moduleRelease.errors.push({ phase: 'binding-dispose' })],
    ['global world retained', (r) => (r.moduleRelease.terminal.core.worlds = 1)],
    ['module bytes rebase', (r) => r.moduleRelease.terminal.core.trackedRequestedBytes++],
    ['bridge allocation retained', (r) => (r.moduleRelease.terminal.bridge.allocations = 1)],
    ['mesh borrow retained', (r) => (r.moduleRelease.terminal.mesh.borrowNodes = 1)],
    ['postclose probe', (r) => (r.qualification.afterCloseNativeProbe = 'CALLED')],
    ['primary failure masked by verified terminal', (r) => (r.error = 'original fixture error')],
])
    test('reject synthetic public ' + name, () => {
        const r = syntheticPublicResult();
        mutate(r);
        assert.throws(() => validateResult(r));
    });
test('actual source inventory requires all 136 unique producer inputs, not old 120', () => {
    const text = readFileSync(join(here, 'inputs.mjs'), 'utf8');
    const start = text.indexOf('function sourceInventory('),
        end = text.indexOf('export function qualifyModuleArtifacts', start);
    const code = text.slice(start, end);
    const evaluate = (rows) =>
        vm.runInNewContext(code + '; sourceInventory("root","st")', {
            assert,
            json: () => ({ inputHashes: rows }),
            entry: (_root, path) => ({ path, bytes: 1, sha256: H }),
            sourceEntries: () => [],
            Map,
        });
    const rows = Array.from({ length: 136 }, (_, i) => file('source-' + i));
    assert.equal(evaluate(rows).length, 136);
    assert.throws(() => evaluate(rows.slice(0, 120)));
    assert.throws(() => evaluate([...rows.slice(0, 135), rows[0]]));
});
test('same shared audited supervisor and default host/factory; no postclose native/module API', () => {
    const consumer = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    assert.match(consumer, /installHost/);
    assert.match(consumer, /runPublicModuleRelease/);
    assert(!/moduleFactory\s*[:=]|captureModuleReleaseSnapshot\(/.test(consumer));
    assert(!/runPublicSphereCapsule|C20|cycles/.test(readFileSync(join(here, 'run.mjs'), 'utf8')));
});
