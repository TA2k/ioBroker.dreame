![Logo](admin/dreame.png)

# ioBroker.dreame

[![NPM version](https://img.shields.io/npm/v/iobroker.dreame.svg)](https://www.npmjs.com/package/iobroker.dreame)
[![Downloads](https://img.shields.io/npm/dm/iobroker.dreame.svg)](https://www.npmjs.com/package/iobroker.dreame)
![Number of Installations](https://iobroker.live/badges/dreame-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/dreame-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.dreame.png?downloads=true)](https://nodei.co/npm/iobroker.dreame/)

**Tests:** ![Test and Release](https://github.com/TA2k/ioBroker.dreame/workflows/Test%20and%20Release/badge.svg)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

## dreame adapter for ioBroker

Adapter for Dreame robot vacuums and robot mowers.

**Tested with:** L10, L20, X40, A2 1200 (Mower)

---

## Vacuum (L10, L20, X40, ...)

### deviceId.status

Current status of the device (battery, charging, cleaning mode, etc.)

### deviceId.remote

Remote control of the device.

Start: `dreame.0.XXXXX.remote.start-sweep`
Stop: `dreame.0.XXXXX.remote.start-charge`

#### Start Shortcut

`dreame.0.XXXXXXXX.remote.start-clean`

```json
[
  { "piid": 1, "value": 25 },
  { "piid": 10, "value": "32" }
]
```

`"value": "32"` = Shortcut ID (see `dreame.0.XXXXX.status.4-48`, names are base64 encoded)

#### Room Cleaning

`dreame.0.XXXX.remote.start-clean`

```json
[
  { "piid": 1, "value": 18 },
  { "piid": 10, "value": "{\"selects\":[[X,1,3,2,1]]}" }
]
```

X = Room ID. Multiple rooms: `{\"selects\":[[X,1,3,2,1],[Y,1,3,2,1]]}`

#### Switch Map

`dreame.0.XXXXXXX.remote.update-map`

```json
[{ "piid": 4, "value": "{\"sm\":{},\"mapid\":X}" }]
```

X = mapId (see `dreame.0.XXXX.status.6-99` or `dreame.0.XXXX.map.curid`)

#### Control Clean Modes

Via `dreame.0.XXXXXX.remote.customCommand`:

| Action           | siid | piid | value                                   |
| ---------------- | ---- | ---- | --------------------------------------- |
| CleanGenius On   | 4    | 50   | `{"k":"SmartHost","v":1}`               |
| CleanGenius Off  | 4    | 50   | `{"k":"SmartHost","v":0}`               |
| CleanGenius Deep | 4    | 50   | `{"k":"SmartHost","v":2}`               |
| Cleaning Mode    | 4    | 23   | 5120, 5121, 5122...                     |
| Vacuum Mode      | 4    | 4    | 0=Quiet, 1=Standard, 2=Medium, 3=Strong |
| Mop Intensity    | 28   | 1    | 28                                      |
| Route            | 4    | 50   | `{"k":"CleanRoute","v":1}`              |
| CleanGenius Mode | 28   | 5    | 2 or 3                                  |

---

## Mower (A2, A2 1200, ...)

The adapter supports Dreame robotic mowers with dedicated states and map rendering.

### Mower Status

| State           | Description                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| status          | Mower status (1=Mowing, 2=Standby, 3=Paused, 5=Returning, 6=Charging, 11=Mapping, 13=Charged, 14=Updating) |
| fault           | Error code                                                                                                 |
| battery-level   | Battery percentage                                                                                         |
| charging-state  | Charging state                                                                                             |
| work-mode       | Current work mode                                                                                          |
| mowing-time     | Current mowing time (min)                                                                                  |
| mowing-area     | Current mowed area (m²)                                                                                    |
| task-status     | Task status                                                                                                |
| faults          | Fault details                                                                                              |
| warn-status     | Warning status                                                                                             |
| total-mow-time  | Total mowing time (min)                                                                                    |
| total-mow-count | Total mow count                                                                                            |
| total-mow-area  | Total mowed area (m²)                                                                                      |

### Mower Remote

| State               | Description                         |
| ------------------- | ----------------------------------- |
| start-mow           | Start mowing                        |
| stop-mow            | Stop mowing                         |
| start-zone-mow      | Start zone mowing (value: zone IDs) |
| start-charge        | Return to dock                      |
| start-mow-ext       | Start mowing extended               |
| stop-mow-ext        | Stop mowing extended                |
| obstacle-avoidance  | Obstacle avoidance on/off           |
| ai-detection        | AI detection on/off                 |
| child-lock          | Child lock on/off                   |
| dnd-enable          | Do not disturb on/off               |
| dnd-start / dnd-end | DND time range                      |
| schedule            | Mow schedule                        |
| fetchMap            | Fetch map from device (button)      |
| customCommand       | Send custom MIoT command            |

### Mower Map

Map data is fetched via the Dreame iotuserdata API (not MQTT like vacuums).

| State        | Description                           |
| ------------ | ------------------------------------- |
| mapImage     | Rendered map as PNG (base64 data URL) |
| slot0.zone_X | Zone data (name, area, mowing time)   |
| mowingPath   | Raw mowing path coordinates           |
| settings     | Mowing settings per zone              |
| schedule     | Mowing schedule                       |

**Map polling:** The map is fetched on adapter start and via the `fetchMap` button. During active mowing (status 1, 3, 5, 11) the map is automatically polled every 30 seconds to track the mowing path.

**Map rendering:** Requires the optional `canvas` npm package. The map shows zones (green), contours (white outlines), mowing path (yellow), forbidden areas (red), and obstacles (red circles).

#### Custom Commands for Mower

Via `dreame.0.XXXXXX.remote.customCommand`:

```json
{
  "siid": 5,
  "aiid": 9,
  "in": [{ "order": 4, "region": [1], "type": "order" }]
}
```

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.3.0 (2026-04-17)

- add mower support (A1, A1 Pro, A2, A2 1200, A3 AWD 1000)
- dedicated mower states (status, remote, map)
- mower map rendering via iotuserdata API
- automatic map polling during mowing
- filter vacuum-only services for mower devices
- fix SIID+3 action bug for mower
- add retry logic for API requests
- fix JSON parsing errors (downgrade to info)
- update datapoint names and IDs

### 0.2.2 (2025-01-24)

- reduce cpu load while cleaning

### 0.2.1 (2025-01-15)

- fix for canvas installation

### 0.2.0 (2024-12-28)

- add simple maps

### 0.1.0 (2024-12-14)

- bugfixes

### 0.1.0 (2024-12-14)

- (TA2k) initial release

## License

MIT License

Copyright (c) 2024-2030 TA2k <tombox2020@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
