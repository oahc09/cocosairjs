private _materialIdentity (): PhysicsMaterialIdentity {
        return { kind: 'collider-material', material: this._material, shared: this._isSharedMaterial };
    }