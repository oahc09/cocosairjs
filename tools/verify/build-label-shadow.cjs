/* Build an isolated test runtime with source RichText included, without changing SDK exports. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '../..');
const reports = path.join(root, 'build/reports/label-shadow');
fs.mkdirSync(reports, { recursive: true });
const source = fs.mkdtempSync(path.join(reports, 'source-'));
fs.cpSync(path.join(root, 'src'), source, {
    recursive: true,
    filter: (file) => !path.basename(file).startsWith('__dts') && !path.basename(file).startsWith('.'),
});
fs.appendFileSync(
    path.join(source, 'exports/ui.ts'),
    '\nexport { RichText } from "../cocos/2d/components/rich-text";\n',
);
const buildFile = path.join(root, 'tools/build/build.cjs');
const original = fs.readFileSync(buildFile, 'utf8');
const anchor = "const ENGINE = join(ROOT, 'src');";
if (!original.includes(anchor)) throw new Error('Build engine path declaration changed; update this probe builder.');
process.env.AIR_OUT_DIR = path.join(reports, 'runtime');
process.argv = ['node', buildFile, '--format', 'esm'];
const runner = new Module(buildFile, module);
runner.filename = buildFile;
runner.paths = Module._nodeModulePaths(path.dirname(buildFile));
runner._compile(original.replace(anchor, `const ENGINE = ${JSON.stringify(source)};`), buildFile);
