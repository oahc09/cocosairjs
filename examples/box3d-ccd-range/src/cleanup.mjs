/** Public lifecycle orchestration; SDK223 releaseScene clears its in-flight promise and
 * flushes deferred destruction even without a current scene. Never call private flush APIs. */
export async function releaseOwned({ app, scene, nodes, assets, record }) {
    if (!app?.releaseScene) throw new Error('Public releaseScene unavailable');
    const errors = [];
    // Scene construction or app.run can fail before the app adopts the candidate.
    if (scene?.isValid && app.getScene() !== scene) {
        try {
            scene.destroy();
        } catch (error) {
            errors.push(String(error));
        }
        record({ kind: 'unmounted-scene-destroy-request' });
    }
    // Nodes are registered immediately after construction, before addChild or setters can fail.
    for (const node of nodes) {
        if (!node.isValid || node.parent) continue;
        try {
            node.destroy();
        } catch (error) {
            errors.push(String(error));
        }
    }
    const first = await app.releaseScene();
    record({ kind: 'releaseScene', phase: 'scene-and-unmounted-flush', receipt: first });
    for (let i = nodes.length - 1; i >= 0; i--) if (!nodes[i].isValid) nodes.splice(i, 1);
    if (first.status !== 'released' || scene?.isValid || nodes.length || errors.length) {
        record({ kind: 'owned-node-state', remainingValid: nodes.length, destroyErrors: errors });
        throw new Error('Scene/node cleanup incomplete; owned identities retained');
    }
    for (const asset of [...assets].reverse()) {
        if (!asset.isValid) continue;
        try {
            asset.destroy();
        } catch (error) {
            errors.push(String(error));
        }
    }
    // Assets are still valid while destruction is deferred; only clear them after this boundary.
    const flushed = await app.releaseScene();
    record({ kind: 'releaseScene', phase: 'owned-assets-flush', receipt: flushed });
    for (let i = assets.length - 1; i >= 0; i--) if (!assets[i].isValid) assets.splice(i, 1);
    record({ kind: 'owned-asset-state', remainingValid: assets.length, destroyErrors: errors });
    if (flushed.status !== 'released' || assets.length || errors.length)
        throw new Error('Owned asset cleanup incomplete; identities retained');
}
/** A failed explicit stop must not suppress the other stop or public scene cleanup. */
export function attemptStops(stops) {
    const errors = [];
    for (const stop of stops) {
        try {
            stop();
        } catch (error) {
            errors.push(String(error));
        }
    }
    return errors;
}
