'use strict';
// Synthetic contract observations only. Never a browser or performance measurement.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { DESIGN, stats } = require('../../tools/verify/interactive-performance.cjs');
const ROOT = path.resolve(__dirname, '../..');
const LEGACY_INPUTS = [
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'examples/interactive-timeline/index.html',
    'examples/interactive-timeline/src/main.ts',
    'examples/interactive-timeline/src/timeline-contract.ts',
    'examples/interactive-timeline/assets/original-16s.wav',
    'tools/verify/interactive-performance.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
];
function fp(p) {
    const bytes = fs.readFileSync(path.resolve(ROOT, p));
    return { path: p, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function fixture(dir, inputs = LEGACY_INPUTS, schema = 'ier-performance-pilot/1') {
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(255);
    const file = path.join(dir, 'contract.png');
    fs.writeFileSync(file, PNG.sync.write(png));
    const raw = Array.from({ length: 6 }, (_, i) => ({
        timestamp: 100 + i * 1000,
        interval: i ? 1000 : null,
        nativeFrame: i + 1,
        updateMs: 1,
        submitMs: 2,
    }));
    const rows = DESIGN.dprs.flatMap((dpr) =>
        DESIGN.workloads.flatMap((workload) =>
            DESIGN.screenshots.flatMap((screenshots) =>
                [0, 1, 2].map((rep) => {
                    const toolSamples = screenshots
                        ? Array.from({ length: 4 }, () => ({ operation: 'page.screenshot', wallMs: 3 }))
                        : [];
                    return {
                        dpr,
                        workload,
                        screenshots,
                        rep,
                        version: 'SYNTHETIC_CPU_CONTRACT',
                        pageErrors: [],
                        consoleErrors: [],
                        observedWindowMs: 5000,
                        renderer: { renderer: 'SYNTHETIC_CPU_CONTRACT', gpuTime: 'unavailable' },
                        raw: JSON.parse(JSON.stringify(raw)),
                        toolSamples,
                        captures: screenshots ? Array.from({ length: 4 }, () => fp(file)) : [],
                        statistics: {
                            frameCallbackMs: stats([1000, 1000, 1000, 1000, 1000]),
                            cpuUpdateMarkersMs: stats(raw.map((x) => x.updateMs)),
                            cpuSubmitMarkersMs: stats(raw.map((x) => x.submitMs)),
                            screenshotWallMs: screenshots ? stats([3, 3, 3, 3]) : null,
                        },
                        release: { refs: Array.from({ length: 3 }, () => ({ before: 1, after: 0 })) },
                    };
                }),
            ),
        ),
    );
    return {
        schemaVersion: schema,
        result: 'LIMITED',
        completed: false,
        subset: true,
        design: DESIGN,
        budget: {
            result: 'NOT_RUN',
            device: 'NOT_PROVIDED',
            frameTimeBudget: 'NOT_PROVIDED',
            visibleQualityBudget: 'NOT_PROVIDED',
            droppedFrames: 'UNKNOWN: no deadline budget, no assumed 60fps',
        },
        fingerprints: inputs.map(fp),
        rows,
    };
}
module.exports = { fixture, LEGACY_INPUTS };
