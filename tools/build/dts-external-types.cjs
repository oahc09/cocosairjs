const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PACKAGE = '@cocos/dragonbones-js';
const VERSION = '1.0.2';
const INTEGRITY = 'sha512-QeTxZwLr4OeOZDo7ENJfdmwmv9mb68iNNGXUSGqazy/kHTXpBwe2thWvYwxJyM+8+RTsVFkyEhxRkCIfulfN7g==';
const SOURCE_HASH = 'd207fda62fb4070ce2fd8fdb4c04508265fe4a5a0701fa7174d9cb6bf810adcb';

function patchDragonBonesDeclaration(bytes) {
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== SOURCE_HASH) {
        throw new Error('DragonBones declaration hash mismatch; review the versioned type patch');
    }
    return bytes
        .toString('utf8')
        .replace('/* private */ readonly _bones;', '/* private */ readonly _bones: Array<Bone>;')
        .replace('/* private */ _animation;', '/* private */ _animation: Animation | null;');
}

// The published package is left untouched. Only tfig's temporary declaration
// input is patched, after npm's lockfile SRI and the exact input hash are checked.
function stageExternalDeclarationTypes(options, repositoryRoot) {
    const lockPath = path.join(repositoryRoot, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const entry = lock.packages && lock.packages[`node_modules/${PACKAGE}`];
    if (!entry || entry.version !== VERSION || entry.integrity !== INTEGRITY) {
        throw new Error('DragonBones lock version/SRI mismatch; review the versioned type patch');
    }
    const packageRoot = path.dirname(require.resolve(`${PACKAGE}/package.json`, { paths: [repositoryRoot] }));
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    if (metadata.name !== PACKAGE || metadata.version !== VERSION) {
        throw new Error('DragonBones installed package version mismatch');
    }
    const source = fs.readFileSync(path.join(packageRoot, 'out/dragonBones.d.ts'));
    const target = path.join(options.rootDir, '__external_types/dragonBones.d.ts');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, patchDragonBonesDeclaration(source));
    return { ...options, moduleMap: { ...options.moduleMap, [PACKAGE]: target } };
}

module.exports = { patchDragonBonesDeclaration, stageExternalDeclarationTypes };
