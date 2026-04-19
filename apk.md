# Dreame Mower Protocol - APK/Plugin Analyse

Quellen:

- **Flutter-App**: Dekompiliert mit blutter_out → `.docu/dreame.xapk.out/unknown/com.dreame.smartlife/`
- **Mower-Plugin**: React Native Bundle → `.docu/plugin_dreame.mower.g2568a/dreame.vacuum.common/index.android.bundle`
- **Protokoll-JSON**: `assets/home_device/common_mower_protocol.json`

Alle Zeilenangaben beziehen sich auf `index.android.bundle` sofern nicht anders angegeben.

## MQTT Properties (siid:1) - Binärprotokoll

Alle siid:1-Nachrichten verwenden ein 0xCE-geframtes Binärprotokoll.

### prop.1.1 - State/Heartbeat (20 Bytes)

```
Byte  0:      0xCE (Frame Start)
Bytes 1-10:   Error Code (10 Bytes)
Byte  11:     (unbekannt, schwankt stark)
Byte  12:     Sequence + Main State (encoded)
Byte  13:     Battery Level (%)
Byte  14:     Robot State Bitfield (siehe unten)
Byte  15:     Working State / Build Flags
Byte  16:     BLE RSSI
Byte  17:     WiFi RSSI (signed int8, dBm)
Byte  18:     LTE RSSI (signed int8, dBm)
Byte  19:     0xCE (Frame Ende)
```

**Robot State Bitfield (Byte 14):**
```
Bit 0-1: locationState (0-3)
Bit 2-4: dockingState
Bit 5:   pinState
Bit 6:   unDocking
Bit 7:   cameraState
```

**DockingState Enum:**
```
0 = IN_STATION
1 = OUT_OF_STATION
2 = PAUSE_DOCKING
3 = FINISH_DOCKING
4 = DOCKING_FAILED
5 = DOCKING_IN_BASE
```

### prop.1.4 - Robot Pose (variable Länge: 7/10/13/22/33/44 Bytes)

Erstes Byte immer 0xCE. Unterstützte Formate:

#### 33-Byte Format (häufigstes, ~3s Intervall beim Mähen)
```
Byte  0:      0xCE (Frame Start)
Bytes 1-6:    Robot Pose (12-bit gepackt, siehe parseRobotPose)
Bytes 7-21:   Trace Data (Pfad-Deltas)
Bytes 22-31:  Task Progress (siehe parseRobotTask)
Byte  32:     0xCE (Frame Ende)
```

#### 44-Byte Format
```
Bytes 0-31:   wie 33-Byte Format
Bytes 32-42:  Weitere Trace Data
Byte  43:     0xCE (Frame Ende)
```

#### Kürzere Formate
- **7 Bytes**: 0xCE + 6 Pose-Bytes (nur Position)
- **10 Bytes**: Pose + Building Value (Bytes 7-8)
- **13 Bytes**: Pose + Erase Point (Bytes 7-11)
- **22 Bytes**: Pose + Trace Data

### parseRobotPose (Bytes 1-6, nach 0xCE)

**ACHTUNG:** NICHT int16LE! Verwendet 12-bit gepackte Felder über 5 Bytes.

```javascript
function parseRobotPose(payload) {
  // payload = Bytes 1-6 der Nachricht (nach 0xCE)
  var x = payload[2] << 28 | payload[1] << 20 | payload[0] << 12;
  x = x >> 12;  // Arithmetic right shift für Vorzeichenerweiterung
  var y = payload[4] << 24 | payload[3] << 16 | payload[2] << 8;
  y = y >> 12;
  var angle = payload.length > 5 ? payload[5] / 255 * 360 : 0;
  return { x: x, y: y, angle: angle };
}
```

- X und Y teilen sich Byte 2 (Bit-Packing)
- Ergebnis wird mit `*10` skaliert für Map-Koordinaten
- Angle: Byte 5, linear 0-255 → 0-360°

### parseRobotTask (Bytes 22-31)

```javascript
function parseRobotTask(payload) {
  var regionId = payload[0];
  var taskId   = payload[1];
  var percent  = payload[3] << 8 | payload[2];           // uint16 LE, /100 = %
  var total    = payload[6] << 16 | payload[5] << 8 | payload[4]; // uint24 LE, /100 = m²
  var finish   = payload[9] << 16 | payload[8] << 8 | payload[7]; // uint24 LE, /100 = m²
  return { regionId, taskId, percent, total, finish };
}
```

Skalierung: Alle Werte durch 100 teilen (percent → %, total/finish → m²)

### parseRobotTrace (Pfad-Deltas, 15 Bytes)

```javascript
function parseRobotTrace(payload, pos) {
  var startIndex = payload[2] << 16 | payload[1] << 8 | payload[0]; // uint24 LE
  for (var i = 0; i < 3; i++) {
    var dx = toSigned16(payload[3 + i*4], payload[4 + i*4]); // int16 LE
    var dy = toSigned16(payload[5 + i*4], payload[6 + i*4]); // int16 LE
    // Absolut wenn |dx|>32766 && |dy|>32766, sonst relativ zu pos
  }
}
```

### prop.1.51 - Dock Position Update Trigger

Wenn diese Property empfangen wird, soll `getDockPos()` aufgerufen werden.

### prop.1.2 / prop.1.3 - OTA

- prop.1.2: OTA State
- prop.1.3: OTA Progress

## Dock Position

### Abruf über IoT/BLE

```javascript
getDockPos = { m: 'g', t: 'DOCK' }
```

Antwort:
```javascript
{
  d: {
    dock: {
      x: number,           // *10 für Map-Koordinaten
      y: number,           // *10 für Map-Koordinaten
      yaw: number,         // /10 für Winkel in Grad
      connect_status: 0|1, // Dock mit Mähzone verbunden
      path_connect: 0|1,
      in_region: 0|1
    }
  }
}
```

### Inferenz über State

Wenn `dockingState === IN_STATION` (aus prop.1.1 Byte 14), entspricht die aktuelle Robot-Position der Dock-Position.

## BLE Characteristics

```
Service 0004:
  Char 0001 (binary): State (siid:1 piid:1)
  Char 0002 (binary): Pose  (siid:1 piid:4)
  Char 0003 (JSON):   Commands
  Char 0004 (JSON):   Commands
  Char 0005 (JSON):   Commands
  Char 0006 (JSON):   Commands
  Char 0007 (JSON):   Commands
  Char 0008 (JSON):   Commands
```

## MAP Daten (getDeviceData → userData)

### userData Keys (Mower)

```
MAP.0..N + MAP.info       - Map-Slots (JSON)
M_PATH.0..N + M_PATH.info - Mäh-Pfad Koordinaten
SETTINGS.0                - Mäh-Einstellungen pro Zone
SCHEDULE.0                - Mäh-Zeitplan
TASKID.0 + TASKID.info    - Aktuelle Task-ID
AI_OBS.0 + AI_OBS.info    - KI-erkannte Hindernisse
OTA_INFO.0                - OTA Update Info
prop.s_pri_plugin         - Plugin Konfiguration
prop.s_auth_config        - Auth Konfiguration
prop.s_auto_upgrade       - Auto-Update Einstellung
```

### MAP Entry Struktur (pro Slot)

```javascript
{
  mowingAreas:   { value: [[id, { name, path: [{x,y},...] }], ...] },
  forbiddenAreas: { value: [[id, { path: [{x,y},...] }], ...] },
  paths:         { ... },          // Verbindungspfade
  spotAreas:     { ... },          // Punkt-Mähzonen
  cleanPoints:   { ... },          // Reinigungspunkte
  cruisePoints:  { ... },          // Patrouillenpunkte
  obstacles:     { value: [[id, { x, y, ... }], ...] },
  contours:      { value: [[id, { path: [{x,y},...] }], ...] },
  notObsAreas:   { ... },          // Nicht-Hindernis Bereiche
  md5sum:        "string",
  totalArea:     number,           // m²
  boundary:      { x1, y1, x2, y2 },
  name:          "string",
  cut:           number,
  merged:        boolean,
  mapIndex:      number,
  hasBack:       number
}
```

### M_PATH Koordinaten

- Array von `[x, y]` Paaren oder `null` (Segment-Trenner)
- Sentinel `[32767, -32768]` = Pfad-Unterbrechung
- Koordinaten sind ~10x kleiner als MAP-Koordinaten (mit `*10` skalieren)

## parseRobotState (Byte-Bitfield)

```javascript
function parseRobotState(byte) {
  return {
    locationState: byte & 3,           // Bits 0-1
    dockingState:  (byte & 28) >> 2,   // Bits 2-4
    pinState:      (byte & 32) >> 5,   // Bit 5
    unDocking:     (byte & 64) >> 6,   // Bit 6
    cameraState:   (byte & 128) >> 7   // Bit 7
  };
}
```

## Sonstige Erkenntnisse

- Die Flutter-App ist nur die Home-UI (Gerätemanagement, Pairing)
- Das eigentliche Map-Rendering und Protokoll-Parsing läuft im React Native Plugin
- Mower nutzt `VacuumDeviceModel` (kein eigenes MowerDeviceModel)
- WiFi-SSID-Prefixe für Pairing: `dreame_dock_`, `mova_dock_`, `trouver_dock_`
- Geofence-System ist für Smart-Lock Auto-Unlock (Handy-GPS), nicht für Mower-Dock
- Protokoll-JSON: `assets/home_device/common_mower_protocol.json` definiert siid/piid-Mappings zur Laufzeit
- Fast alle Befehle laufen über `action {siid:2, aiid:50, in:[payload]}` mit JSON `{m, t, d}`

## MQTT Property Subscriptions (prop.siid.piid)

### SIID 1 — OTA/Device

| piid | Name | Beschreibung | Quelle (Zeile) |
|------|------|--------------|-----------------|
| 1 | Heartbeat/State | 20-Byte Binärprotokoll (siehe oben) | L181387, L173750 |
| 2 | OTA State | 0=UNDEFINED, 1=IDLE, 2=UPGRADING, 3=SUCCESS, 4=FAILED, 5=CANNOT_UPGRADE | L181402-181404 |
| 3 | OTA Progress | Fortschritt in % | L181422-181424 |
| 4 | Robot Pose | Position (12-bit gepackt, siehe oben) | L181390-181396 |
| 50 | (unbekannt) | Leerer Handler `{}` | L181437 |
| 51 | Dock Position Changed | Löst `loadDockPos()` aus | L181438-181440 |
| 52 | (unbekannt) | Leerer Handler `{}` | L181442 |
| 53 | BLE Connection Status | BLE-Disconnect-Test wenn falsy | L181443-181453 |

### SIID 2 — Mower Service

| piid | Name | Beschreibung | Quelle (Zeile) |
|------|------|--------------|-----------------|
| 1 | Device Status | Hauptstatus (1=Working, 2=Standby, etc.) | L174754, common_mower_protocol.json |
| 2 | Error Code | Fehlercode | MIoT Spec |
| 50 | Task Execution Info | Task-Callback mit `{d:{o:operation}}` | L173843-173848 |
| 51 | Settings Update | Löst `loadSettingData()` → `getCFG()` aus. Wert variiert: `{value:[enabled, hours]}` = WRP/Rain, `{value:0/1}` = FDP/Frost, `{value:[0,1200,480]}` = LOW/Langsamfahrt | L181455-181457 |
| 52 | Mowing Preference Update | Löst `loadMowingPreference()` aus | L181459-181461 |
| 53 | Voice Download Progress | Sprachpaket-Download in % | L137929-137932 |
| 54 | 3D Map Progress | 3D-LIDAR-Upload-Fortschritt in % | L152859-152861 |
| 55 | AI Obstacle Detection | `{obs:[...]}` KI-erkannte Hindernisse | L181463-181477 |
| 56 | Zone Status | `{status:[[id,state],...]}` pro Zone, geparst via `parseAreaStatus()` | L181479-181480 |
| 57 | Robot Shutdown | 5s Delay dann Shutdown-Sequenz | L181482-181512 |
| 58 | Self-Check Result | `{d:{mode,id,result}}` Diagnose | L141634, L142731 |
| 61 | Map Update | Löst `loadMap()` aus | L181514-181515 |

### SIID 3 — Battery

| piid | Name | Beschreibung | Quelle (Zeile) |
|------|------|--------------|-----------------|
| 1 | Battery Level | Batterie in %, auch in Heartbeat B11 als `code & 0x7f` | L174771 |
| 2 | Charging State | Ladezustand | MIoT Spec |

### SIID 99

| piid | Name | Beschreibung | Quelle (Zeile) |
|------|------|--------------|-----------------|
| 20 | 3D Map Upload Finish | Upload abgeschlossen | L152863-152864 |

## Settings (über getCFG / siid:2 aiid:50, m:'g', t:'CFG')

Defaults definiert in `index.android.bundle` L182958:

| Key | Default | Beschreibung | Quelle (Zeile) |
|-----|---------|--------------|-----------------|
| WRP | [1, 8, 0] | Rain Protection: [enabled, wait_hours, sensitivity] | L182958, setWRP L175500 |
| DND | [0, 1200, 480] | Do Not Disturb: [enabled, start_min, end_min] | L182958, setDND L175450 |
| CLS | 0 | Child Lock (0=off, 1=on) | L182958, setCLS L175480 |
| BAT | [15, 100, 1, 0, 1080, 480] | Battery: [return_threshold, max_charge, charge_enabled, ?, start_min, end_min] | L182958 |
| LOW | [0, 1200, 480] | Low Speed Mode: [enabled, start_min, end_min] | L182958 |
| VOL | 80 | Lautstärke | L182958 |
| LIT | [0, 480, 1200, 1, 1, 1, 1] | Headlight: [enabled, start_min, end_min, light1, light2, light3, light4] | L182958 |
| AOP | 0 | AI Obstacle Avoidance | L182958 |
| REC | [0, 1, 0, 0, 0, 0, 0, 0] | Recording/Kamera | L182958 |
| STUN | 0 | Anti-Theft | L182958 |
| ATA | [0, 0, 0] | Auto Task Adjustment | L182958 |
| PATH | 1 | Pfad-Anzeigemodus | L182958 |
| WRF | false | Weather Forecast Reference | L182958 |
| PROT | 0 | Protection Mode | L182958 |

## Enums

### MainState (L7227)
```
INIT: -1, IDLE: 0, REMOTE_CTRLING: 2, MAP_BUILDING: 3, MOWING: 4
```

### TaskStatus (L7253)
```
IDLE: 0, STARTING: 1, WORKING: 2, PAUSED: 3, FINISHED: 4, FAILED: 5, EXIT: 6, DOCK: 7
```

### WorkingMode (L7263)
```
ALL_AREA: 0, EDGE: 1, AREA: 2, SPOT: 3, CRUISE_POINT: 7, CRUISE_EDGE: 8, CLEAN_POINT: 9, MAP_LEARNING: 10
```

### LocationState (L7282)
```
IDLE: 0, RELOCATING: 1, FAILURE: 2, SUCCESS: 3
```

### DockingState (L7288)
```
IN_STATION: 0, OUT_OF_STATION: 1, PAUSE_DOCKING: 2, FINISH_DOCKING: 3, DOCKING_FAILED: 4, DOCKING_IN_BASE: 5
```

### AreaStatus (L7501)
```
UNFINISHED: -1, CURRENT_MOWING: 0, FAILED: 1, FINISHED: 2, SIDE_MOWING: 3, PAUSING: 4
```

### MowingState (L7494)
```
PAUSED: 1, FINISHED: 2, IDLE: 3, MOWING: 4, REMOTE_CTRLING: 5
```

### OTAState (L57342)
```
UNDEFINED: 0, IDLE: 1, UPGRADING: 2, UPGRADE_SUCCESS: 3, UPGRADE_FAILED: 4, CANNOT_UPGRADE: 5
```

### ChargeStatus (L7218)
```
UNKNOWN: -1, DIS_CHARGING: 0, CHARGING: 1
```

### FaultIndex (L94618-94697)

78 Fehler-Codes. Wichtige:
```
0=HANGING, 1=TILTED, 2=TRAPPED, 7=CUTTER, 23=EMERGENCY_STOP, 24=BATTERY_LOW,
27=HUMAN_DETECTED, 56=BAD_WEATHER_PROTECTING, 61=NOT_DISTURB_RETURNING, 73=TOP_COVER_OPEN
```

## Actions (über siid:2 aiid:50, m:'a')

Alle Actions verwenden `callMethod('action', {siid:2, aiid:50, in:[{m:'a', o:OP, ...}]})`.

| Operation | Funktion | Beschreibung | Quelle (Zeile) |
|-----------|----------|--------------|-----------------|
| 0 | resetControl | Control-State zurücksetzen | Plugin action handler |
| 2 | startControl | Fernsteuerung starten | Plugin action handler |
| 3 | stopControl | Fernsteuerung stoppen | Plugin action handler |
| 4 | pauseControl | Pause | Plugin action handler |
| 5 | continueControl | Fortsetzen | Plugin action handler |
| 6 | pauseBackCharge | Rückfahrt pausieren | Plugin action handler |
| 7 | stopBackCharge | Rückfahrt stoppen | Plugin action handler |
| 8 | setOTA | OTA-Update auslösen | Plugin action handler |
| 9 | findBot | Roboter suchen (Ton) | Plugin action handler |
| 10 | uploadMap | Karte in Cloud hochladen | Plugin action handler |
| 11 | suppressFault | Fehler unterdrücken | Plugin action handler |
| 12 | lockBot | Roboter sperren | Plugin action handler |
| 100 | globalMower | Komplett-Mähen starten | Plugin action handler |
| 101 | edgeMower | Kantenmähen starten | Plugin action handler |
| 102 | zoneMower | Zonenmähen (mit region-Parameter) | Plugin action handler |
| 103 | spotMower | Punktmähen starten | Plugin action handler |
| 104 | planMower | Zeitplan-Mähen starten | Plugin action handler |
| 105 | obstacleMower | Hindernis-Mähen starten | Plugin action handler |
| 107 | startCruisePoint | Patrouille zu Punkt | Plugin action handler |
| 108 | startCruiseSide | Patrouille an Kante | Plugin action handler |
| 109 | startCleanPoint | Reinigungspunkt anfahren | Plugin action handler |
| 110 | startLearningMap | Karten-Lernmodus starten | Plugin action handler |
| 200 | changeMap | Aktive Karte wechseln | Plugin action handler |
| 201 | exitBuildMap | Kartenbau-Modus verlassen | Plugin action handler |
| 204 | editMap | Kartenbearbeitung starten | Plugin action handler |
| 205 | clearMap | Karte löschen | Plugin action handler |
| 206 | expandMap | Karte erweitern | Plugin action handler |
| 400 | startBinocular | Binokularkamera starten | Plugin action handler |
| 401 | takePic | Foto aufnehmen | Plugin action handler |
| 503 | cutterBias | Messer-Kalibrierung | Plugin action handler |

## GET-Befehle (m:'g') über siid:2 aiid:50

| Type (t) | Funktion | Beschreibung | Quelle (Zeile) |
|----------|----------|--------------|-----------------|
| DEV | getDEV | Geräte-Info (SN, MAC, FW) | Plugin cmd handler |
| CFG | getCFG | Alle Settings abrufen (WRP, DND, BAT, CLS, ...) | Plugin cmd handler |
| NET | getNet | Netzwerk/WiFi-Info | Plugin cmd handler |
| IOT | getIOT | IoT-Verbindungs-Info | Plugin cmd handler |
| MAPL | getMapList | Kartenliste | Plugin cmd handler |
| MAPI | getMapInfo | Karten-Info für Index | Plugin cmd handler |
| MAPD | getMapData | Kartendaten (chunked) | Plugin cmd handler |
| DOCK | getDockPos | Dock-Position | Plugin cmd handler |
| MISTA | getMission | Aktueller Missions-Status | Plugin cmd handler |
| MITRC | getTrack | Missions-Pfad | Plugin cmd handler |
| MIHIS | getHis | Missions-Historie | Plugin cmd handler |
| CMS | getCMS | Verschleißteile-Status | Plugin cmd handler |
| PIN | getPIN | PIN-Status | Plugin cmd handler |
| OBS | getOBS | Hindernis-Daten | Plugin cmd handler |
| AIOBS | getAIOBS | KI-Hindernis-Daten | Plugin cmd handler |
| LOCN | getLocation | GPS-Position (lon, lat) | Plugin cmd handler |
| RPET | getRPET | Rain Protection End Time | Plugin cmd handler |
| PRE | getPreferenceData | Mäh-Einstellungen pro Zone | Plugin cmd handler |
| PREI | getPreferenceInfo | Mäh-Einstellungen-Info | Plugin cmd handler |

## SET-Befehle (m:'s') über siid:2 aiid:50

| Type (t) | Funktion | Daten | Quelle (Zeile) |
|----------|----------|-------|-----------------|
| WRP | setWRP | `{value, time, sen}` — Rain Protection | L175500 |
| DND | setDND | `{value, time:[start,end]}` — Do Not Disturb | L175450 |
| CLS | setCLS | `{value}` — Child Lock | L175480 |
| BAT | setBackCharge | `{type:'power'/'charging', value}` | Plugin cmd handler |
| VOL | setVol | `{value}` — Lautstärke | Plugin cmd handler |
| AOP | setAOP | `{value}` — AI Obstacle Avoidance | Plugin cmd handler |
| STUN | setSTUN | `{value}` — Anti-Theft | Plugin cmd handler |
| LIT | setLIT | `{value, time, light[4], fill}` — Headlight | Plugin cmd handler |
| PIN | authPIN/updatePIN | `{type:'auth'/'update'/'forget', value}` | Plugin cmd handler |
| LANG | setTextLang/setVoiceLang | `{type:'text'/'voice', value}` | Plugin cmd handler |
| REC | setREC | `{value, sen, mode, report}` — Kamera | Plugin cmd handler |
| LOCN | setLocation | `{pos}` — GPS setzen | Plugin cmd handler |
| WINFO | setAppWeather | `{appWeather}` — Wetter-Info von App | Plugin cmd handler |
| ARM | setArm | `{value}` — Alarm/Anti-Theft | Plugin cmd handler |
| FDP | setFDP | `{value}` — Frost Protection (0=off, 1=on) | L176465 |
| CMS | setCMS | `{value:[blade_min, brush_min, robot_min]}` — Verschleißteile Reset | L176619 |
| CHECK | setSelfCheck | `{mode, status}` — Diagnose starten | L176631 |

## Remote Control (m:'r') — Joystick

BLE-only Steuerung. Kein IoT-Kanal. Kein Response erwartet.

### Protokoll (L174916-174928)

```javascript
joyControl = function(data) {
  return {
    channel: [Channel.BLE],
    payload: { m: 'r', d: data },
    needResp: false,
    ex: { log: false, error: false }
  };
};
```

### Ablauf

1. **Start**: `startControl(cb)` — `{m:'a', p:0, o:2}` über BLE-only (L174940-174951)
2. **Settings senden**: `remoteSetting(d)` — `{m:'a', p:0, o:15, d:data}` über BLE+IOT (L175109-175121)
   - Daten: `{c: 0|1}` (Kamera an/aus) oder `{h: height*10}` (Schnitthöhe)
3. **Joystick-Daten**: `joyControl(data)` — `{m:'r', d:data}` über BLE-only, ~100ms Intervall
4. **Stop**: `stopControl()` — `{m:'a', p:0, o:3}` über BLE+IOT (L174952)
5. **Pause**: `pauseControl()` — `{m:'a', p:0, o:4}` über BLE+IOT (L174960)
6. **Fortsetzen**: `continueControl()` — `{m:'a', p:0, o:5}` über BLE+IOT (L174968)
7. **Reset**: `resetControl()` — `{m:'a', p:0, o:0}` über BLE+IOT (L174930)

### Remote-Einstellungen abrufen

```javascript
getRemote = { m: 'g', t: 'REMOTE' }  // L176199
```

Gespeichert in Settings als `remote: {}` (L182984).

### Joystick UI (L91271-91340)

- BLE-Verbindung **Pflicht** (`joystickDisabled: !model.bleConnected`, L91297)
- Reichweite: 10m Bluetooth (String 61)
- Fehler 0 (HANGING), 1 (TILTED), 11 (BATTERY_OVERHEAT), 23 (EMERGENCY_STOP) blockieren Remote (L93918)

## Verschleißteile / Consumables (CMS)

### Abruf

```javascript
getCMS = { m: 'g', t: 'CMS' }  // L176184
```

### Antwort

```javascript
{ d: { value: [blade_minutes, brush_minutes, robot_minutes] } }
```

Array-Index entspricht `ConsumableItem` (L124737-124744):

| Index | Name | Beschreibung | Max Minuten | Healthy-Formel |
|-------|------|--------------|-------------|----------------|
| 0 | BLADE | Mähklingen | 6000 (100h) | (1 - val/6000) * 100 |
| 1 | BRUSH | Reinigungsbürste | 30000 (500h) | (1 - val/30000) * 100 |
| 2 | ROBOT | Roboter-Wartung | 3600 (60h) | (1 - val/3600) * 100 |

Weitere (kein CMS-Index, nur UI): REMOTE_MODULE (3), AWNING (4), CHARGE_STATION (5)

### Reset

```javascript
setCMS = { m: 's', t: 'CMS', d: { value: [0, brush_min, robot_min] } }  // Blade reset
```

Array wird kopiert, der zu resettende Wert auf 0 gesetzt (L128480-128483).

### Healthy-Berechnung (L123754-123757)

```javascript
healthy = (1 - consumeData[index] / totalMinutes) * 100
// > 60%: OK (state 0), 20-60%: Warnung (state 1), <= 20%: Kritisch (state 2)
```

## Frost Protection (FDP)

Eigenständige Einstellung, **unabhängig** von Rain Protection (WRP).

```javascript
setFDP = { m: 's', t: 'FDP', d: { value: 0|1 } }  // L176465
```

Default: `FDP: 1` (aktiviert, L182965).

### Zusammenhang mit prop.2.51

prop.2.51 ist ein **generischer Settings-Update-Trigger** (L181455-181457).
Er löst `loadSettingData()` → `getCFG()` aus, das **alle** Settings neu lädt.

Der mitgeschickte Wert zeigt an, welche Einstellung sich geändert hat:

- `{value:[enabled, hours]}` (2 Werte) → Rain Protection (WRP)
- `{value: 0|1}` (einzelner Wert) → Frost Protection (FDP)
- `{value:[enabled, start_min, end_min]}` (3 Werte) → Low Speed / Langsamfahrt nachts (LOW)
