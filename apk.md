# Dreame Mower Protocol - APK/Plugin Analyse

Quelle: Dekompilierte Dreame App (Flutter/blutter_out) und React Native Plugin (`plugin_dreame.mower.g2568a`)

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

| piid | Name | Beschreibung |
|------|------|--------------|
| 1 | Heartbeat/State | 20-Byte Binärprotokoll (siehe oben) |
| 2 | OTA State | 0=UNDEFINED, 1=IDLE, 2=UPGRADING, 3=SUCCESS, 4=FAILED, 5=CANNOT_UPGRADE |
| 3 | OTA Progress | Fortschritt in % |
| 4 | Robot Pose | Position (12-bit gepackt, siehe oben) |
| 50 | (unbekannt) | Leerer Handler |
| 51 | Dock Position Changed | Löst Dock-Position-Reload aus |
| 52 | (unbekannt) | Leerer Handler |
| 53 | BLE Connection Status | BLE-Verbindungsstatus |

### SIID 2 — Mower Service

| piid | Name | Beschreibung |
|------|------|--------------|
| 1 | Device Status | Hauptstatus (1=Working, 2=Standby, etc.) |
| 2 | Error Code | Fehlercode |
| 50 | Task Execution Info | Task-Callback mit `{d:{o:operation}}` |
| 51 | Rain Protection / Settings Update | `{value:[enabled, wait_hours]}` — löst Settings-Reload aus |
| 52 | Mowing Preference Update | Löst Mäh-Einstellungen-Reload aus |
| 53 | Voice Download Progress | Sprachpaket-Download in % |
| 54 | 3D Map Progress | 3D-LIDAR-Upload-Fortschritt in % |
| 55 | AI Obstacle Detection | `{obs:[...]}` KI-erkannte Hindernisse |
| 56 | Zone Status | `{status:[[id,state],...]}` pro Zone |
| 57 | Robot Shutdown | Roboter fährt herunter |
| 58 | Self-Check Result | `{d:{mode,id,result}}` Diagnose |
| 61 | Map Update | Löst Karten-Reload aus |

### SIID 3 — Battery

| piid | Name | Beschreibung |
|------|------|--------------|
| 1 | Battery Level | Batterie in % |
| 2 | Charging State | Ladezustand |

### SIID 99

| piid | Name | Beschreibung |
|------|------|--------------|
| 20 | 3D Map Upload Finish | Upload abgeschlossen |

## Settings (über getCFG / siid:2 aiid:50)

| Key | Default | Beschreibung |
|-----|---------|--------------|
| WRP | [1, 8, 0] | Rain Protection: [enabled, wait_hours, sensitivity] |
| DND | [0, 1200, 480] | Do Not Disturb: [enabled, start_min, end_min] |
| CLS | 0 | Child Lock (0=off, 1=on) |
| BAT | [15, 100, 1, 0, 1080, 480] | Battery: [return_threshold, max_charge, ...] |
| LOW | [0, 1200, 480] | Low Speed Mode: [enabled, start_min, end_min] |
| VOL | 80 | Lautstärke |
| LIT | [0, 480, 1200, 1, 1, 1, 1] | Headlight: [enabled, start, end, light1-4] |
| AOP | 0 | AI Obstacle Avoidance |
| REC | [0, 1, 0, 0, 0, 0, 0, 0] | Recording/Kamera |
| STUN | 0 | Anti-Theft |
| ATA | [0, 0, 0] | Auto Task Adjustment |
| PATH | 1 | Pfad-Anzeigemodus |
| WRF | false | Weather Forecast Reference |
| PROT | 0 | Protection Mode |

## Enums

### MainState
```
INIT: -1, IDLE: 0, REMOTE_CTRLING: 2, MAP_BUILDING: 3, MOWING: 4
```

### TaskStatus
```
IDLE: 0, STARTING: 1, WORKING: 2, PAUSED: 3, FINISHED: 4, FAILED: 5, EXIT: 6, DOCK: 7
```

### WorkingMode
```
ALL_AREA: 0, EDGE: 1, AREA: 2, SPOT: 3, CRUISE_POINT: 7, CRUISE_EDGE: 8, CLEAN_POINT: 9, MAP_LEARNING: 10
```

### LocationState
```
IDLE: 0, RELOCATING: 1, FAILURE: 2, SUCCESS: 3
```

### AreaStatus
```
UNFINISHED: -1, CURRENT_MOWING: 0, FAILED: 1, FINISHED: 2, SIDE_MOWING: 3, PAUSING: 4
```

### MowingState
```
PAUSED: 1, FINISHED: 2, IDLE: 3, MOWING: 4, REMOTE_CTRLING: 5
```

## Actions (über siid:2 aiid:50, m:'a')

| Operation | Funktion | Beschreibung |
|-----------|----------|--------------|
| 100 | globalMower | Komplett-Mähen starten |
| 101 | edgeMower | Kantenmähen starten |
| 102 | zoneMower | Zonenmähen starten |
| 103 | spotMower | Punktmähen starten |
| 104 | planMower | Zeitplan-Mähen starten |
| 200 | changeMap | Aktive Karte wechseln |
| 204 | editMap | Kartenbearbeitung starten |
| 205 | clearMap | Karte löschen |
| 400 | startBinocular | Binokularkamera starten |
| 503 | cutterBias | Messer-Kalibrierung |
