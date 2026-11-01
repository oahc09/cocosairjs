/* Builds a real npm tarball and tests an offline installed consumer, never edits it.
 * Requires npm run build:all first. Writes only --out (must be new) and temp consumer.
 */
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os'),
    crypto = require('node:crypto');
const assert = require('node:assert/strict'),
    { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'),
    out = path.resolve(
        process.argv.find((x) => x.startsWith('--out='))?.slice(6) || path.join(root, 'output/math-tarball'),
    );
if (fs.existsSync(out)) throw Error('Output exists: ' + out);
fs.mkdirSync(out, { recursive: true });
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-math-consumer-'));
const report = {
    timestamp: new Date().toISOString(),
    head: process.env.SDK_CANDIDATE_HEAD || process.env.GITHUB_SHA || 'working-tree',
    checks: [],
    passed: false,
};
function run(label, executable, args, cwd) {
    // Windows cannot spawn npm.cmd directly without a shell. Invoke npm's JS
    // entry with this Node executable, preserving arguments without shell quoting.
    if (process.platform === 'win32' && executable === 'npm') {
        const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
        assert.ok(fs.existsSync(npmCli), 'Missing npm CLI beside the selected Node executable');
        args = [npmCli, ...args];
        executable = process.execPath;
    }
    const result = spawnSync(executable, args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: path.join(temp, 'npm-cache') },
        timeout: 120000,
    });
    fs.writeFileSync(path.join(out, label + '.stdout'), result.stdout || '');
    fs.writeFileSync(path.join(out, label + '.stderr'), result.stderr || '');
    report.checks.push({ label, exitCode: result.status, signal: result.signal });
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    return result.stdout;
}
try {
    const packed = JSON.parse(run('pack', 'npm', ['pack', '--json', '--pack-destination', out], root))[0];
    const tarball = path.join(out, packed.filename);
    report.tarball = {
        name: packed.filename,
        sha256: hash(fs.readFileSync(tarball)),
        files: packed.files.map((x) => x.path),
    };
    for (const file of ['build/npm/cocosair.math.js', 'build/cocosair.math.d.ts', 'build/cocosair.math.legacy.d.ts'])
        assert.ok(report.tarball.files.includes(file), file);
    assert.ok(!report.tarball.files.some((file) => /math.*\.map$/.test(file)));
    assert.ok(report.tarball.files.includes('build/README.md'), 'SDK file-selection guide must ship with the package');
    assert.ok(
        !report.tarball.files.some((file) => file.startsWith('build/metadata/')),
        'build receipts are not runtime package resources',
    );
    fs.writeFileSync(
        path.join(temp, 'package.json'),
        '{"name":"math-consumer","version":"0.0.0","private":true,"type":"module"}',
    );
    run(
        'offline-install',
        'npm',
        ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
        temp,
    );
    run(
        'node-import',
        process.execPath,
        [
            '--input-type=module',
            '-e',
            "const before=Object.getOwnPropertyDescriptors(globalThis); const m=await import('cocosair.js/math');if(new m.Vec3(3,4,12).length()!==13)throw Error('math'); for(const k of ['cc','CocosEngine','window','document'])if(Object.getOwnPropertyDescriptor(globalThis,k)!==before[k]&&(k in globalThis)!==(k in before))throw Error('global '+k);console.log(Object.keys(m).sort().join(','));",
        ],
        temp,
    );
    const source =
        "import {Vec2,Vec3,Vec4,Mat3,Mat4,Quat,Color,Size,Rect,clamp01} from 'cocosair.js/math'; const matrix:Mat4=Mat4.fromRTS(new Mat4(),new Quat(),new Vec3(),new Vec3(1,1,1)); const v:Vec2=new Vec3().toVec2(); console.log(matrix,v,new Vec4(),new Mat3(),new Color(),new Size(),new Rect(),clamp01(2));\n";
    fs.writeFileSync(path.join(temp, 'consumer.ts'), source);
    fs.writeFileSync(path.join(temp, 'consumer.mts'), source);
    const compiler = require.resolve('typescript/lib/tsc.js');
    report.typescript = require('typescript/package.json').version;
    for (const mode of ['node', 'nodenext'])
        run(
            'types-' + mode,
            process.execPath,
            [
                compiler,
                '--noEmit',
                '--strict',
                '--skipLibCheck',
                '--target',
                'es2020',
                '--module',
                mode === 'node' ? 'esnext' : 'nodenext',
                '--moduleResolution',
                mode,
                mode === 'node' ? 'consumer.ts' : 'consumer.mts',
            ],
            temp,
        );
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'build/metadata/math-build.json'), 'utf8'));
    const map = JSON.parse(fs.readFileSync(path.join(root, 'build/cocosair.module.js.map'), 'utf8'));
    const mapped = new Map(map.sources.map((name, i) => [path.resolve(root, 'build', name), map.sourcesContent[i]]));
    const common = [];
    for (const [relative, expected] of Object.entries(receipt.inputs)) {
        assert.equal(hash(fs.readFileSync(path.join(root, relative))), expected, 'math source changed ' + relative);
        const content = mapped.get(path.join(root, relative));
        if (content != null) {
            assert.equal(hash(content), expected, 'main-map math source differs ' + relative);
            common.push(relative);
        }
    }
    for (const name of ['vec2', 'vec3', 'vec4', 'quat', 'mat3', 'mat4'])
        assert.ok(common.includes('src/cocos/core/math/' + name + '.ts'), 'missing main-map math ' + name);
    report.canonicalMapInputs = common;
    report.mathOutputs = receipt.outputs;
    report.passed = true;
} catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(report, null, 2));
    fs.rmSync(temp, { recursive: true, force: true });
    console.log(JSON.stringify(report));
}
