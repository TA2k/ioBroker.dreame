'use strict';

// Per-device reachability tracking (issue #42, "Device-Offline-Status").
//
// The cloud answers a request for a device that is awake with code 0 and one
// for a device that is asleep or gone with 80001 ("device may be offline,
// command timed out"). That outcome is the honest reachability signal, so this
// tracker is driven by request results rather than by a timer: a robot idling
// on its dock legitimately reports nothing for a long time, so "nothing arrived
// recently" would produce false offline reports.
//
// Kept free of adapter state so the transition logic is unit tested.

/** Consecutive failures before a device is called offline. */
const DEFAULT_FAILURE_THRESHOLD = 2;

class ReachabilityTracker {
  /**
   * @param {number} [failureThreshold] consecutive failures before going offline
   */
  constructor(failureThreshold = DEFAULT_FAILURE_THRESHOLD) {
    this.failureThreshold = Math.max(1, failureThreshold);
    /** @type {Record<string, {online: (boolean|undefined), failures: number}>} */
    this.devices = {};
  }

  _entry(did) {
    const key = String(did);
    if (!this.devices[key]) {
      this.devices[key] = { online: undefined, failures: 0 };
    }
    return this.devices[key];
  }

  /**
   * Current reachability, `undefined` until the first result arrived.
   *
   * @param {string|number} did device id
   * @returns {boolean|undefined} true if reachable
   */
  isOnline(did) {
    return this._entry(did).online;
  }

  /**
   * Record that the device answered.
   *
   * @param {string|number} did device id
   * @returns {boolean} true if this flipped the device to online (caller logs)
   */
  recordSuccess(did) {
    const entry = this._entry(did);
    entry.failures = 0;
    // A single answer proves reachability, so recovery is immediate — only the
    // way into offline is debounced.
    if (entry.online === true) return false;
    entry.online = true;
    return true;
  }

  /**
   * Record that the device did not answer (code 80001 / -8).
   *
   * @param {string|number} did device id
   * @returns {boolean} true if this flipped the device to offline (caller logs)
   */
  recordFailure(did) {
    const entry = this._entry(did);
    entry.failures += 1;
    if (entry.failures < this.failureThreshold) return false;
    if (entry.online === false) return false;
    entry.online = false;
    return true;
  }

  /**
   * Drop a device, e.g. when it disappears from the account.
   *
   * @param {string|number} did device id
   */
  forget(did) {
    delete this.devices[String(did)];
  }
}

module.exports = { ReachabilityTracker, DEFAULT_FAILURE_THRESHOLD };
