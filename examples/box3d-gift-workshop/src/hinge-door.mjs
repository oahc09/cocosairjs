/** Public Hinge orchestration. Commands are intents; only native readback establishes an angle.
 * Configure/create/dispose at idle. observe is a read-only producer/after-step operation.
 * Shipping transaction/trigger qualification is deliberately not implemented by this class.
 */
export class HingeDoor {
    constructor({ api, node, body, anchorBody = null, pivotA, pivotB, axis, config, motorForceLimit }) {
        if (!Number.isFinite(motorForceLimit) || motorForceLimit <= 0)
            throw new Error('Door requires a finite positive effective-config motor force');
        this.api = api;
        this.config = config;
        this.body = body;
        this.pending = null;
        this.closed = false;
        this.lastObservation = null;
        let joint;
        try {
            joint = node.addComponent(api.HingeConstraint);
            joint.enabled = false;
            joint.connectedBody = anchorBody;
            joint.enableCollision = false;
            joint.pivotA = new api.Vec3(...pivotA);
            joint.pivotB = new api.Vec3(...pivotB);
            joint.axis = new api.Vec3(...axis);
            joint.limitEnabled = false;
            joint.lowerLimit = 0;
            joint.upperLimit = config.openDegrees;
            joint.limitEnabled = true;
            joint.motorVelocity = 0;
            joint.motorForceLimit = motorForceLimit;
            joint.motorEnabled = true;
            joint.enabled = true;
            this.joint = joint;
        } catch (error) {
            if (joint) {
                try {
                    joint.enabled = false;
                } finally {
                    joint.destroy();
                }
            }
            throw error;
        }
    }
    request(mode) {
        if (this.closed || !['open', 'close', 'hold'].includes(mode))
            return { accepted: false, reason: 'door-command-unavailable' };
        this.pending = mode;
        return { accepted: true, physicsCompleted: false };
    }
    flushAtIdle() {
        if (this.closed || this.pending === null) return null;
        const mode = this.pending;
        this.joint.motorVelocity = mode === 'hold' ? 0 : (mode === 'open' ? 1 : -1) * this.config.motorDegreesPerSecond;
        this.pending = null;
        return { admitted: true, mode, physicsCompleted: false };
    }
    observe(tick, generation) {
        if (this.closed) return null;
        const state = this.api.readBox3DConstraintState(this.joint);
        const ready =
            state.kind === 'hinge' &&
            state.state === 'connected' &&
            !state.pending &&
            state.native !== null &&
            Number.isFinite(state.angleDegrees);
        const angleDegrees = ready ? state.angleDegrees : null;
        this.lastObservation = Object.freeze({
            tick,
            generation,
            ready,
            angleDegrees,
            closed: ready && Math.abs(angleDegrees) <= this.config.closedToleranceDegrees,
            openQualified: ready && angleDegrees >= this.config.qualifiedOpenDegrees,
            reachedOpenTarget: ready && angleDegrees >= this.config.openDegrees,
            // No angle or motor request can serve as a delivery/score certificate.
            deliveryQualified: false,
        });
        return this.lastObservation;
    }
    disposeAtIdle() {
        if (this.closed) return;
        this.joint.enabled = false;
        this.joint.destroy();
        this.pending = null;
        this.closed = true;
    }
}
