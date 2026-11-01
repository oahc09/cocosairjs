const SCENE_IDS = Object.freeze(['pbr', 'skin', 'ui', 'compute']);
const SCENE_KINDS = Object.freeze(SCENE_IDS.map((id) => `scene-${id}`));
function scenePassed(value, id) {
    return (
        value?.id === `scene-${id}` &&
        value.status === 'PASS' &&
        ['before', 'after'].every((phase) => value.observations?.presentation?.[phase]?.pass === true) &&
        Array.isArray(value.observations?.gpuErrors) &&
        value.observations.gpuErrors.length === 0 &&
        value.observations.cleanup?.release?.status === 'released'
    );
}
function matrixPassed(value) {
    return SCENE_IDS.every((id) => scenePassed(value[`scene-${id}`], id));
}
module.exports = { SCENE_IDS, SCENE_KINDS, scenePassed, matrixPassed };
