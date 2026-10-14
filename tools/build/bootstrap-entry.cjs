const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
exports.buildBootstrapEntry = async (outDir) => {
    await require('./html-source-entry.cjs').buildHTMLSourceEntry(outDir);
    const root = path.resolve(__dirname, '../..');
    const result = await esbuild.build({
        entryPoints: [path.join(root, 'src/air/safe-bootstrap.ts')],
        outfile: path.join(outDir, 'bootstrap.js'),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        sourcemap: true,
        metafile: true,
        legalComments: 'none',
        plugins: [
            {
                name: 'deferred-air-runtime',
                setup(build) {
                    build.onResolve({ filter: /^\.\.\/index$/ }, () => ({
                        path: './cocosair.module.js',
                        external: true,
                    }));
                },
            },
        ],
    });
    const inputs = Object.keys(result.metafile.inputs).map((file) => file.replace(/\\/g, '/'));
    if (inputs.some((file) => !/src\/air\/(?:safe-bootstrap|app-config|html-source)\.ts$/.test(file))) {
        throw new Error('Safe bootstrap unexpectedly includes an eager runtime dependency: ' + inputs.join(', '));
    }
    fs.writeFileSync(
        path.join(outDir, 'bootstrap.d.ts'),
        'import type { AirApp, AirAppOptions } from "./cocosair.module.js";\n' +
            'export type { AirApp, AirAppOptions } from "./cocosair.module.js";\n' +
            'export declare function createAirApp(options: AirAppOptions): Promise<AirApp>;\n' +
            "export * from './html-source.js';\n",
    );
};
