'use strict';

// Helpers for "go to point" (cruise to a map coordinate without cleaning).
//
// Kept free of adapter state so the payload shape and the coordinate parsing
// can be unit tested. The device is driven through the same action as every
// other start (siid 4 / aiid 1); only the mode and the parameter differ.

// Mode of action 4-1 that makes the robot drive to a point and look around
// instead of cleaning. Same value the Dreame app uses behind its camera/cruise
// feature.
const CRUISE_POINT_MODE = 23;

/**
 * Build the `in` parameters for action 4-1 that send the robot to one point.
 *
 * @param {number} x target x in map coordinates
 * @param {number} y target y in map coordinates
 * @returns {{piid: number, value: (number|string)}[]|null} null if x/y are unusable
 */
function buildGoToPointIn(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // The two trailing zeros are fixed fields of a cruise point entry, not
  // coordinates — the app sends them the same way.
  const tpoint = JSON.stringify({ tpoint: [[x, y, 0, 0]] });
  return [
    { piid: 1, value: CRUISE_POINT_MODE },
    { piid: 10, value: tpoint },
  ];
}

/**
 * Read a coordinate pair out of the robot/charger position states, which hold
 * a JSON pair like "[-2194,-397]".
 *
 * @param {*} value raw state value
 * @returns {{x: number, y: number}|null} null if the value is not a usable pair
 */
function parsePositionPair(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null;
  const x = Number(parsed[0]);
  const y = Number(parsed[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // 32767 (0x7FFF) is the sentinel the firmware reports for "unknown position".
  if (Math.abs(x) === 32767 || Math.abs(y) === 32767) return null;
  return { x, y };
}

module.exports = { CRUISE_POINT_MODE, buildGoToPointIn, parsePositionPair };
