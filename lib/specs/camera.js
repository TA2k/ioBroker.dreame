'use strict';

// SIID 10001 — Camera / Stream
//
// piid 2–7, 10, 99, 101, 103, 1003, 1100–1103, 2003 are camera streaming
// protocol control fields (stream_audio, take_photo, stream_keep_alive etc.)
// — NOT stored as ioBroker states (internal protocol use only).
// piid 1 (stream_status) is device-reported and exposed as a readable state.
// Its payload is a streaming-session object, not a number — observed on
// dreame.vacuum.r95475 (firmware 4.3.9_3665_release):
//   {"operType":"end","operation":"monitor","result":0,"status":0}
// _lazyCreateState() JSON.stringify()s it, hence type:string / role:json.

module.exports = {
  statusStates: [
    { id: 'stream-status',          siid: 10001, piid: 1, nameKey: 'vacuum.status.stream-status',          type: 'string', role: 'json' },
    { id: 'camera-light-brightness', siid: 10001, piid: 9, nameKey: 'vacuum.status.camera-light-brightness', type: 'string', role: 'text' },
  ],
  remoteStates: [],
};
