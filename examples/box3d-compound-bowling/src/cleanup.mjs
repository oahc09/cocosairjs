/** Public orchestration only. SDK223 releaseScene re-enters its final deferred flush on every completed call.
 * No mocks in production: the live example passes its real app, Scene and owned Asset objects. */
export async function releaseOwned({ app, scene, assets, record }) {
  if (!app.releaseScene) throw Error("Public releaseScene unavailable");
  // A construction/run failure may leave the candidate outside app ownership.
  if (scene?.isValid && app.getScene() !== scene) {
    scene.destroy();
    record({ kind: "unmounted-scene-destroy-request" });
  }
  const first = await app.releaseScene();
  record({
    kind: "releaseScene",
    phase: "scene-and-unmounted-flush",
    receipt: first,
  });
  if (first.status !== "released")
    throw Error("Scene release failed; owned assets retained");
  if (scene?.isValid)
    throw Error("Candidate scene still valid after public release");
  const errors = [];
  for (const asset of [...assets].reverse()) {
    if (!asset.isValid) continue;
    try {
      asset.destroy();
    } catch (error) {
      errors.push(String(error));
    }
  }
  // This public second release is intentional: paused/no-scene release still flushes deferred objects.
  const flushed = await app.releaseScene();
  record({
    kind: "releaseScene",
    phase: "owned-assets-flush",
    receipt: flushed,
  });
  for (let i = assets.length - 1; i >= 0; i--)
    if (!assets[i].isValid) assets.splice(i, 1);
  record({
    kind: "owned-asset-state",
    remainingValid: assets.length,
    destroyErrors: errors,
  });
  if (flushed.status !== "released" || assets.length || errors.length)
    throw Error("Owned asset cleanup incomplete; identities retained");
}
/** A refused handle operation must not skip the remaining public cleanup attempts. */
export function attemptStops(stops) {
  const errors = [];
  for (const stop of stops)
    try {
      stop();
    } catch (error) {
      errors.push(String(error));
    }
  return errors;
}
