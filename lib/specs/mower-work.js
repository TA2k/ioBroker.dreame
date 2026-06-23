'use strict';

// SIID 4 — Work Extend (work status + writable work settings)
// Sources: createMowerRemotes, docs/mower-protocol.md Enums section

// SIID 4 PIID 1 — WorkingMode (L7263)
const MOWER_WORK_MODE_KEYS = {
  0:  'mower.work-mode.all-area',
  1:  'mower.work-mode.edge',
  2:  'mower.work-mode.area',
  3:  'mower.work-mode.spot',
  7:  'mower.work-mode.cruise-point',
  8:  'mower.work-mode.cruise-edge',
  9:  'mower.work-mode.clean-point',
  10: 'mower.work-mode.map-learning',
};

// SIID 4 PIID 7 — TaskStatus (L7253)
const MOWER_TASK_STATUS_KEYS = {
  0: 'common.idle',
  1: 'mower.task-status.starting',
  2: 'mower.task-status.working',
  3: 'common.paused',
  4: 'mower.task-status.finished',
  5: 'mower.task-status.failed',
  6: 'mower.task-status.exit',
  7: 'mower.task-status.dock',
};

module.exports = {
  statusStates: [
    { id: 'work-mode',          siid: 4, piid: 1,  nameKey: 'mower.status.work-mode',          type: 'number', role: 'value', stateKeys: MOWER_WORK_MODE_KEYS },
    { id: 'mowing-time',        siid: 4, piid: 2,  nameKey: 'mower.status.mowing-time',        type: 'number', role: 'value', unit: 'min' },
    { id: 'mowing-area',        siid: 4, piid: 3,  nameKey: 'mower.status.mowing-area',        type: 'number', role: 'value', unit: 'm²' },
    { id: 'task-status',        siid: 4, piid: 7,  nameKey: 'mower.status.task-status',        type: 'number', role: 'value', stateKeys: MOWER_TASK_STATUS_KEYS },
    { id: 'serial-number',      siid: 4, piid: 14, nameKey: 'mower.status.serial-number',      type: 'string', role: 'text' },
    { id: 'faults',             siid: 4, piid: 18, nameKey: 'mower.status.faults',             type: 'string', role: 'text' },
    { id: 'mow-cancel',         siid: 4, piid: 30, nameKey: 'mower.status.mow-cancel',         type: 'number', role: 'value' },
    { id: 'warn-status',        siid: 4, piid: 35, nameKey: 'mower.status.warn-status',        type: 'number', role: 'value' },
    { id: 'map-index',          siid: 4, piid: 42, nameKey: 'mower.status.map-index',          type: 'number', role: 'value' },
    { id: 'map-name',           siid: 4, piid: 43, nameKey: 'mower.status.map-name',           type: 'string', role: 'text' },
    { id: 'device-capability',  siid: 4, piid: 83, nameKey: 'mower.status.device-capability',  type: 'string', role: 'json' },
  ],
  remoteStates: [
    { id: 'obstacle-avoidance', siid: 4, piid: 21, nameKey: 'mower.remote.obstacle-avoidance', type: 'boolean', role: 'switch' },
    { id: 'ai-detection',       siid: 4, piid: 22, nameKey: 'mower.remote.ai-detection',       type: 'boolean', role: 'switch' },
    { id: 'mow-setting',        siid: 4, piid: 23, nameKey: 'mower.remote.mow-setting',        type: 'number',  role: 'value' },
    { id: 'custom-mowing',      siid: 4, piid: 26, nameKey: 'mower.remote.custom-mowing',      type: 'boolean', role: 'switch' },
    { id: 'child-lock',         siid: 4, piid: 27, nameKey: 'mower.remote.child-lock',         type: 'boolean', role: 'switch' },
  ],
};
