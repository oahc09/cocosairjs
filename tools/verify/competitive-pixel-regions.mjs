/* Independent metric comparison against the PUBLIC harness (never private Reference).
 * node tools/verify/competitive-pixel-regions.mjs --harness=<repo>/harness/runner/probe-executor.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { measurePixelRegions } from '../debug/pixel-regions.mjs';
const argument = process.argv.find((value) => value.startsWith('--harness='));
if (!argument) throw new Error('Pass the public probe-executor.mjs path with --harness=');
const { litRatio, decodePng } = await import(pathToFileURL(path.resolve(argument.slice(10))).href);
const image = { width: 96, height: 64, data: new Uint8Array(96 * 64 * 4) };
for (let y = 0; y < image.height; ++y) {
    for (let x = 0; x < image.width; ++x) {
        const index = (y * image.width + x) * 4;
        image.data.set(x > 17 && x < 51 && y > 13 && y < 37 ? [0, 0, 0, 255] : [180, 190, 200, 255], index);
    }
}
const regions = [{ x: 0, y: 0, w: 96, h: 64 }, { x: 12, y: 8, w: 42, h: 32 }, { x: -8, y: 7.5, w: 19, h: 100 }, { x: 100, y: 100, w: 10, h: 10 }];
const records = [];
function compare(label, frame, rectangles) {
    const actual = measurePixelRegions(frame, rectangles);
    actual.forEach((metric, index) => {
        const reference = litRatio(frame, rectangles[index]);
        const absolutePercentagePointDifference = Math.abs(metric.litRatio - reference.ratio) * 100;
        assert.ok(absolutePercentagePointDifference < 1, `${label}: metric difference >= 1 percentage point`);
        assert.deepEqual(metric.background, reference.background);
        records.push({ label, rect: metric.rect, ratio: metric.litRatio, absolutePercentagePointDifference });
    });
}
compare('synthetic-dark-foreground-on-light-background', image, regions);
const screenshot = path.resolve('output/competitive-benchmark/fox-workspace.png');
if (!fs.existsSync(screenshot)) throw new Error('Run competitive-gltf-browser.cjs first for actual scene pixels');
const frame = decodePng(fs.readFileSync(screenshot));
compare('actual-Fox-screenshot', frame, [{ x: 0, y: 0, w: frame.width, h: frame.height },
    { x: frame.width / 2, y: frame.height / 4, w: frame.width / 2, h: frame.height / 2 }]);
assert.throws(() => measurePixelRegions(image, [{ x: NaN, y: 0, w: 1, h: 1 }]), TypeError);
const report = { measuredAt: new Date().toISOString(), scope: 'CB-17 public-harness RGB modal-distance contract', records, ok: true };
fs.mkdirSync('output/competitive-benchmark', { recursive: true });
fs.writeFileSync('output/competitive-benchmark/pixel-regions.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
