from pathlib import Path
p=Path('src/air/physics/box3d/world.ts');s=p.read_text();a=s.index('    #applyDefaultMaterialCopied(');b=s.index('    /** Internal shape-owner hook for later T10.',a)
s=s[:a]+'''    /** Private prepared kernel: all native reads precede every possible setter. */
    #prepareMaterialBatch(
        updates: readonly Readonly<{
            shape: Box3DId;
            material: Readonly<Box3DSurfaceMaterial>;
            inheritsDefault: boolean;
        }>[],
        nextDefault?: Readonly<Box3DSurfaceMaterial>,
    ) {
        this.assertReadyState('prepare material batch');
        const seen = new Set<Box3DId>();
        const prepared = updates.map((update) => {
            const shape = update.shape;
            if (seen.has(shape) || !this.#materialShapes.has(shape))
                throw worldError('AIR_E_BOX3D_CONFIG', 'prepare material batch', 'Duplicate or unregistered shape.');
            seen.add(shape);
            if (typeof update.inheritsDefault !== 'boolean')
                throw worldError('AIR_E_BOX3D_CONFIG', 'prepare material batch', 'Expected boolean inheritance.');
            const previousInheritance = this.#materialShapes.get(shape)!;
            const next = copySurfaceMaterial(update.material);
            copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, shape));
            return { shape, next, previousInheritance, inheritsDefault: update.inheritsDefault,
                state: 'prepared' as 'prepared' | 'entered' | 'returned' | 'verified' };
        });
        const defaultValue = nextDefault === undefined ? undefined : copySurfaceMaterial(nextDefault);
        let cacheCommitted = false;
        const assertMembership = () => {
            this.assertReadyState('prepared material batch');
            for (const item of prepared)
                if (this.#materialShapes.get(item.shape) !== item.previousInheritance)
                    throw worldError('AIR_E_BOX3D_CONFIG', 'prepared material batch', 'Shape membership changed after preparation.');
        };
        const native = Object.freeze(prepared.map((item) => Object.freeze({
            target: item.shape,
            invoke: () => {
                if (cacheCommitted || item.state !== 'prepared')
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'prepared material setter', 'Operation already consumed.');
                assertMembership();
                item.state = 'entered'; // Never retry an unknown or completed setter.
                this.invalidatePending();
                this.#binding.setShapeMaterial(this.#token, item.shape, item.next);
                item.state = 'returned';
            },
            verify: () => {
                if (cacheCommitted || item.state !== 'returned')
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'prepared material readback', 'Setter did not return exactly once.');
                assertMembership();
                const actual = copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, item.shape));
                if (actual.friction !== item.next.friction || actual.restitution !== item.next.restitution)
                    throw worldError('AIR_E_BOX3D_ABI', 'prepared material readback', 'Native readback mismatch.');
                item.state = 'verified';
            },
        })));
        return Object.freeze({
            native,
            commitCaches: () => {
                if (cacheCommitted || prepared.some((item) => item.state !== 'verified'))
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'prepared material caches', 'Unverified or consumed plan.');
                assertMembership();
                cacheCommitted = true;
                for (const item of prepared) this.#materialShapes.set(item.shape, item.inheritsDefault);
                if (defaultValue !== undefined) this.material = defaultValue;
                this.invalidatePending();
            },
        });
    }
    #executePreparedMaterialBatch(plan: ReturnType<Box3DPhysicsWorld['#prepareMaterialBatch']>): void {
        let effectEntered = false;
        try {
            for (const operation of plan.native) {
                effectEntered = true;
                operation.invoke();
                operation.verify();
            }
            effectEntered = true;
            plan.commitCaches();
        } catch (error) {
            // No reviewed not-mutated receipt exists. Keep the actual phase; never rollback/replay.
            if (effectEntered) { this.invalidatePending(); this.fault(error); }
            throw error;
        }
    }
    #applyDefaultMaterialCopied(next: Readonly<Box3DSurfaceMaterial>): void {
        const plan = this.#prepareMaterialBatch(
            [...this.#materialShapes].filter(([, inherited]) => inherited)
                .map(([shape]) => ({ shape, material: next, inheritsDefault: true })), next);
        this.#executePreparedMaterialBatch(plan);
    }
''' + s[b:]
a=s.index('    #applyShapeMaterialCopied(');b=s.index('    get debugDrawFlags()',a)
s=s[:a]+'''    #applyShapeMaterialCopied(shape: Box3DId, value: Box3DSurfaceMaterial | null): void {
        const next = value === null ? this.material : copySurfaceMaterial(value);
        if (!next)
            throw worldError('AIR_E_BOX3D_CONFIG', 'shape material', 'PhysicsSystem default material is not configured.');
        const plan = this.#prepareMaterialBatch([{ shape, material: next, inheritsDefault: value === null }]);
        this.#executePreparedMaterialBatch(plan);
    }
''' + s[b:]
# TypeScript private names cannot be indexed in a structural type; declare the narrow internal result shape.
s=s.replace("ReturnType<Box3DPhysicsWorld['#prepareMaterialBatch']>","Readonly<{ native: readonly Readonly<{ invoke(): void; verify(): void }>[]; commitCaches(): void }>")
p.write_text(s)
