'use strict';

// SIID 7 — Audio (volume, voice pack, voice assistant)

module.exports = {
  statusStates: [
    { id: 'voice-packet-id',        siid: 7, piid: 2,  nameKey: 'vacuum.status.voice-packet-id',        type: 'string', role: 'text' },
    { id: 'voice-assistant',        siid: 7, piid: 5,  nameKey: 'vacuum.status.voice-assistant',        type: 'number', role: 'value' },
    { id: 'voice-assistant-language', siid: 7, piid: 10, nameKey: 'vacuum.status.voice-assistant-language', type: 'string', role: 'text' },
  ],
  remoteStates: [
    { id: 'volume', siid: 7, piid: 1, nameKey: 'vacuum.remote.volume', type: 'number', role: 'level.volume' },
  ],
};
