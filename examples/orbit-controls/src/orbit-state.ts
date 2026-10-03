/** Example-local camera orbit math. No player, scene, or timer is created here. */
export class OrbitState {
    theta = 0.55;
    phi = 1.1;
    radius = 7;
    readonly minRadius = 2;
    readonly maxRadius = 20;
    /** Exponential decay in seconds^-1; half-life = ln(2) / damping. */
    damping = 8;
    thetaVelocity = 0;
    phiVelocity = 0;
    dragging = false;

    begin(): void {
        this.dragging = true;
        this.thetaVelocity = this.phiVelocity = 0;
    }

    /** Deltas are fractions of viewport height, positive Y points upwards. */
    drag(dx: number, dy: number, seconds: number): void {
        if (!this.dragging || !Number.isFinite(dx + dy + seconds) || seconds <= 0) return;
        const thetaDelta = -dx * Math.PI * 2;
        const phiDelta = dy * Math.PI * 2;
        this.theta += thetaDelta;
        this.phi += phiDelta;
        // Time-based smoothing of measured drag velocity, independent of the render frame rate.
        const alpha = 1 - Math.exp(-20 * seconds);
        this.thetaVelocity += (thetaDelta / seconds - this.thetaVelocity) * alpha;
        this.phiVelocity += (phiDelta / seconds - this.phiVelocity) * alpha;
        this.clampPolar();
    }

    end(cancel = false): void {
        this.dragging = false;
        if (cancel) this.thetaVelocity = this.phiVelocity = 0;
    }

    /** getScrollY is inverted DOM deltaY multiplied by five, not device pixels. */
    wheel(scrollY: number): void {
        if (!Number.isFinite(scrollY)) return;
        this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius * Math.exp(-scrollY * 0.0002)));
    }

    update(seconds: number): void {
        if (this.dragging || !Number.isFinite(seconds) || seconds <= 0) return;
        const decay = Math.exp(-this.damping * seconds);
        const integral = this.damping > 0 ? (1 - decay) / this.damping : seconds;
        this.theta += this.thetaVelocity * integral;
        this.phi += this.phiVelocity * integral;
        this.thetaVelocity *= decay;
        this.phiVelocity *= decay;
        this.clampPolar();
    }

    position(): { x: number; y: number; z: number } {
        const ring = this.radius * Math.sin(this.phi);
        return { x: ring * Math.sin(this.theta), y: this.radius * Math.cos(this.phi), z: ring * Math.cos(this.theta) };
    }

    private clampPolar(): void {
        const clamped = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi));
        if (clamped !== this.phi) this.phiVelocity = 0;
        this.phi = clamped;
    }
}
