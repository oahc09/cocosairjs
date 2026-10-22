public get material (): PhysicsMaterial | null {
        if (this._isSharedMaterial && this._material) {
            assertMutationAllowed(this, 'Collider.material.get');
            const change = beginPhysicsMaterialChange(this, 'collider-material-clone');
            if (change) {
                try {
                    if (change.privateSubscriptions) retainObservedMaterial(this, null);
                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                    change.effect('clone-allocation-entered');
                    const previous = this._material;
                    const cloned = previous.clone();
                    change.acceptClone(cloned);
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, previous);
                        change.effect('listener-edit-entered');
                        previous.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        observedMaterialAssets.get(this)!.delete(previous);
                    }
                    this._material = cloned;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, cloned);
                        cloned.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    this._isSharedMaterial = false;
                    if (!change.privateSubscriptions) change.effect('listeners-complete');
                    change.commit(() => this._materialIdentity());
                } catch (error) { change.fail(error, () => this._materialIdentity()); }
                finally { change.dispose(); }
                return this._material;
            }
            this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._material = this._material.clone();
            this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._isSharedMaterial = false;
        }
        return this._material;
    }