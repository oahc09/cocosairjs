protected onLoad (): void {
        if (!selector.runInEditor) return;

        const nativeFirst = selector.id === 'box3d';
        if (!nativeFirst) this.sharedMaterial = this._material;
        this._shape = createShape(this.type);
        this._shape.initialize(this);
        const change = beginPhysicsMaterialChange(this, 'collider-material-initialize');
        if (change) {
            try {
                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad!();
                if (!change.privateSubscriptions) {
                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            } catch (error) { change.fail(error, () => this._materialIdentity()); }
            finally { change.dispose(); }
            return;
        }
        this._shape.onLoad!();
        if (nativeFirst && this._material) this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }