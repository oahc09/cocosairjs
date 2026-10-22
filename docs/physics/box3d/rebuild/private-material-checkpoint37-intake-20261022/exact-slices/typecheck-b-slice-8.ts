public setDefaultPhysicsMaterial (material: PhysicsMaterial): void {
        assertMutationAllowed(this, 'PhysicsSystem.setDefaultPhysicsMaterial');
        const change = beginPhysicsMaterialChange(this, 'system-default-material-set');
        if (change) {
            try {
                change.prepare(() => ({
                    before: { kind: 'system-default-material', material: this._material ?? null },
                    candidate: { kind: 'system-default-material', material },
                }));
                change.apply();
                if (!change.privateSubscriptions) {
                    change.effect('listener-edit-entered');
                    if (this._material !== material) this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                }
                this._material = material;
                change.effect('cache-written');
                if (!change.privateSubscriptions) {
                    this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }
                change.commit(() => ({ kind: 'system-default-material', material: this._material }));
            } catch (error) { change.fail(error, () => ({ kind: 'system-default-material', material: this._material ?? null })); }
            finally { change.dispose(); }
            return;
        }
        if (selector.id === 'box3d') {
            this.physicsWorld.setDefaultMaterial(material);
            if (this._material !== material) {
                this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            }
            this._material = material;
            this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            return;
        }
        this._material = material;
        this.physicsWorld.setDefaultMaterial(this._material);
        this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }