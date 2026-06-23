'use strict';

// SIID 2 — Mower Service (primary status + extended MQTT-push properties)
// SIID 3 — Battery
//
// Sources: docs/mower-protocol.md, index.android.bundle reverse engineering

// Mower Status Enum (SIID 2 PIID 1)
// Source: mower-protocol.md, DEVICE_STATUS_STATES.mower in main.js
const MOWER_STATUS_KEYS = {
  1:  'mower.state.working',
  2:  'mower.state.standby',
  3:  'mower.state.working',        // same display label as 1
  4:  'common.paused',
  5:  'mower.state.returning-charge',
  6:  'common.charging',
  7:  'mower.state.error',
  8:  'mower.state.raining-pause',
  9:  'mower.state.initializing',
  10: 'mower.state.leaving-station',
  11: 'mower.state.mapping',
  12: 'mower.state.border-mowing',
  13: 'common.charging-completed',
  14: 'mower.state.upgrading',
  15: 'mower.state.relocating',
  16: 'mower.state.task-navigating',
};

// Charging State Enum (SIID 3 PIID 2)
// Source: mower-protocol.md ChargeStatus (L7218)
// -1=UNKNOWN, 0=DIS_CHARGING, 1=CHARGING
const MOWER_CHARGING_STATE_KEYS = {
  '-1': 'mower.charging-state.unknown',
  0:    'mower.charging-state.discharging',
  1:    'common.charging',
};

module.exports = {
  statusStates: [
    // SIID 2 — Mower Service: core device status
    {
      id: 'status',
      siid: 2,
      piid: 1,
      nameKey: 'mower.status.state',
      type: 'number',
      role: 'value',
      stateKeys: MOWER_STATUS_KEYS,
    },
    {
      id: 'fault',
      siid: 2,
      piid: 2,
      nameKey: 'mower.status.error-code',
      type: 'number',
      role: 'value',
    },

    // SIID 2 piid 50–65: extended status pushed via MQTT (source: mower-protocol.md §SIID-2)
    // These are also HTTP-polled, but most are meaningful only as MQTT notifications.
    { id: 'task-info',         siid: 2, piid: 50, nameKey: 'mower.status.task-info',         type: 'string', role: 'json' },
    {
      id: 'settings-update',
      siid: 2,
      piid: 51,
      nameKey: 'mower.status.settings-update',
      type: 'string',
      role: 'json',
      // Value shape indicates which setting changed:
      // [enabled, hours] → Rain Protection (WRP)
      // 0|1             → Frost Protection (FDP)
      // [enabled, start, end] → Low Speed Night (LOW)
    },
    { id: 'mowing-preference', siid: 2, piid: 52, nameKey: 'mower.status.mowing-preference', type: 'string', role: 'json' },
    { id: 'voice-download',    siid: 2, piid: 53, nameKey: 'mower.status.voice-download',    type: 'number', role: 'value', unit: '%' },
    { id: 'ai-obstacles',      siid: 2, piid: 55, nameKey: 'mower.status.ai-obstacles',      type: 'string', role: 'json' },
    { id: 'zone-status',       siid: 2, piid: 56, nameKey: 'mower.status.zone-status',       type: 'string', role: 'json' },
    { id: 'self-check',        siid: 2, piid: 58, nameKey: 'mower.status.self-check',        type: 'string', role: 'json' },
    { id: 'task-progress-flag',siid: 2, piid: 62, nameKey: 'mower.status.task-progress-flag',type: 'number', role: 'value' },
    { id: 'task-type',         siid: 2, piid: 65, nameKey: 'mower.status.task-type',         type: 'string', role: 'text' },

    // SIID 3 — Battery
    {
      id: 'battery-level',
      siid: 3,
      piid: 1,
      nameKey: 'mower.status.battery-level',
      type: 'number',
      role: 'value.battery',
      unit: '%',
    },
    {
      id: 'charging-state',
      siid: 3,
      piid: 2,
      nameKey: 'mower.status.charging-state',
      type: 'number',
      role: 'value',
      stateKeys: MOWER_CHARGING_STATE_KEYS,
    },
  ],
  remoteStates: [],
};
