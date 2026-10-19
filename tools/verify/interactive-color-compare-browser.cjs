'use strict';
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    { PNG } = require('pngjs');
const ROOT = path.resolve(__dirname, '../..'),
    hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
    INPUTS = [
        'build/cocosair.module.js',
        'test/fixtures/interactive-color-compare/index.html',
        'test/fixtures/interactive-color-compare/main.ts',
        'examples/water-multipass/scene.effect.json',
        'tools/verify/interactive-color-compare-browser.cjs',
        'tools/verify/interactive-color-compare.tsconfig.json',
        'tools/verify/browser-engines.cjs',
        'tools/verify/competitive-example-server.cjs',
        'build/cocosair.module.d.ts',
        'tools/verify/interactive-color-compare-audit.cjs',
    ];
const ENGINES = ['chromium', 'firefox', 'webkit'];
const DESIGN = Object.freeze({
    targetSize: [256, 256],
    colorChannelTolerance: 2,
    clipEdgeChangedPixelBudget: 256,
    alphaCenter: [128, 115, 0],
    referenceComparison: 'NOT_RUN',
});
function selectedEngines(choice = 'all') {
    if (choice === 'all') return [...ENGINES];
    if (!ENGINES.includes(choice)) throw Error('unknown browser');
    return [choice];
}
const MODES = ['plain', 'oblique', 'discard', 'alpha-base', 'alpha-instance'];
function differences(a, b) {
    if (
        a?.length !== 256 * 256 * 4 ||
        b?.length !== a.length ||
        [...a, ...b].some((x) => !Number.isInteger(x) || x < 0 || x > 255)
    )
        throw Error('complete RGBA8 captures required');
    let changed = 0,
        max = 0;
    for (let i = 0; i < a.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k]));
        max = Math.max(max, d);
        if (d > 2) changed++;
    }
    return { changed, max };
}
function checkRow(r) {
    const errors = [];
    try {
        if (
            r.pageErrors?.length !== 0 ||
            r.consoleErrors?.length !== 0 ||
            r.states?.length !== 5 ||
            r.states.map((x) => x.mode).join(',') !== MODES.join(',')
        )
            throw Error('runtime/state coverage');
        for (const state of r.states) {
            differences(state.bytes, state.bytes);
            if (
                !Array.isArray(state.projection) ||
                state.projection.length !== 16 ||
                !state.projection.every(Number.isFinite)
            )
                throw Error('finite 16-value native projection required');
        }
        const [plain, oblique, discard, base, instance] = r.states;
        const red = (b) => {
            let n = 0;
            for (let i = 0; i < b.length; i += 4) if (b[i] > 180 && b[i + 1] < 20) n++;
            return n;
        };
        if (
            red(plain.bytes) < 1000 ||
            red(discard.bytes) < 500 ||
            red(discard.bytes) > 0.8 * red(plain.bytes) ||
            red(discard.bytes) < 0.2 * red(plain.bytes)
        )
            errors.push('visible retained and rejected sides');
        const clipping = differences(oblique.bytes, discard.bytes);
        if (clipping.changed > 256) errors.push('oblique/discard differ beyond frozen 256 edge-pixel budget');
        if (JSON.stringify(oblique.projection) === JSON.stringify(discard.projection))
            errors.push('native oblique matrix missing');
        if (differences(base.bytes, instance.bytes).changed !== 0) errors.push('base/instance alpha mismatch');
        for (const s of [base, instance]) {
            const p = s.material?.[0];
            if (p?.blendTargets?.[0]?.blend !== true || p?.depthWrite !== false)
                errors.push('native blend/depth state');
            const i = (128 * 256 + 128) * 4,
                center = s.bytes.slice(i, i + 4);
            if (Math.abs(center[0] - 128) > 2 || Math.abs(center[1] - 115) > 2 || center[2] > 2)
                errors.push('source-over translucent center');
            let green = 0,
                mixed = 0;
            for (let j = 0; j < s.bytes.length; j += 4) {
                if (s.bytes[j] < 5 && s.bytes[j + 1] > 200) green++;
                if (s.bytes[j] > 30 && s.bytes[j] < 200 && s.bytes[j + 1] > 40) mixed++;
            }
            if (green < 100 || mixed < 100) errors.push('circular translucent shape/background');
        }
        for (const s of r.states) {
            const b = fs.readFileSync(path.resolve(ROOT, s.png.path));
            if (hash(b) !== s.png.sha256 || b.length !== s.png.bytes) throw Error('PNG identity');
            const p = PNG.sync.read(b);
            let redPixels = 0;
            for (let i = 0; i < p.data.length; i += 4) if (p.data[i] > 45 && p.data[i + 2] < 25) redPixels++;
            if (redPixels < 50) errors.push('compositor target missing ' + s.mode);
        }
        if (
            r.release?.samePromise !== true ||
            r.release?.receipt?.refs?.length !== 5 ||
            r.release.receipt.refs.some((x) => x.before !== 1 || x.after !== 0)
        )
            errors.push('owned cleanup');
        return { pass: errors.length === 0, errors, clipping };
    } catch (e) {
        errors.push(String(e.message || e));
        return { pass: false, errors };
    }
}
function checkReport(r, { selected = false } = {}) {
    const errors = [];
    try {
        if (
            r.schemaVersion !== 'ier-color-compare/2' ||
            r.sourceStatus !== 'recreated' ||
            r.subset !== true ||
            r.completed !== false ||
            JSON.stringify(r.design) !== JSON.stringify(DESIGN)
        )
            errors.push('scope/design contract');
        if (
            !Array.isArray(r.engines) ||
            !r.engines.length ||
            new Set(r.engines).size !== r.engines.length ||
            r.engines.some((e) => !ENGINES.includes(e))
        )
            throw Error('invalid requested browser matrix');
        if (!selected && (r.engines.length !== ENGINES.length || ENGINES.some((e) => !r.engines.includes(e))))
            errors.push('full browser matrix not selected');
        if (
            r.rows?.length !== r.engines.length ||
            r.engines.some((e) => r.rows.filter((x) => x.engine === e && x.version).length !== 1)
        )
            errors.push('exact selected engine coverage');
        for (const row of r.rows || []) errors.push(...checkRow(row).errors.map((e) => row.engine + ': ' + e));
        if (
            r.fingerprints?.length !== INPUTS.length ||
            new Set(r.fingerprints?.map((f) => f.path)).size !== INPUTS.length
        )
            errors.push('exact input closure');
        for (const input of INPUTS) {
            const f = r.fingerprints?.find((x) => x.path === input),
                bytes = fs.readFileSync(path.join(ROOT, input));
            if (f?.bytes !== bytes.length || f.sha256 !== hash(bytes)) errors.push('current input ' + input);
        }
    } catch (e) {
        errors.push(String(e.message || e));
    }
    return {
        scopePassed: !selected && errors.length === 0,
        ...(selected ? { selectedScopePassed: errors.length === 0 } : {}),
        errors,
    };
}
async function main() {
    const choice = process.argv.find((x) => x.startsWith('--browser='))?.slice(10) || 'all',
        engines = selectedEngines(choice),
        selected = choice !== 'all';
    const verify = process.argv.find((x) => x.startsWith('--verify='))?.slice(9);
    if (verify) {
        const previous = JSON.parse(fs.readFileSync(verify));
        if (selected && JSON.stringify(engines) !== JSON.stringify(previous.engines))
            throw Error('verification browser selection mismatch');
        const result = checkReport(previous, { selected });
        console.log(JSON.stringify(result));
        process.exitCode = (selected ? result.selectedScopePassed : result.scopePassed) ? 0 : 1;
        return;
    }
    const out = process.argv.find((x) => x.startsWith('--out='))?.slice(6);
    if (!out || fs.existsSync(out)) throw Error('explicit new --out required');
    const artifacts = path.resolve(out.replace(/\.json$/, '') + '-artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const report = {
            schemaVersion: 'ier-color-compare/2',
            engines,
            executionChannel: 'Lead',
            sourceStatus: 'recreated',
            subset: true,
            completed: false,
            startedAt: new Date().toISOString(),
            command: process.argv.join(' '),
            cwd: ROOT,
            design: DESIGN,
            fingerprints: INPUTS.map((p) => {
                const b = fs.readFileSync(path.join(ROOT, p));
                return { path: p, bytes: b.length, sha256: hash(b) };
            }),
            rows: [],
        },
        server = await require('./competitive-example-server.cjs').startExampleServer(ROOT);
    try {
        for (const engine of engines) {
            const browser = await require('playwright')[engine].launch({
                    ...require('./browser-engines.cjs').launchOptions(engine),
                    headless: true,
                }),
                page = await browser.newPage({ viewport: { width: 512, height: 512 } }),
                row = { engine, version: browser.version(), states: [], pageErrors: [], consoleErrors: [] };
            report.rows.push(row);
            page.on('pageerror', (e) => row.pageErrors.push(String(e)));
            page.on('console', (m) => {
                if (m.type() === 'error') row.consoleErrors.push(m.text());
            });
            try {
                await page.goto(server.origin + '/test/fixtures/interactive-color-compare/');
                await page.waitForFunction(() => window.__colorCompare, null, { polling: 20, timeout: 20000 });
                for (const mode of MODES) {
                    const state = await page.evaluate((mode) => window.__colorCompare.select(mode), mode),
                        file = path.join(artifacts, engine + '-' + mode + '.png');
                    await page.screenshot({ path: file });
                    const bytes = fs.readFileSync(file);
                    row.states.push({
                        ...state,
                        png: {
                            path: path.relative(ROOT, file).replace(/\\/g, '/'),
                            bytes: bytes.length,
                            sha256: hash(bytes),
                        },
                    });
                }
                row.release = await page.evaluate(async () => {
                    const a = window.__colorCompare.release(),
                        b = window.__colorCompare.release();
                    return { samePromise: a === b, receipt: await a };
                });
            } catch (e) {
                row.pageErrors.push(String(e.stack || e));
            } finally {
                await browser.close();
            }
            row.validation = checkRow(row);
            console.log(engine, JSON.stringify(row.validation));
        }
    } finally {
        await server.close();
    }
    report.endedAt = new Date().toISOString();
    report.validation = checkReport(report);
    report.scopePassed = report.validation.scopePassed;
    if (selected) {
        report.selectedValidation = checkReport(report, { selected: true });
        report.selectedScopePassed = report.selectedValidation.selectedScopePassed;
    }
    report.exitCode = (selected ? report.selectedScopePassed : report.scopePassed) ? 0 : 1;
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.exitCode = report.exitCode;
}
module.exports = { differences, checkRow, checkReport, selectedEngines, INPUTS, DESIGN };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
