'use strict';

// SIID 4 — Vacuum Extend (core cleaning properties)

// SIID 4 PIID 23: cleaning-mode is a compound 32-bit value with three packed fields:
//   bits  0-1 : cleaning_mode  (0=vacuuming, 1=mopping, 2=sweep+mop, 3=mop-after-sweep)
//   bits  8-15: self_clean_area (station area setting)
//   bits 16+  : humidity/wetness level
//
// Assumption: value & 3 (2-bit mask) is used to cover liftable-mop-pad devices
// like the L40s Pro Ultra. Older devices without a liftable pad use only bit 0
// (value & 1), but & 3 is a safe superset and correct for the reference device.
//
// For write-back we use read-modify-write on bits 0-1 only, so humidity and
// self_clean_area are always preserved from the last known raw compound value.
//
// Devices with a liftable mop pad (self-wash base + auto-empty base, see
// Adapter#deviceHasMopPadLifting) swap 0 and 2 on the wire versus the display
// values below. HA applies the identical swap both on read and on write
// (device.py); the swap is its own inverse, so one helper covers both directions.
const swapModeIfMopPadLifting = (mode, mopPadLifting) => {
  if (!mopPadLifting) return mode;
  if (mode === 2) return 0;
  if (mode === 0) return 2;
  return mode;
};
const CLEANING_MODE_DECODE = (raw, mopPadLifting) => swapModeIfMopPadLifting(raw & 3, mopPadLifting);
const CLEANING_MODE_ENCODE = (newMode, raw, mopPadLifting) =>
  ((raw & ~3) | (swapModeIfMopPadLifting(newMode & 3, mopPadLifting) & 3)) >>> 0;

// stateKeys: 1 → common.paused, 2 → common.cleaning, 6 → common.charging
const CLEANING_STATUS_KEYS = {
  0:  'vacuum.cleaning-status.idle',
  1:  'common.paused',
  2:  'common.cleaning',
  3:  'vacuum.cleaning-status.back-home',
  4:  'vacuum.cleaning-status.part-cleaning',
  5:  'vacuum.cleaning-status.follow-wall',
  6:  'common.charging',
  7:  'vacuum.cleaning-status.ota',
  10: 'vacuum.cleaning-status.power-off',
  12: 'vacuum.cleaning-status.error',
  13: 'vacuum.cleaning-status.remote-control',
  14: 'vacuum.cleaning-status.sleeping',
  17: 'vacuum.cleaning-status.standby',
  18: 'vacuum.cleaning-status.segment-cleaning',
  19: 'vacuum.cleaning-status.zone-cleaning',
  20: 'vacuum.cleaning-status.spot-cleaning',
  21: 'vacuum.cleaning-status.fast-mapping',
  22: 'vacuum.cleaning-status.cruising-path',
  23: 'vacuum.cleaning-status.cruising-point',
  24: 'vacuum.cleaning-status.summon-clean',
  25: 'vacuum.cleaning-status.shortcut',
  26: 'vacuum.cleaning-status.person-follow',
};

module.exports = {
  statusStates: [
    {
      id: 'status',
      siid: 4,
      piid: 1,
      nameKey: 'vacuum.status.status',
      type: 'number',
      role: 'value',
      stateKeys: CLEANING_STATUS_KEYS,
    },
    {
      id: 'cleaning-time',
      siid: 4,
      piid: 2,
      nameKey: 'vacuum.status.cleaning-time',
      type: 'number',
      role: 'value',
      unit: 'min',
    },
    {
      id: 'cleaned-area',
      siid: 4,
      piid: 3,
      nameKey: 'vacuum.status.cleaned-area',
      type: 'number',
      role: 'value',
      unit: 'm²',
    },
    {
      id: 'water-tank',
      siid: 4,
      piid: 6,
      nameKey: 'vacuum.status.water-tank',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.not-installed', 1: 'common.installed', 10: 'vacuum.water-tank.mop-installed' },
    },
    {
      id: 'task-status',
      siid: 4,
      piid: 7,
      nameKey: 'vacuum.status.task-status',
      type: 'number',
      role: 'value',
      stateKeys: {
        0: 'vacuum.task-status.completed',
        1: 'vacuum.task-status.auto-cleaning',
        2: 'vacuum.task-status.zone-cleaning',
        3: 'vacuum.task-status.segment-cleaning',
        4: 'vacuum.task-status.spot-cleaning',
        5: 'vacuum.task-status.fast-mapping',
        6: 'vacuum.task-status.auto-paused',
        7: 'vacuum.task-status.zone-paused',
        8: 'vacuum.task-status.segment-paused',
        9: 'vacuum.task-status.spot-paused',
      },
    },
    { id: 'serial-number',           siid: 4, piid: 14, nameKey: 'vacuum.status.serial-number',          type: 'string', role: 'text' },
    { id: 'mop-cleaning-remainder',  siid: 4, piid: 16, nameKey: 'vacuum.status.mop-cleaning-remainder',  type: 'number', role: 'value' },
    { id: 'cleaning-paused',         siid: 4, piid: 17, nameKey: 'vacuum.status.cleaning-paused',         type: 'number', role: 'value' },
    { id: 'faults',                  siid: 4, piid: 18, nameKey: 'vacuum.status.faults',                  type: 'string', role: 'text' },
    { id: 'nation-matched',          siid: 4, piid: 19, nameKey: 'vacuum.status.nation-matched',          type: 'string', role: 'text' },
    { id: 'relocation-status',       siid: 4, piid: 20, nameKey: 'vacuum.status.relocation-status',       type: 'number', role: 'value' },
    { id: 'self-wash-base-status',   siid: 4, piid: 25, nameKey: 'vacuum.status.self-wash-base-status',   type: 'number', role: 'value' },
    { id: 'upload-map',              siid: 4, piid: 24, nameKey: 'vacuum.status.upload-map',              type: 'number', role: 'value' },
    { id: 'warn-status',             siid: 4, piid: 35, nameKey: 'vacuum.status.warn-status',             type: 'number', role: 'value' },
    { id: 'low-water-warning',       siid: 4, piid: 41, nameKey: 'vacuum.status.low-water-warning',       type: 'number', role: 'value' },
    { id: 'scheduled-clean',         siid: 4, piid: 47, nameKey: 'vacuum.status.scheduled-clean',        type: 'number', role: 'value' },
    { id: 'shortcuts',               siid: 4, piid: 48, nameKey: 'vacuum.status.shortcuts',               type: 'string', role: 'json' },
    { id: 'intelligent-recognition', siid: 4, piid: 49, nameKey: 'vacuum.status.intelligent-recognition', type: 'number', role: 'value' },
    { id: 'auto-switch-settings',    siid: 4, piid: 50, nameKey: 'vacuum.status.auto-switch-settings',    type: 'string', role: 'json' },
    { id: 'mop-in-station',          siid: 4, piid: 52, nameKey: 'vacuum.status.mop-in-station',          type: 'number', role: 'value' },
    { id: 'mop-pad-installed',       siid: 4, piid: 53, nameKey: 'vacuum.status.mop-pad-installed',       type: 'number', role: 'value' },
    { id: 'task-type',               siid: 4, piid: 58, nameKey: 'vacuum.status.task-type',               type: 'number', role: 'value' },
    { id: 'drainage-status',         siid: 4, piid: 60, nameKey: 'vacuum.status.drainage-status',         type: 'number', role: 'value' },
    { id: 'cleaning-progress',       siid: 4, piid: 63, nameKey: 'vacuum.status.cleaning-progress',       type: 'number', role: 'value', unit: '%' },
    { id: 'drying-progress',         siid: 4, piid: 64, nameKey: 'vacuum.status.drying-progress',         type: 'number', role: 'value', unit: '%' },
    { id: 'device-capability',       siid: 4, piid: 83, nameKey: 'vacuum.status.device-capability',       type: 'number', role: 'value' },
  ],

  remoteStates: [
    {
      id: 'suction-level',
      siid: 4,
      piid: 4,
      nameKey: 'vacuum.remote.suction-level',
      type: 'number',
      role: 'level',
      stateKeys: { 0: 'vacuum.suction-level.quiet', 1: 'vacuum.suction-level.standard', 2: 'vacuum.suction-level.strong', 3: 'vacuum.suction-level.turbo' },
    },
    {
      id: 'water-volume',
      siid: 4,
      piid: 5,
      nameKey: 'vacuum.remote.water-volume',
      type: 'number',
      role: 'level',
      stateKeys: { 1: 'intensity.low', 2: 'intensity.medium', 3: 'intensity.high' },
    },
    {
      id: 'cleaning-mode',
      siid: 4,
      piid: 23,
      nameKey: 'vacuum.remote.cleaning-mode',
      type: 'number',
      role: 'level',
      stateKeys: { 0: 'vacuum.cleaning-mode.vacuuming', 1: 'vacuum.cleaning-mode.mopping', 2: 'vacuum.cleaning-mode.sweep-mop', 3: 'vacuum.cleaning-mode.mop-after-sweep' },
      decode: CLEANING_MODE_DECODE,
      encode: CLEANING_MODE_ENCODE,
    },
    { id: 'resume-cleaning',    siid: 4, piid: 11, nameKey: 'vacuum.remote.resume-cleaning',    type: 'boolean', role: 'switch' },
    { id: 'carpet-boost',       siid: 4, piid: 12, nameKey: 'vacuum.remote.carpet-boost',       type: 'boolean', role: 'switch' },
    { id: 'obstacle-avoidance', siid: 4, piid: 21, nameKey: 'vacuum.remote.obstacle-avoidance', type: 'boolean', role: 'switch' },
    { id: 'ai-detection',       siid: 4, piid: 22, nameKey: 'vacuum.remote.ai-detection',       type: 'number',  role: 'level', write: false },
    { id: 'customized-cleaning',siid: 4, piid: 26, nameKey: 'vacuum.remote.customized-cleaning',type: 'boolean', role: 'switch' },
    { id: 'child-lock',         siid: 4, piid: 27, nameKey: 'vacuum.remote.child-lock',         type: 'boolean', role: 'switch' },
    {
      id: 'carpet-sensitivity',
      siid: 4,
      piid: 28,
      nameKey: 'vacuum.remote.carpet-sensitivity',
      type: 'number',
      role: 'level',
      stateKeys: { 1: 'vacuum.carpet-sensitivity.low', 2: 'vacuum.carpet-sensitivity.medium', 3: 'vacuum.carpet-sensitivity.high' },
    },
    { id: 'tight-mopping',      siid: 4, piid: 29, nameKey: 'vacuum.remote.tight-mopping',      type: 'boolean', role: 'switch' },
    { id: 'carpet-recognition', siid: 4, piid: 33, nameKey: 'vacuum.remote.carpet-recognition', type: 'boolean', role: 'switch' },
    { id: 'self-clean',         siid: 4, piid: 34, nameKey: 'vacuum.remote.self-clean',         type: 'boolean', role: 'switch' },
    {
      id: 'carpet-cleaning',
      siid: 4,
      piid: 36,
      nameKey: 'vacuum.remote.carpet-cleaning',
      type: 'number',
      role: 'level',
      stateKeys: { 0: 'vacuum.carpet-cleaning.avoid', 1: 'vacuum.carpet-cleaning.adapt', 2: 'vacuum.carpet-cleaning.ignore' },
    },
    { id: 'auto-add-detergent',  siid: 4, piid: 37, nameKey: 'vacuum.remote.auto-add-detergent',  type: 'boolean', role: 'switch' },
    {
      id: 'drying-time',
      siid: 4,
      piid: 40,
      nameKey: 'vacuum.remote.drying-time',
      type: 'number',
      role: 'level',
      stateKeys: { 2: 'vacuum.drying-time.2h', 3: 'vacuum.drying-time.3h', 4: 'vacuum.drying-time.4h' },
    },
    { id: 'auto-mount-mop',      siid: 4, piid: 45, nameKey: 'vacuum.remote.auto-mount-mop',      type: 'boolean', role: 'switch' },
    { id: 'mop-wash-level',      siid: 4, piid: 46, nameKey: 'vacuum.remote.mop-wash-level',      type: 'number',  role: 'level' },
    { id: 'auto-water-refilling',siid: 4, piid: 51, nameKey: 'vacuum.remote.auto-water-refilling',type: 'boolean', role: 'switch' },
  ],
};
