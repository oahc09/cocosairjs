/* Read-only U08-C source/math report producer. Prints JSON; callers choose where to retain it.
 * This never launches a browser and never marks T33 accepted. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sh = require('./upstream-probe-sh-reference.js');
const root = path.resolve(__dirname, '../..');
const sourceAnchors = {
    'src/cocos/gi/light-probe/delaunay.ts': ['public coefficients: Vec3[]'],
    'src/cocos/gi/light-probe/light-probe.ts': [
        'export class LightProbesData',
        'public getInterpolationSHCoefficients',
    ],
    'src/cocos/scene-graph/scene-globals.ts': ['export class LightProbeInfo', 'set data (val: LightProbesData'],
    'src/cocos/gi/light-probe/sh.ts': [
        'private static basisFunctions',
        'private static basisOverPI',
        'public static updateUBOData',
        'public static project',
        'public static convolveCosine',
    ],
    'src/cocos/render-scene/scene/model.ts': ['public updateSHUBOs', 'SHCls.reduceRinging', 'SHCls.updateUBOData'],
    'src/cocos/rendering/define.ts': ['export enum UBOSHEnum', "public static readonly NAME = 'CCSH'"],
    'src/cocos/asset/assets/texture-cube.ts': ['enum FaceIndex', 'export enum MipmapMode'],
    'src/cocos/gfx/webgl2/webgl2-commands.ts': ['WebGLConstants.TEXTURE_CUBE_MAP_POSITIVE_X + layer'],
    'src/cocos/render-scene/scene/reflection-probe.ts': [
        'const cameraDir:',
        'public captureCubemap',
        'public updateCameraDir',
    ],
    'src/cocos/rendering/reflection-probe/reflection-probe-flow.ts': [
        '} else if (EDITOR) {',
        'for (let faceIdx = 0; faceIdx < 6;',
    ],
    'src/air/rendering/color-contract.ts': ['export function validateAirPrefilteredEnvironment'],
    'src/air/builtin/builtin-glsl4.ts': ['vec3 SHEvaluate(vec3 normal)'],
};
const artifacts = [
    'tools/verify/upstream-probe-sh-reference.js',
    'tools/verify/upstream-probe-sh-reference.test.cjs',
    'tools/verify/upstream-probe-research.cjs',
    'test/smoke/upstream-probe-sh-storage.test.ts',
    'test/fixtures/upstream-probe-capture/upstream-probe-capture.html',
    'test/fixtures/upstream-probe-capture/upstream-probe-capture.js',
    'docs/reference/upstream-probe-sh-research.md',
];
function fingerprint(file, anchors = []) {
    const bytes = fs.readFileSync(path.join(root, file));
    const text = bytes.toString('utf8');
    return {
        path: file,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        anchors: anchors.map((anchor) => {
            const offset = text.indexOf(anchor);
            if (offset < 0) throw new Error(`SOURCE_ANCHOR_CHANGED: ${file}: ${anchor}`);
            return { text: anchor, line: text.slice(0, offset).split('\n').length };
        }),
    };
}
let weightSum = 0;
const size = 128;
for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) weightSum += 6 * sh.solidAngle(size, column, row);
const light = [0.125, 2, 10];
const constant = sh.project(32, () => light);
const zeroOrderError = Math.max(...constant[0].map((v, c) => Math.abs(v - light[c] * Math.sqrt(4 * Math.PI))));
const higherOrderError = Math.max(...constant.slice(1).flat().map(Math.abs));
const threshold = JSON.parse(
    fs.readFileSync(path.join(root, 'ai/ledgers/upstream-update/acceptance-manifest.json'), 'utf8'),
).thresholds.cpuAbsoluteError;
if (threshold !== 1e-5) throw new Error('FROZEN_THRESHOLD_CHANGED: re-review, do not silently restamp evidence');
const report = {
    schemaVersion: 1,
    caseId: 'T33',
    observedAt: new Date().toISOString(),
    checkoutHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version,
    decision: 'BLOCKED',
    evidenceScope: 'CPU reference and source trace; no browser/GPU capture executed',
    cpuReference: {
        size,
        weightSum,
        expectedWeightSum: 4 * Math.PI,
        weightError: Math.abs(weightSum - 4 * Math.PI),
        zeroOrderError,
        higherOrderError,
        threshold,
    },
    browserCapture: {
        status: 'INFRA_BLOCKED',
        ran: false,
        timings: null,
        actualDriverVRAM: null,
        inheritedPreflight: 'output/upstream-update/browser-preflight/same-exec-launch.log',
        reason: 'Existing parent preflight: Chromium startup aborted, process_singleton socket() Operation not permitted; crashpad --database required.',
        unblock: [
            'Authorized cloud execution environment with permitted browser process/IPC, writable profile/crashpad paths and matching browser binaries/dependencies.',
            'Actual WebGL2 context, complete RGBA32F targets, reliable nondisjoint GPU timer, recorded GPU/driver identity; preserve real-device/software-adapter distinction.',
            'Run the standalone fixture, then an actual Cocos scene serial/atlas adapter with CPU traversal/submission, GPU, total bake and incremental VRAM evidence.',
            'Freeze candidate/source/build/tool hashes; collect raw faces, SH, final shaders, per-run values, release/physical-close proof and required browser dimensions.',
        ],
    },
    sources: Object.entries(sourceAnchors).map(([file, anchors]) => fingerprint(file, anchors)),
    artifacts: artifacts.map((file) => fingerprint(file)),
};
console.log(JSON.stringify(report, null, 2));
if (report.cpuReference.weightError > 1e-10 || zeroOrderError > threshold || higherOrderError > threshold)
    process.exitCode = 1;
