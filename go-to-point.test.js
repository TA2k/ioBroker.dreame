'use strict';

const { expect } = require('chai');
const { CRUISE_POINT_MODE, buildGoToPointIn, parsePositionPair } = require('./lib/go-to-point');

describe('go-to-point', () => {
  it('builds the payload that was verified on a device', () => {
    // Exactly what was written to remote.start-custom-clean on a
    // dreame.vacuum.r95475 to make it drive to a point without cleaning.
    expect(buildGoToPointIn(-2194, -397)).to.deep.equal([
      { piid: 1, value: 23 },
      { piid: 10, value: '{"tpoint":[[-2194,-397,0,0]]}' },
    ]);
    expect(CRUISE_POINT_MODE).to.equal(23);
  });

  it('refuses coordinates that are not numbers', () => {
    expect(buildGoToPointIn(NaN, 5)).to.equal(null);
    expect(buildGoToPointIn(5, NaN)).to.equal(null);
    expect(buildGoToPointIn(Infinity, 0)).to.equal(null);
  });

  it('accepts zero as a valid coordinate', () => {
    expect(buildGoToPointIn(0, 0)).to.not.equal(null);
  });

  it('reads a coordinate pair from a position state', () => {
    expect(parsePositionPair('[-2194,-397]')).to.deep.equal({ x: -2194, y: -397 });
    expect(parsePositionPair([12, 34])).to.deep.equal({ x: 12, y: 34 });
  });

  it('rejects the 32767 sentinel for an unknown position', () => {
    // The firmware reports this when it does not know where the dock is.
    expect(parsePositionPair('[32767,32767]')).to.equal(null);
  });

  it('rejects unusable position values', () => {
    expect(parsePositionPair('nonsense')).to.equal(null);
    expect(parsePositionPair('[1]')).to.equal(null);
    expect(parsePositionPair('{"x":1,"y":2}')).to.equal(null);
    expect(parsePositionPair(null)).to.equal(null);
    expect(parsePositionPair(undefined)).to.equal(null);
  });
});
