protected onDestroy (): void {
        const assets = observedMaterialAssets.get(this);
        if (assets) {
            // Capture before adapter unregister; the one-shot report remains readable after release.
            const reporter = capturePhysicsMaterialCleanup(this);
            const failures: PhysicsMaterialCleanupError[] = [];
            const attempt = (stage: PhysicsMaterialCleanupStage, perform: () => void): void => {
                try { perform(); } catch (error) { failures.push({ stage, error }); }
            };
            let reportFailed = false;
            let reportError: unknown;
            try {
                this._needTriggerEvent = false;
                this._needCollisionEvent = false;
                if (this._shape) attempt('event-listener-clear', () => this._shape!.updateEventListener());
                for (const material of assets) attempt('material-off', () => {
                    material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    assets.delete(material);
                });
                if (this._shape) attempt('adapter-destroy', () => this._shape!.onDestroy!());
                if (this._boundingSphere) attempt('bounds-destroy', () => this._boundingSphere!.destroy());
                if (!assets.size) observedMaterialAssets.delete(this);
            } finally {
                try { reporter?.complete(failures); }
                catch (error) { reportFailed = true; reportError = error; }
            }
            if (failures.length) throw failures[0].error;
            if (reportFailed) throw reportError;
            return;
        }
        if (this._shape) {
            this._needTriggerEvent = false;
            this._needCollisionEvent = false;
            this._shape.updateEventListener();
            if (this._material) this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._shape.onDestroy!();
        }
        if (this._boundingSphere) this._boundingSphere.destroy();
    }