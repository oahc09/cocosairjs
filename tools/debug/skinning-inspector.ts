/** Explicit, read-only inspection of the pinned native model. No subscriptions,
 * rendering, material instantiation, asset refs or default runtime exports. */
interface NativeSkinningView {
    skeleton: { joints: readonly string[] } | null;
    associatedAnimation?: { enabledInHierarchy: boolean; useBakedAnimation: boolean } | null;
    skinningRoot: { name: string } | null;
    model: any;
}
const bound = (value: any) =>
    value
        ? Object.freeze({
              center: Object.freeze([value.center.x, value.center.y, value.center.z]),
              halfExtents: Object.freeze([value.halfExtents.x, value.halfExtents.y, value.halfExtents.z]),
          })
        : null;
export function inspectSkinning(renderer: NativeSkinningView) {
    const model = renderer.model,
        animation = renderer.associatedAnimation;
    const patches: Array<{ name: string; value: unknown }> = model?.getMacroPatches(0) ?? [];
    const macro = (name: string) => patches.find((p) => p.name === name)?.value;
    const baked = macro('CC_USE_BAKED_ANIMATION') === true;
    const texture = macro('CC_USE_REAL_TIME_JOINT_TEXTURE') === true;
    const transport = !model
        ? 'NOT_READY'
        : baked
          ? 'BAKED_TEXTURE'
          : macro('CC_USE_SKINNING') !== true
            ? 'UNKNOWN'
            : texture
              ? 'REALTIME_TEXTURE'
              : 'REALTIME_UNIFORM';
    const mat = model?.transform?.worldMatrix;
    const determinant = mat
        ? mat.m00 * (mat.m05 * mat.m10 - mat.m09 * mat.m06) -
          mat.m04 * (mat.m01 * mat.m10 - mat.m09 * mat.m02) +
          mat.m08 * (mat.m01 * mat.m06 - mat.m05 * mat.m02)
        : null;
    // These arrays belong to the pinned native implementation. Observe only;
    // absence is null rather than a guessed count/capacity.
    const arrays: Float32Array[] | null = Array.isArray(model?._dataArray) ? model._dataArray : null;
    const slots = arrays ? arrays.slice(0, 80).map((v: Float32Array) => v.length / 12) : null;
    return Object.freeze({
        requestedMode: animation ? (animation.useBakedAnimation ? 'BAKED' : 'REALTIME') : 'AUTO_REALTIME',
        animationEnabled: animation?.enabledInHierarchy ?? null,
        effectiveModel: model?.constructor.name ?? null,
        transport,
        skeletonJoints: renderer.skeleton?.joints.length ?? null,
        boundWeightedJoints: Array.isArray(model?._joints) ? model._joints.length : null,
        paletteSlots: slots ? Object.freeze(slots) : null,
        paletteCount: arrays?.length ?? null,
        palettesTruncated: arrays ? arrays.length > 80 : false,
        deviceVertexUniformVectors: model?._device?.capabilities?.maxVertexUniformVectors ?? null,
        realtimeTextureFormat: texture ? (model?._realTimeJointTexture?._format ?? null) : null,
        root: renderer.skinningRoot?.name ?? null,
        modelTransform: model?.transform?.name ?? null,
        modelBounds: bound(model?.modelBounds),
        worldBounds: bound(model?.worldBounds),
        rootWorldDeterminant: determinant,
        reflected: determinant === null ? null : determinant < 0,
        limitations:
            'Pinned native private arrays are observed where available; counts are not binding success rates or GPU allocation measurements.',
    });
}
