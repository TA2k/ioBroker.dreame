'use strict';

// Parsing of the shortcut list reported on siid 4 / piid 48.
//
// Kept free of adapter state on purpose: the guard that decides whether a
// device has shortcuts at all lives here, so it can be unit tested. Both
// vacuums and mowers report the same structure; devices that use 4-48 for
// something else yield an empty list and therefore create no objects.

/**
 * Turn a raw 4-48 value into a list of shortcut entries.
 *
 * @param {*} value raw property value (JSON string or already parsed)
 * @returns {{id: (string|number), name: string, running: (boolean|undefined)}[]}
 *   one entry per usable shortcut; empty if the value is not a shortcut list
 */
function parseShortcutList(value) {
  let shortcuts;
  try {
    shortcuts = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return [];
  }
  // Only a list of entries is a shortcut list. Some models report an unrelated
  // scalar on 4-48 (the MIoT spec declares it as a plain uint32 on several
  // released models), so anything that is not an array is not ours.
  if (!Array.isArray(shortcuts)) return [];

  const result = [];
  for (const sc of shortcuts) {
    if (!sc || sc.id === undefined || typeof sc.name !== 'string') continue;
    let name;
    try {
      name = Buffer.from(sc.name, 'base64').toString('utf-8');
    } catch {
      continue;
    }
    if (!name) continue;
    // "running" comes from sc.state, which not every device reports. Leaving it
    // undefined lets the caller skip the indicator instead of showing a value
    // that would be stuck at false.
    const running = sc.state === undefined ? undefined : sc.state === '0' || sc.state === '1';
    result.push({ id: sc.id, name, running });
  }
  return result;
}

module.exports = { parseShortcutList };
