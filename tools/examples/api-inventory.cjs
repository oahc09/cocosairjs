/* Public API inventory from the bundled declaration AST. Use --out=PATH for a trial or --write for the canonical file. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const dts = path.join(root, 'build/cocosair.module.d.ts');
const write = process.argv.includes('--write');
const out = write
    ? path.join(root, 'docs/example-api-inventory.json')
    : process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (!out) throw new Error('Use --out=PATH for a trial or --write for the canonical inventory');
const source = fs.readFileSync(dts, 'utf8');
const ast = ts.createSourceFile(dts, source, ts.ScriptTarget.Latest, true);
if (ast.parseDiagnostics.length) throw new Error(`declaration parse errors: ${ast.parseDiagnostics.length}`);
const { typeOnlyClassExports, namespaceValueAliases, resolveAliasTarget } = require('./type-only-class-exports.cjs');
const typeOnlyClasses = typeOnlyClassExports(ast);

const core =
    /^(?:math\.|(?:Scene|Node|MeshRenderer|Camera|DirectionalLight|Light|SpotLight|PointLight|SphereLight|AmbientLight|ModelRenderer|Layers|Color|Vec3|Mesh|Material|Texture2D|GLTFLoader|GLTFAsset|GLTFInstance|GLTFExtensionRegistry|Input|createAirApp|frameObject|createMesh|builtinResMgr|primitives|MeshUtils|BatchingUtility|director|game|isValid|instantiate)(?:\.|$))/;
const important =
    /^(?:Animation|AnimationClip|SkeletalAnimation|Skeleton|SkinnedMeshRenderer|SkinnedMeshUnit|Tween|TweenSystem|tween|TextureCube|EffectAsset|Particle|Billboard|Line|Circle|Ellipse|Filled|Graphics|UIRenderer|Widget|Label|Sprite)(?:\.|$)/;
const supporting =
    /^(?:gfx|geometry|utils|renderer|rendering|pipeline|native|js|physics|dragonBones|sp\.spine)(?:\.|$)/;
const requiredAdvancedFeature =
    /^(?:dragonBones\.(?:DragonBonesAsset|DragonBonesAtlasAsset|ArmatureDisplay|CCFactory|AnimationCacheMode)|geometry\.(?:Ray|AABB|intersect)|renderer\.scene\.Camera|(?:createMeshoptDecoder|isMeshoptAvailable|createDracoDecoder|createKTX2Transcoder|isKTX2Available|meshQuantizationFactory|KHR_MESH_QUANTIZATION|meshoptCompressionFactory|KHR_MESHOPT_COMPRESSION|EXT_MESHOPT_COMPRESSION|dracoCompressionFactory|KHR_DRACO_MESH_COMPRESSION|AirTransmissionCapture|isTransmissionMaterial|TRANSMISSION_LAYER|defaultTransmissionVisibility))(?:\.|$)/;
const documentedOnly = {
    'renderer.scene.Camera.orthoWidth':
        'The component Camera.orthoWidth is verified by the current Gallery property example, including renderer synchronization. Direct renderer-level access has no separately claimed per-API trace here; prefer the component API, which also owns stored state and synchronization.',
    ...Object.fromEntries(
        [
            'Billboard',
            'Billboard.texture',
            'Billboard.height',
            'Billboard.width',
            'Billboard.rotation',
            'Billboard.technique',
            'Billboard.constructor',
            'Billboard.onLoad',
            'Billboard.onEnable',
            'Billboard.onDisable',
            'Billboard.onDestroy',
        ].map((unit) => [
            unit,
            'Newly exposed native component. Dedicated browser and installed-consumer checks are recorded in docs/manual/billboard.md and the port-gap ledger, but this unit has no current Gallery per-API execution proof. It remains unverified in this coverage inventory; add via Node.addComponent and let node/component ownership invoke lifecycle callbacks.',
        ]),
    ),
    'dragonBones.CCFactory.constructor':
        'CCFactory is a process-wide singleton. Its constructor subscribes to game restart and registers the global DragonBones update schedule; direct extra construction can duplicate global ownership. Use the verified getInstance() entry point.',
    'dragonBones.CCFactory.onRestart':
        'Engine restart callback only. Direct invocation clears the singleton while live armatures may still reference the current factory; restart ownership remains with the engine event.',
    'dragonBones.ArmatureDisplay.destroyRenderData':
        'Tagged engine-internal render lifecycle hook. Clearing draw data outside component/render ownership can invalidate submitted UI geometry; the live draw list and component render path are verified.',
    'dragonBones.ArmatureDisplay.onDestroy':
        'Component lifecycle callback paired with base cleanup. Node.destroy owns this path; direct invocation on a live node bypasses component teardown ordering.',
    KHR_MESH_QUANTIZATION:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable decoder example checks its runtime value; keep it documented-only until primitive-export read tracing is supported.',
    KHR_MESHOPT_COMPRESSION:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable decoder example checks its runtime value; keep it documented-only until primitive-export read tracing is supported.',
    EXT_MESHOPT_COMPRESSION:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable decoder example checks its runtime value; keep it documented-only until primitive-export read tracing is supported.',
    KHR_DRACO_MESH_COMPRESSION:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable decoder example checks its runtime value; keep it documented-only until primitive-export read tracing is supported.',
    TRANSMISSION_LAYER:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable viewer checks its layer bit against the capture visibility; keep it documented-only until primitive-export read tracing is supported.',
    defaultTransmissionVisibility:
        'Primitive top-level ESM constant cannot be individually observed by the V1.1 trace without changing its runtime type. The stable viewer checks it against the capture layer; keep it documented-only until primitive-export read tracing is supported.',
    'AirTransmissionCapture.onDestroy':
        'Engine-managed destruction owns the capture camera, render texture, and restoration order. Direct invocation bypasses that ownership contract; actual component creation, enable/disable, and lateUpdate behavior are verified.',
};
const units = {};
const aliases = [];
const has = (node, kind) => !!node.modifiers?.some((modifier) => modifier.kind === kind);
const tags = (node) => new Set(ts.getJSDocTags(node).map((tag) => tag.tagName.text));
const nameOf = (node) =>
    node?.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : null;
const privateName = (name) => name.split('.').some((part) => part.startsWith('_'));
const tierOf = (name, node) => {
    const nodeTags = tags(node);
    if (privateName(name) || nodeTags.has('internal')) return 'internal';
    if (nodeTags.has('deprecated')) return 'supporting';
    if (requiredAdvancedFeature.test(name)) return 'advanced';
    if (supporting.test(name)) return 'supporting';
    if (core.test(name)) return 'core';
    if (important.test(name)) return 'important';
    // Release tiers are opt-in by declared user-facing scope. Unknown exports remain
    // visible as Supporting until an explicit API policy promotes them; treating every
    // unmatched engine declaration as Advanced made implementation/vendor surfaces a
    // release obligation without any feature-scope decision.
    return 'supporting';
};
const add = (name, kind, node, parent, parentTier) => {
    if (units[name]) return;
    const tier =
        parentTier && !privateName(name) && !tags(node).has('internal') && !tags(node).has('deprecated')
            ? parentTier
            : tierOf(name, node);
    units[name] = { kind, tier, coverageRequired: !['supporting', 'internal'].includes(tier), parent: parent || null };
    if (documentedOnly[name]) {
        units[name].coverageStatus = 'documented-only';
        units[name].coverageReason = documentedOnly[name];
    }
};

function visit(statements, prefix = '') {
    for (const node of statements) {
        const localName = nameOf(node);
        const typeOnly = prefix === '' && typeOnlyClasses.has(localName);
        if (!has(node, ts.SyntaxKind.ExportKeyword) && !typeOnly) continue;
        if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
            visit(node.body.statements, `${prefix}${node.name.text}.`);
            continue;
        }
        const bare = typeOnly ? typeOnlyClasses.get(localName) : localName;
        if (ts.isClassDeclaration(node) && bare) {
            const fq = prefix + bare;
            add(fq, typeOnly ? 'class-type' : 'class', node);
            if (typeOnly) Object.assign(units[fq], { typeOnly: true, runtimeValue: false });
            const parentTier = units[fq].tier;
            for (const member of node.members) {
                if (typeOnly && (ts.isConstructorDeclaration(member) || has(member, ts.SyntaxKind.StaticKeyword)))
                    continue;
                if (has(member, ts.SyntaxKind.PrivateKeyword) || has(member, ts.SyntaxKind.ProtectedKeyword)) continue;
                if (ts.isConstructorDeclaration(member)) {
                    add(`${fq}.constructor`, 'constructor', member, fq, parentTier);
                    continue;
                }
                const memberName = nameOf(member);
                if (!memberName) continue;
                const kind = ts.isMethodDeclaration(member)
                    ? has(member, ts.SyntaxKind.StaticKeyword)
                        ? 'static'
                        : 'method'
                    : ts.isGetAccessorDeclaration(member) ||
                        ts.isSetAccessorDeclaration(member) ||
                        ts.isPropertyDeclaration(member)
                      ? 'property'
                      : null;
                if (kind) {
                    const memberFq = `${fq}.${memberName}`;
                    const prior = units[memberFq];
                    if (
                        prior &&
                        ((prior.kind === 'static' && kind === 'method') ||
                            (prior.kind === 'method' && kind === 'static'))
                    ) {
                        // A static and an instance method with the same name
                        // are separate public API units, not overloads.
                        if (kind === 'method') {
                            add(`${fq}.prototype.${memberName}`, kind, member, fq, parentTier);
                        } else {
                            units[`${fq}.prototype.${memberName}`] = prior;
                            delete units[memberFq];
                            add(memberFq, kind, member, fq, parentTier);
                        }
                    } else {
                        add(memberFq, kind, member, fq, parentTier);
                    }
                }
            }
        } else if (ts.isFunctionDeclaration(node) && bare) {
            add(prefix + bare, 'function', node);
        } else if (ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
                const variableName = nameOf(declaration);
                if (variableName) add(prefix + variableName, 'constant', node);
            }
        } else if (ts.isEnumDeclaration(node) && bare) {
            add(prefix + bare, 'enum', node);
        } else if (ts.isImportEqualsDeclaration(node) && bare) {
            aliases.push({ alias: prefix + bare, target: node.moduleReference.getText(ast), node });
        }
    }
}

visit(ast.statements);
aliases.push(...namespaceValueAliases(ast));
for (const binding of aliases) {
    const { alias, node } = binding;
    const target = resolveAliasTarget(binding, units);
    const original = target && units[target];
    if (!original) continue;
    add(alias, original.kind, node);
    for (const [name, member] of Object.entries(units)) {
        if (!name.startsWith(`${target}.`)) continue;
        const aliasedName = alias + name.slice(target.length);
        if (units[aliasedName]) continue;
        units[aliasedName] = {
            ...member,
            tier: 'supporting',
            coverageRequired: false,
            parent: alias,
            aliasOf: name,
        };
    }
}
const summary = { core: 0, important: 0, advanced: 0, supporting: 0, internal: 0 };
for (const unit of Object.values(units)) summary[unit.tier]++;
const result = {
    source: 'build/cocosair.module.d.ts',
    sourceFingerprint: crypto.createHash('sha256').update(source).digest('hex').slice(0, 16),
    apiInventoryRevision: crypto.createHash('sha256').update(JSON.stringify(units)).digest('hex').slice(0, 16),
    units,
    tierSummary: summary,
    totalUnits: Object.keys(units).length,
    coverageRequiredUnits: Object.values(units).filter((unit) => unit.coverageRequired).length,
};
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'examples/files.json'), 'utf8'));
const claims = new Set(manifest.examples.flatMap((example) => example.api?.claims || []));
const unmatchedClaims = [...claims].filter((name) => !units[name]);
const unknownRuntimeClaims = unmatchedClaims.filter((name) => !name.startsWith('DevToolsSession.'));
if (unknownRuntimeClaims.length)
    throw new Error(`Manifest claims absent from public inventory: ${unknownRuntimeClaims.join(', ')}`);
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(
    `[api-inventory] ${Object.entries(summary)
        .map(([tier, count]) => `${tier}=${count}`)
        .join(' ')} required=${result.coverageRequiredUnits}`,
);
console.log(
    `[api-inventory] ${unmatchedClaims.length}/${claims.size} external DevTools claims excluded from runtime inventory → ${out}`,
);
