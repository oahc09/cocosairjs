import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { collectSources, hasLifecycleInstallation } = require('../../tools/examples/local-source-closure.cjs');

describe('example local import closure', () => {
    test('installation requires a call or function assignment, not an unused declaration or string token', () => {
        const source = (code: string) => ({ file: 'main.ts', lines: [code] });
        expect(hasLifecycleInstallation(source('function installAssetLifecycle() {}'))).toBe(false);
        expect(hasLifecycleInstallation(source('const text = "installAssetLifecycle(fake)";'))).toBe(false);
        expect(hasLifecycleInstallation(source('installAssetLifecycle({});'))).toBe(true);
        expect(hasLifecycleInstallation(source('window.__lifecycle = async () => ({ released: true });'))).toBe(true);
    });
    test('follows actual local helper imports, JS to TS resolution and cycles while ignoring comments/outside files', () => {
        const root = mkdtempSync(join(tmpdir(), 'air-local-source-'));
        try {
            mkdirSync(join(root, 'example', 'src'), { recursive: true });
            mkdirSync(join(root, 'shared'));
            writeFileSync(
                join(root, 'example', 'src', 'main.ts'),
                "import { run } from '../../shared/helper.js';\n// import '../../outside.js';\nrun();",
            );
            writeFileSync(
                join(root, 'shared', 'helper.ts'),
                "import '../example/src/main.js';\n/* installAssetLifecycle(fake); */\nexport function run() { installAssetLifecycle({}); }\nimport '../../../outside.js';",
            );
            const collected = collectSources(join(root, 'example'), root);
            expect(collected.map((s: any) => s.rel.replace(/\\/g, '/')).sort()).toEqual([
                'example/src/main.ts',
                'shared/helper.ts',
            ]);
            expect(
                collected.filter((s: any) => hasLifecycleInstallation(s)).map((s: any) => s.rel.replace(/\\/g, '/')),
            ).toEqual(['shared/helper.ts']);
        } finally {
            if (!root.startsWith(join(tmpdir(), 'air-local-source-'))) throw new Error('unexpected temporary path');
            rmSync(root, { recursive: true, force: true });
        }
    });
});
