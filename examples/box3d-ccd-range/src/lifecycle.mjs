/** Example lifecycle only; owns no engine objects and never interprets physics success. */
export class TrialLifecycle {
    faulted = false;
    closing = false;
    closed = false;
    sdkCloseStarted = false;
    #resolve = null;
    get blocked() {
        return this.faulted || this.closing || this.closed || this.sdkCloseStarted;
    }
    get canClose() {
        return !this.closing && !this.closed && !this.sdkCloseStarted;
    }
    waitForTrial() {
        if (this.blocked || this.#resolve) throw new Error('Trial lifecycle is not ready');
        return new Promise((resolve) => {
            this.#resolve = resolve;
        });
    }
    settleTrial() {
        const resolve = this.#resolve;
        this.#resolve = null;
        resolve?.();
    }
    fault() {
        this.faulted = true;
        this.settleTrial();
    }
    beginClose() {
        if (!this.canClose) return false;
        this.closing = true;
        this.settleTrial();
        return true;
    }
    startSdkClose() {
        this.sdkCloseStarted = true;
    }
    completeClose() {
        this.closing = false;
        this.closed = true;
        this.settleTrial();
    }
    failClose() {
        this.closing = false;
        this.fault();
    }
}
