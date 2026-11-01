/** Bounded raw diagnostic snapshots; never reconstructs absent ticks or drives physics. */
export class ObservationTrace {
    constructor(initialLimit = 360, windowSize = 30) {
        this.initialLimit = initialLimit;
        this.windowSize = windowSize;
        this.initial = [];
        this.recent = [];
        this.receiptWindows = [];
        this.totalObserved = 0;
    }
    record(observation, receipt) {
        const raw = structuredClone(observation);
        this.totalObserved++;
        if (this.initial.length < this.initialLimit) this.initial.push(raw);
        this.recent.push(raw);
        if (this.recent.length > this.windowSize) this.recent.shift();
        if (receipt) this.receiptWindows.push({ receipt: structuredClone(receipt), ticks: [...this.recent] });
    }
    export() {
        return {
            scope: 'Real public fixed-step observations, diagnostic only; bounded initial stream and receipt windows, not full-round BIZ trace',
            totalObserved: this.totalObserved,
            initialLimit: this.initialLimit,
            initial: this.initial,
            receiptWindows: this.receiptWindows,
            omittedAfterInitial: Math.max(0, this.totalObserved - this.initial.length),
        };
    }
}
