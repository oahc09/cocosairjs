public set material (value) {
        assertMutationAllowed(this, 'Collider.material.set');
        const change = beginPhysicsMaterialChange(this, 'collider-material-set');
        if (change) {
            try {
                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));
                change.apply();
                if (this._material !== value) {
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, this._material);
                        change.effect('listener-edit-entered');
                        this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        if (this._material) observedMaterialAssets.get(this)!.delete(this._material);
                        retainObservedMaterial(this, value);
                        value?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    if (this._material && value) this._isSharedMaterial = false;
                    this._material = value;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions) change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            } catch (error) { change.fail(error, () => this._materialIdentity()); }
            finally { change.dispose(); }
            return;
        }
        if (this._shape) {
            const nativeFirst = selector.id === 'box3d';
            if (nativeFirst) this._shape.setMaterial(value);
            if (value && this._material) {
                if (this._material.id !== value.id) {
                    this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    value.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    this._isSharedMaterial = false;
                    this._material = value;
                }
            } else if (value && !this._material) {
                value.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            } else if (!value && this._material) {
                this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            }
            if (!nativeFirst) this._updateMaterial();
        } else {
            this._material = value;
        }
    }