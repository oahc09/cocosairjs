// Frozen E09 Glass fixed defaults (from examples/shader-glass/parameters.json @ E09 defaults).
// Kept as a local module so C03 has no cross-example runtime fetch dependency; the mother
// file is NOT modified and its values are recorded here verbatim for CPU/GPU parity.
// Reference: shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a (MIT).
export const GLASS_FIXED_DEFAULTS = {
    scale: 1,
    rotation: 0,
    highlightSoftness: 0.5,
    fresnelSoftness: 0.5,
    tintIntensity: 0,
    tintPreserveLuminosity: 1,
    tintColor: '#ffffff',
    cutout: 'none',
} as const;
