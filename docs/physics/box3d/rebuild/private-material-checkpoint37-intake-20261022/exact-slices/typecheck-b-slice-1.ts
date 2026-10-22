function retainObservedMaterial (collider: Collider, material: PhysicsMaterial | null): void {
    let assets = observedMaterialAssets.get(collider);
    if (!assets) observedMaterialAssets.set(collider, assets = new Set());
    if (material) assets.add(material);
}