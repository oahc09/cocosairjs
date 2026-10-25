/** Admission only, not an engine cleanup implementation. SDK223 caches close() permanently. */
export class Lifecycle {
  faulted = false;
  closed = false;
  closing = false;
  transitioning = false;
  sdkCloseStarted = false;
  beginTransition() {
    if (
      this.faulted ||
      this.closed ||
      this.closing ||
      this.transitioning ||
      this.sdkCloseStarted
    )
      return false;
    this.transitioning = true;
    return true;
  }
  endTransition() {
    this.transitioning = false;
  }
  beginClose() {
    if (this.closed || this.closing || this.sdkCloseStarted) return false;
    this.closing = true;
    return true;
  }
  startSdkClose() {
    this.sdkCloseStarted = true;
  }
  endClose(released) {
    this.closed = released;
    this.closing = false;
    if (!released) this.faulted = true;
  }
}
