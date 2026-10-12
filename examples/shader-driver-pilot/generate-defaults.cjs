'use strict';
const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');
async function main() {
    const file = path.join(__dirname, 'src/defaults.generated.ts');
    const defaults = Object.fromEntries(
        ['holographic', 'neon'].map((id) => {
            const definition = JSON.parse(
                fs.readFileSync(path.join(__dirname, `../shader-${id}/parameters.json`), 'utf8'),
            );
            return [id, Object.fromEntries(Object.entries(definition.params).map(([k, p]) => [k, p.defaultValue]))];
        }),
    );
    const config = await prettier.resolveConfig(file, { editorconfig: true });
    fs.writeFileSync(
        file,
        await prettier.format(
            `// Generated from frozen mother schemas; run generate-defaults.cjs.\nexport const DEFAULTS = ${JSON.stringify(defaults)};\n`,
            { ...config, filepath: file },
        ),
    );
}
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
module.exports = { main };
