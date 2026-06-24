'use strict';

// Segment type codes 0-15 → i18n key slugs.
// Source: Tasshack dreame-vacuum types.py SEGMENT_TYPE_CODE_TO_NAME (master branch).
// Code 0 is the generic fallback ("Room"); codes 1-15 are predefined room types.
const SEGMENT_TYPE_SLUG = Object.freeze({
  0:  'room',
  1:  'living-room',
  2:  'primary-bedroom',
  3:  'study',
  4:  'kitchen',
  5:  'dining-hall',
  6:  'bathroom',
  7:  'balcony',
  8:  'corridor',
  9:  'utility-room',
  10: 'closet',
  11: 'meeting-room',
  12: 'office',
  13: 'fitness-area',
  14: 'recreation-area',
  15: 'secondary-bedroom',
});

/**
 * Returns the segment type code → i18n slug mapping.
 * Consumers build the full i18n key as "segment.type." + slug.
 *
 * Kept as a function (not a bare export) so future versions can extend the
 * table at call-time without breaking existing callers.
 */
function buildSegmentTypeMap() {
  return SEGMENT_TYPE_SLUG;
}

/**
 * Resolves a display-name descriptor for a single map segment (room).
 *
 * Intentionally stateless and I18n-free — the caller (main.js, Step D) is
 * responsible for translating `nameKey` with I18n.translate().  This keeps
 * the module unit-testable without an adapter context.
 *
 * Three-condition logic (priority order):
 *
 *  1. Custom name  — areaType.type === 0 and areaName present
 *     Free text set by the user in the Dreame app, already decoded from
 *     base64 by lib/dreame.js.  Not translatable — return as-is.
 *
 *  2. Predefined type — areaType.type >= 1 (codes 1-15 in SEGMENT_TYPE_SLUG)
 *     The device assigns a room-type code and an index for disambiguation
 *     when the same type appears multiple times on the same map.
 *     Per Tasshack issue #608: index 0 → no suffix; index 1 → " 2"; etc.
 *     The i18n key is returned; the caller appends the numeric suffix.
 *
 *  3. Fallback — no areaType, unknown code, or code 0 without a custom name
 *     Bare "Room <areaId>" string so something useful always appears.
 *
 * @param {string|number} areaId  - segment ID (key from areaInfo / cleanset blob)
 * @param {object|null}   entry   - areaInfo[areaId] from decodeMultiMapData output
 * @returns {{ type: 'custom',     value:    string             }
 *          |{ type: 'predefined', nameKey:  string,
 *                                 indexSuffix: number          }
 *          |{ type: 'fallback',   value:    string             }}
 */
function getRoomDisplayName(areaId, entry) {
  const areaType = entry && entry.areaType;
  const areaName = entry && entry.areaName;

  // Condition 1: user-assigned custom name (type 0 + name present)
  if (areaType && areaType.type === 0 && areaName) {
    return { type: 'custom', value: areaName };
  }

  // Condition 2: predefined room type (codes 1-15)
  if (areaType && areaType.type >= 1) {
    const slug = SEGMENT_TYPE_SLUG[areaType.type];
    if (slug) {
      // index 0 → first/only room of this type, no numeric suffix needed.
      // index 1 → "Living Room 2", index 2 → "Living Room 3", etc.
      // (Tasshack issue #608: multiple rooms of same type get ascending suffix)
      const indexSuffix = areaType.index > 0 ? areaType.index + 1 : 0;
      return { type: 'predefined', nameKey: 'segment.type.' + slug, indexSuffix };
    }
  }

  // Condition 3: fallback — unknown code, missing areaType, or type 0 without name
  return { type: 'fallback', value: 'Room ' + areaId };
}

module.exports = { getRoomDisplayName, buildSegmentTypeMap };
