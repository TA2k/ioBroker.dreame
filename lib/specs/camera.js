'use strict';

// SIID 10001 — Camera / Stream
//
// piid 1–7, 10, 99, 101, 103, 1003, 1100–1103, 2003 are camera streaming
// protocol fields (stream_status, stream_audio, take_photo, stream_keep_alive
// etc.) — NOT stored as ioBroker states.

module.exports = {
  statusStates: [
    { id: 'camera-light-brightness', siid: 10001, piid: 9, nameKey: 'vacuum.status.camera-light-brightness', type: 'string', role: 'text' },
  ],
  remoteStates: [],
};
