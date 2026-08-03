'use strict';

const { expect } = require('chai');
const { ReachabilityTracker } = require('./lib/reachability');

describe('ReachabilityTracker', () => {
  it('knows nothing about a device before the first result', () => {
    expect(new ReachabilityTracker().isOnline('123')).to.equal(undefined);
  });

  it('reports the first answer as a transition to online', () => {
    const t = new ReachabilityTracker();
    expect(t.recordSuccess('123')).to.equal(true);
    expect(t.isOnline('123')).to.equal(true);
  });

  it('does not report a transition while the device keeps answering', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    expect(t.recordSuccess('123')).to.equal(false);
    expect(t.recordSuccess('123')).to.equal(false);
  });

  it('tolerates a single miss before calling a device offline', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    expect(t.recordFailure('123')).to.equal(false);
    expect(t.isOnline('123')).to.equal(true);
  });

  it('goes offline once the failure threshold is reached', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    t.recordFailure('123');
    expect(t.recordFailure('123')).to.equal(true);
    expect(t.isOnline('123')).to.equal(false);
  });

  it('reports the offline transition only once, however long it lasts', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    t.recordFailure('123');
    t.recordFailure('123');
    for (let i = 0; i < 20; i++) {
      expect(t.recordFailure('123')).to.equal(false);
    }
  });

  it('recovers immediately on the first answer', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    t.recordFailure('123');
    t.recordFailure('123');
    expect(t.recordSuccess('123')).to.equal(true);
    expect(t.isOnline('123')).to.equal(true);
  });

  it('resets the failure count on every answer', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    t.recordFailure('123'); // 1 of 2
    t.recordSuccess('123'); // resets
    expect(t.recordFailure('123')).to.equal(false); // 1 of 2 again, not offline
    expect(t.isOnline('123')).to.equal(true);
  });

  it('keeps devices apart', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('a');
    t.recordSuccess('b');
    t.recordFailure('a');
    t.recordFailure('a');
    expect(t.isOnline('a')).to.equal(false);
    expect(t.isOnline('b')).to.equal(true);
  });

  it('treats numeric and string ids as the same device', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess(123);
    expect(t.isOnline('123')).to.equal(true);
  });

  it('honours a custom threshold', () => {
    const t = new ReachabilityTracker(1);
    t.recordSuccess('123');
    expect(t.recordFailure('123')).to.equal(true);
  });

  it('never uses a threshold below one', () => {
    const t = new ReachabilityTracker(0);
    expect(t.failureThreshold).to.equal(1);
  });

  it('forgets a device', () => {
    const t = new ReachabilityTracker();
    t.recordSuccess('123');
    t.forget('123');
    expect(t.isOnline('123')).to.equal(undefined);
  });
});
