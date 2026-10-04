import type { Camera, MeshRenderer } from 'cocosair';

type Bounds = NonNullable<NonNullable<MeshRenderer['model']>['worldBounds']>;
type Frustum = Camera['camera']['frustum'];
/** Observe current native filters. Never update transforms, render, or claim that
 * passing these filters proves a draw: LOD/occlusion/shader/deployment are separate. */
export function inspectRenderVisibility(
    renderer: MeshRenderer,
    cameras: readonly Camera[],
    aabbFrustum?: (bounds: Bounds, frustum: Frustum) => number | boolean,
) {
    const model = renderer.model,
        worldBounds = model?.worldBounds ?? null;
    const finiteBounds = worldBounds
        ? [
              worldBounds.center.x,
              worldBounds.center.y,
              worldBounds.center.z,
              worldBounds.halfExtents.x,
              worldBounds.halfExtents.y,
              worldBounds.halfExtents.z,
          ].every(Number.isFinite)
        : null;
    const nodeLayer = renderer.node.layer >>> 0,
        modelVisibility = model?.visFlags === undefined ? null : model.visFlags >>> 0;
    const attached = model ? model.scene === renderer.node.scene?.renderScene && model.scene !== null : null;
    const observations = cameras.slice(0, 80).map((camera) => {
        const mask = camera.visibility >>> 0;
        const nodeIncluded = (mask & nodeLayer) === nodeLayer;
        const modelIncluded = modelVisibility === null ? null : (mask & modelVisibility) !== 0;
        const layerIncluded = nodeIncluded || modelIncluded === true;
        const nativeCamera = camera.camera;
        const frustum =
            worldBounds && finiteBounds && nativeCamera && aabbFrustum
                ? Boolean(aabbFrustum(worldBounds, nativeCamera.frustum))
                : 'UNAVAILABLE';
        let reason: string;
        if (!model) reason = 'MODEL_NOT_READY';
        else if (!renderer.enabledInHierarchy || !model.enabled) reason = 'MODEL_DISABLED';
        else if (!camera.enabledInHierarchy) reason = 'CAMERA_DISABLED';
        else if (renderer.node.scene !== camera.node.scene) reason = 'DIFFERENT_SCENE';
        else if (!attached) reason = 'MODEL_NOT_ATTACHED';
        else if (!layerIncluded) reason = 'LAYER_MASK';
        else if (finiteBounds === false) reason = 'INVALID_BOUNDS';
        else if (frustum === false) reason = 'FRUSTUM';
        else if (frustum === 'UNAVAILABLE') reason = 'FRUSTUM_UNCHECKED';
        else reason = 'PASSES_OBSERVED_FILTERS';
        return Object.freeze({
            camera: camera.node.name,
            mask,
            cameraEnabled: camera.enabledInHierarchy,
            nodeIncluded,
            modelIncluded,
            layerIncluded,
            frustum,
            reason,
        });
    });
    return Object.freeze({
        nodeLayer,
        modelVisibility,
        rendererEnabled: renderer.enabledInHierarchy,
        modelEnabled: model?.enabled ?? null,
        attached,
        finiteBounds,
        cameraCount: cameras.length,
        camerasTruncated: cameras.length > 80,
        cameras: Object.freeze(observations),
        limitations:
            'Current native layer/model visibility OR and AABB-frustum filters only; no draw, LOD, occlusion, shader, material or GPU allocation claim.',
    });
}
