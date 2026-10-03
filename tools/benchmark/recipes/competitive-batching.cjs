/** Separate from the legacy 30-recipe catalog; uses its task-oriented definition fields. */
const SCOPE = 'competitive-batching';
const routes = ['shared', 'merged', 'dynamic'];
const RECIPES = routes.map((route) => ({
    id: `CB-BATCH-${route.toUpperCase()}`,
    version: '1.0.0',
    name: `Native batching: ${route}`,
    status: 'draft',
    targetStatus: 'validated',
    compositeBenchmarkId: `recipe:competitive-batching:${route}`,
    description: 'Compare equal visible quads under fixed mesh/material/pass and camera conditions.',
    sceneSetup:
        '1280x720 DPR1; one orthographic camera; builtin-unlit material; one pass/primitive; no shadows/post-processing.',
    requiredAssets: [],
    requiredCapabilities: ['webgl2'],
    runtimeState: 'Full requested count rendered; no runtime errors.',
    interactionSteps: ['Release owned mesh/material and rebuild the same full scene.'],
    visualTarget: 'Centered green quad grid with nonempty actual pixels; dynamic route changes actual pixels.',
    benchmarkRefs: [],
    exampleRefs: [`batching-${route}`],
    validatorRefs: ['node-exists', 'no-runtime-error', 'resource-released'],
    visualRefs: ['visible-frame'],
    tags: ['competitive-batching'],
    route,
    conditions: {
        sharedMeshCount: 1,
        sharedMaterialCount: 1,
        passCount: 1,
        primitiveCount: 1,
        materialEffect: 'builtin-unlit',
        cameraCount: 1,
    },
}));
const CASES = [
    { id: 'shared-256', route: 'shared', count: 256, instancing: false, draws: 256 },
    { id: 'instancing-256', route: 'shared', count: 256, instancing: true, draws: 1 },
    { id: 'instancing-2048', route: 'shared', count: 2048, instancing: true, draws: 2 },
    { id: 'merged-256', route: 'merged', count: 256, instancing: false, draws: 1 },
    { id: 'merged-50000', route: 'merged', count: 50000, instancing: false, draws: 1 },
    { id: 'dynamic-256', route: 'dynamic', count: 256, instancing: false, draws: 1 },
    { id: 'dynamic-50000', route: 'dynamic', count: 50000, instancing: false, draws: 1 },
    { id: 'dynamic-100000', route: 'dynamic', count: 100000, instancing: false, draws: 1 },
];
module.exports = { SCOPE, RECIPES, CASES };
