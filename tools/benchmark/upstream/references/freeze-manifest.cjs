/** Deterministic source inventory authoring, not reference scoring. Requires explicit --write. */
const fs = require('node:fs');
const path = require('node:path');
const { sha256, COHORT } = require('../reference-contracts.cjs');
const { TASK_IDS, CASES, THRESHOLDS, contractId } = require('./observations.cjs');
const root = path.resolve(__dirname, '../../../..');
const native = {
    request: [
        'test/fixtures/upstream-request-policy/main.js',
        'test/fixtures/upstream-request-policy/server.cjs',
        'test/fixtures/upstream-request-policy/cases.json',
        'tools/verify/upstream-request-policy-browser.cjs',
    ],
    material: [
        'test/fixtures/upstream-material-transitions/main.js',
        'tools/verify/upstream-material-transitions-observations.cjs',
        'tools/verify/upstream-material-transitions.cjs',
    ],
    state: ['test/fixtures/upstream-state-isolation/main.js', 'tools/verify/upstream-state-isolation.cjs'],
    skin: [
        'test/fixtures/upstream-skinning/main.ts',
        'test/fixtures/upstream-skinning/oracle.ts',
        'test/fixtures/upstream-skinning/rig.gltf',
        'tools/verify/upstream-skinning-observations.cjs',
        'tools/verify/upstream-skinning-browser.cjs',
    ],
    lifecycle: [
        'test/fixtures/upstream-lifecycle/engine-cycles.ts',
        'examples/material-inspection-showroom/src/showroom.ts',
        'examples/shared/asset-lifecycle.js',
        'tools/verify/upstream-showroom.cjs',
    ],
    readiness: [
        'test/fixtures/upstream-readiness/main.js',
        'tools/debug/readiness-observer.ts',
        'tools/verify/upstream-readiness.cjs',
    ],
    sdk: [
        'test/fixtures/upstream-sdk/paired-common.ts',
        'test/fixtures/upstream-sdk/contracts.ts',
        'test/fixtures/upstream-sdk/browser-main.js',
        'tools/verify/consumer-acceptance.cjs',
        'tools/verify/upstream-sdk-contracts.cjs',
        'tools/verify/upstream-sdk-browser.cjs',
    ],
};
const groups = [
    'request',
    'request',
    'request',
    'skin',
    'material',
    'material',
    'state',
    'state',
    'skin',
    'lifecycle',
    'readiness',
    'sdk',
];
const cocosGaps = {};
const threeGaps = {};
const sourceFiles = {
    validator: 'tools/benchmark/upstream/references/observations.cjs',
    preparationChecker: 'tools/benchmark/upstream/reference-contracts.cjs',
    normalizer: 'tools/benchmark/upstream/references/cocos-normalize.cjs',
    cocosMaterial: 'tools/benchmark/upstream/references/cocos-material-reference.mjs',
    cocosInstances: 'tools/benchmark/upstream/references/cocos-instance-reference.mjs',
    cocosReadiness: 'tools/benchmark/upstream/references/cocos-readiness-reference.mjs',
    threeReadiness: 'tools/benchmark/upstream/references/three-readiness-reference.mjs',
    threePrimitive: 'tools/benchmark/upstream/references/three-reference.mjs',
    threeRunner: 'tools/benchmark/upstream/references/three-runner.mjs',
    collector: 'tools/benchmark/upstream/references/collect-reference.cjs',
    requestReference: 'tools/benchmark/upstream/references/request-reference.mjs',
    requestServer: 'tools/benchmark/upstream/references/request-server.cjs',
    sdkReference: 'tools/benchmark/upstream/references/sdk-reference.cjs',
    threeDeclarationManifest: 'tools/benchmark/upstream/three-declarations.json',
    threeDeclarationLock: 'tools/benchmark/upstream/three-declarations-package-lock.json',
};
const threeAPIs = {
    package: 'package.json',
    module: 'build/three.module.js',
    core: 'build/three.core.js',
    gltf: 'examples/jsm/loaders/GLTFLoader.js',
    skeletonClone: 'examples/jsm/utils/SkeletonUtils.js',
    physical: 'src/materials/MeshPhysicalMaterial.js',
    filmShader: 'src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js',
    texture: 'src/textures/Texture.js',
    uv: 'src/math/Matrix3.js',
    targets: 'src/renderers/WebGLRenderTarget.js',
    renderer: 'src/renderers/WebGLRenderer.js',
    skin: 'src/objects/SkinnedMesh.js',
    mixer: 'src/animation/AnimationMixer.js',
    math: 'src/math/Vector3.js',
    loader: 'src/loaders/FileLoader.js',
};
function freezeManifest(threePackageDir) {
    const publicInputs = JSON.parse(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json'))),
        sources = [];
    const add = (id, file, role, packageName = 'repository') => {
        sources.push({
            id,
            package: packageName,
            path: file,
            role,
            sha256: sha256(fs.readFileSync(path.join(packageName === 'three' ? threePackageDir : root, file))),
        });
        return id;
    };
    Object.entries(sourceFiles).forEach(([id, file]) =>
        add(id, file, id === 'validator' ? 'independent-oracle' : 'protected-reference-implementation'),
    );
    const nativeIds = Object.fromEntries(
        Object.entries(native).map(([key, files]) => [
            key,
            files.map((file, i) =>
                add(
                    `cocos-${key}-${i}`,
                    file,
                    file.endsWith('/oracle.ts')
                        ? 'preexisting-independent-scalar-oracle'
                        : 'preexisting-native-fixture-or-collector',
                ),
            ),
        ]),
    );
    Object.entries(threeAPIs).forEach(([id, file]) =>
        add(`three-${id}`, file, 'verified-public-package-api-implementation-not-oracle', 'three'),
    );
    const collector = sources.find((s) => s.id === 'collector');
    for (const taskId of ['AU04', 'AU10', 'AU11']) delete cocosGaps[taskId];
    for (const taskId of ['AU04', 'AU09', 'AU11']) delete threeGaps[taskId];
    const tasks = TASK_IDS.map((taskId, i) => {
        const publicTask = publicInputs.tasks.find((t) => t.id === taskId);
        const cocosSourceIds = [
            ...nativeIds[groups[i]],
            'normalizer',
            'collector',
            'preparationChecker',
            'sdkReference',
        ];
        if (['AU05', 'AU06'].includes(taskId)) cocosSourceIds.push('cocosMaterial');
        if (['AU04', 'AU10'].includes(taskId)) cocosSourceIds.push('cocosInstances');
        if (taskId === 'AU11') cocosSourceIds.push('cocosReadiness');

        if (['AU01', 'AU02', 'AU03'].includes(taskId)) cocosSourceIds.push('requestReference', 'requestServer');
        const threeSourceIds = [
            'threePrimitive',
            'threeRunner',
            'preparationChecker',
            'sdkReference',
            'collector',
            'three-package',
            'three-module',
            'three-core',
        ];
        const specialized = {
            AU01: ['gltf', 'loader'],
            AU02: ['gltf', 'loader'],
            AU03: ['gltf', 'loader'],
            AU04: ['gltf', 'skeletonClone', 'mixer'],
            AU05: ['gltf', 'texture', 'uv'],
            AU06: ['gltf', 'physical', 'filmShader', 'texture'],
            AU07: ['renderer'],
            AU08: ['renderer', 'targets'],
            AU09: ['gltf', 'skin', 'mixer', 'skeletonClone'],
            AU10: ['gltf', 'skeletonClone', 'mixer', 'renderer'],
            AU11: ['renderer'],
            AU12: ['gltf', 'math'],
        };
        threeSourceIds.push(...specialized[taskId].map((name) => 'three-' + name));
        if (taskId === 'AU11') threeSourceIds.push('threeReadiness');

        if (['AU01', 'AU02', 'AU03'].includes(taskId))
            threeSourceIds.push('requestReference', 'requestServer', ...nativeIds.request);
        if (taskId === 'AU12') {
            cocosSourceIds.push('threeDeclarationManifest', 'threeDeclarationLock');
            threeSourceIds.push('threeDeclarationManifest', 'threeDeclarationLock');
        }
        const buildReference = (engine, sourceIds, gaps) => ({
            implementationKind:
                engine === 'three' && ['AU02', 'AU03', 'AU10', 'AU11'].includes(taskId)
                    ? 'public-browser-composition'
                    : 'native-public-engine-api-with-explicit-ownership-composition',
            nativeSupport:
                engine === 'three' && ['AU02', 'AU03'].includes(taskId)
                    ? 'No native request-priority/http-cache/logical-cancellation facade is claimed.'
                    : 'The exact bound public APIs are used; browser correctness is not yet observed.',
            compositionSupport:
                engine === 'three'
                    ? 'Protected composition uses only public Fetch, GLTFLoader, SkeletonUtils, material/target/mixer and application-owned lifecycle APIs; no engine-internal answer or imported oracle.'
                    : 'Existing Cocos fixture APIs and independently authored paired material configuration; no generated answer is a reference.',
            sourceIds,
            implementedSemantics:
                engine === 'cocosair'
                    ? native[groups[i]]
                    : [
                          sourceFiles.threePrimitive,
                          sourceFiles.threeRunner,
                          ...specialized[taskId].map((name) => threeAPIs[name]),
                      ],
            pendingSemantics: gaps[taskId] || [],
            collectorAdapter: { path: collector.path, sha256: collector.sha256, contractId: contractId(taskId) },
            collectorGap: null,
        });
        return {
            taskId,
            contractId: contractId(taskId),
            cases: CASES[taskId],
            commonInputSha256: publicTask.commonInputSha256,
            repetitionSeeds: publicTask.repetitionSeeds,
            resourceIds: publicTask.resourceIds,
            referenceCaseMapping: {
                group: groups[i],
                nativeCases: {
                    AU01: ['default-options/resources-valid', 'new real HTTP missing.gltf 404'],
                    AU02: [
                        'policy-inheritance',
                        'policy-override',
                        'cross-origin-headers',
                        'http-cache',
                        'default-options/native-shared-identity/native-cache-hit',
                    ],
                    AU03: [
                        'abort-buffer',
                        'multi-consumer-same-policy',
                        'fresh retry after real acknowledged first-byte abort',
                    ],
                    AU04: ['RGB/RGBA independent instances; new AU04 first-original-instance double release'],
                    AU05: ['new paired material T*R*S controls; old uv-transform parameters are not reclassified'],
                    AU06: [
                        'constant|RG-textured/1,1.2,1.3,2.33334,2.5',
                        'linear-red-factor-green-thickness',
                        'missing-texture-uses-maximum',
                        'film-independent-of-volume-thickness',
                    ],
                    AU07: [
                        'non-overlap-order-false',
                        'non-overlap-order-true',
                        'source-over-false',
                        'source-over-true',
                    ],
                    AU08: ['same-size-A-B-A', 'resize-rebind-camera', 'same-size-destroy-recreate'],
                    AU09: ['RGB/RGBA independent', 'RGB/RGBA frustum weights -1,0,1 and x -8,0,8,0'],
                    AU10: [
                        'engine-cycles settlement and showroom asset ownership; new paired 30 actual load/change/release cycles',
                    ],
                    AU11: ['cold', 'delayed-resource', 'offscreen', 'shader-failure', 'context-lost'],
                    AU12: [
                        'installed npm tarball contracts.ts',
                        'consumer-acceptance four compiler/resolution modes',
                        'upstream-sdk-browser ESM/Vite/decoder/math',
                    ],
                }[taskId],
            },
            validatorSourceId: 'validator',
            references: {
                cocosair: buildReference('cocosair', cocosSourceIds, cocosGaps),
                three: buildReference('three', threeSourceIds, threeGaps),
            },
            browserEvidence: null,
        };
    });
    return {
        schema: 'upstream-agent-reference-manifest/1',
        sdkCompilerContract: 'upstream-sdk-types/3',
        referencesProtected: true,
        authoredBeforeGeneratedTrials: true,
        generatedTrialInputsUsed: false,
        cohort: COHORT,
        thresholds: THRESHOLDS,
        publicInputManifest: {
            path: 'tools/benchmark/upstream/public-inputs.json',
            sha256: sha256(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json'))),
        },
        threeArtifact: {
            name: 'three',
            version: '0.186.1',
            sha256: '8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7',
        },
        oraclePolicy:
            'Expected scalar values, geometry and task thresholds are independently authored. Neither three package outputs nor generated answers define the oracle. Native references remain excluded from public generator bundles.',
        sources,
        tasks,
    };
}
module.exports = { freezeManifest };
if (require.main === module) {
    const dir = process.argv.find((v) => v.startsWith('--three-package='))?.slice(16);
    if (!process.argv.includes('--write') || !dir)
        throw Error('--write --three-package=<exact extracted 0.186.1 package> required');
    Promise.resolve(
        require('prettier').format(JSON.stringify(freezeManifest(path.resolve(dir))), {
            parser: 'json',
            tabWidth: 2,
            printWidth: 120,
            singleQuote: false,
            endOfLine: 'lf',
        }),
    )
        .then((formatted) => {
            fs.writeFileSync(path.join(root, 'tools/benchmark/upstream/reference-manifest.json'), formatted);
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
