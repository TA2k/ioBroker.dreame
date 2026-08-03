# Older changes
## 0.3.23 (2026-07-01)
- Added map name synchronization: renaming a map via map.maps.<id>.mapName now automatically updates the corresponding remote.custom-room-cleaning channel name. Changed active-map state to a dropdown (common.states) showing map names with their id instead of requiring the raw numeric id to be typed manually.

## 0.3.22 (2026-06-28)
- Added custom room cleaning feature under remote.custom-room-cleaning: select rooms per map via checkboxes, bidirectionally synchronized with customCommand, using global suction level and water volume; start triggers a real multi-zone cleaning command. Added editable map name state (map.maps.<id>.mapName) to rename maps directly in ioBroker admin without adapter restart. Fixed I18n initialization order on startup so mapName state is now correctly created on first start. Fixed cleanset channel names to show translated room names instead of raw path strings. Added JSON validation before sending customCommand to device. Fixed multi-language index suffix for rooms with identical types (e.g. Bedroom 2). Fixed German translation for corridor room type (Flur).

## 0.3.21 (2026-06-25)
- Added lazy-created, translated states for mower position, battery, position/DND, schedule and statistics data (mower SIID 2/3/4/5/8/12). Fixed state ordering bug where settings (rain protection, child lock, etc.) appeared empty on first adapter start. Added translations for all mower config/AutoSwitch/preference states in 11 languages. Fixed boolean states incorrectly storing numeric 0/1 instead of true/false (affects auto-dust-collecting, dnd-enable, resume-cleaning and 15 other states). Improved fallback handling for unknown properties: registered 3 previously-unmapped properties (camera stream status, map object name, robot-cleaner property 2-6) and stopped creating misleading writable states for properties we cannot confirm are writable. Added a one-time cleanup for leftover phantom states from the old fallback mechanism. Updated installation instructions in README (the adapter is now available directly via ioBroker Admin from the Latest repository). Fixed adapter crash (unhandled promise rejection) when a device reports an unmapped property with an undefined value.

## 0.3.20 (2026-06-24)
- Added lazy-created, translated states for mower position, battery, position/DND, schedule and statistics data (mower SIID 2/3/4/5/8/12). Fixed state ordering bug where settings (rain protection, child lock, etc.) appeared empty on first adapter start. Added translations for all mower config/AutoSwitch/preference states in 11 languages. Fixed boolean states incorrectly storing numeric 0/1 instead of true/false (affects auto-dust-collecting, dnd-enable, resume-cleaning and 15 other states). Improved fallback handling for unknown properties: registered 3 previously-unmapped properties (camera stream status, map object name, robot-cleaner property 2-6) and stopped creating misleading writable states for properties we cannot confirm are writable. Added a one-time cleanup for leftover phantom states from the old fallback mechanism. Updated installation instructions in README (the adapter is now available directly via ioBroker Admin from the Latest repository).

## 0.3.19 (2026-06-23)
- Documentation fix: 0.3.18 changelog entry was missing from README.md due to a release script bug. No functional changes.

## 0.3.18 (2026-06-23)
- Vacuum states are now created lazily — only properties actually reported by the device appear in the object tree, filling in gradually after adapter start. All vacuum states now have full translations in 11 languages. Fixed cleaning-mode encoding for L40s Pro Ultra and similar models (mode, area and humidity were previously combined into a single raw value). Action buttons (start, stop, reset, etc.) now display correctly as buttons instead of raw text. Added translated, lazily-created states for mower position/task data (binary protocol). Fixed data loss on first write to rawCompound states (previous compound value was discarded before decoding, causing partial state updates). Added min/max range (1-32) for wetness-level state. BREAKING CHANGE: Action states (start-clean, stop-clean, return-to-base, etc.) changed from type string/text to boolean/button. Scripts or Vis widgets that write string values to these states must be updated to write true instead.

## 0.3.17 (2026-06-21)

- Fix command sent for some states
- (ioBroker-Bot) Adapter requires admin >= 7.8.23 now.

## 0.3.7 (2026-04-28)

- Fix mower SETTINGS/SCHEDULE parsing: reassemble chunked data before JSON.parse (fixes warning every 30s)
- Fix mower actions: remove dangerous start-zone-mow (was sending DOCK), add pause-mow and clear-warning
- Remove mower stop-mow-ext (no HA equivalent)

## 0.3.6 (2026-04-21)

- Add dedicated vacuum state tree (createVacuumRemotes) with ~85 status, ~32 remote, ~22 AutoSwitch, ~13 action states
- Add vacuum consumable reset buttons (main brush, side brush, filter, sensor)
- Add vacuum AutoSwitch parsing (25 features: auto-drying, collision-avoidance, fill-light, clean-genius, cleaning-route, etc.)
- Add vacuum action buttons (start, pause, stop, return-to-dock, locate, start-washing, start-auto-empty, clear-warning)
- Add vacuum station status (clean/dirty water tank, dust bag, detergent, hot water)
- Add vacuum extended settings (wetness, CleanGenius mode, water temperature, silent drying, hair compression)
- Add 20 new vacuum status enums (draining, dust bag drying, floor maintaining, finding pet, etc.)
- Fix mower return-to-dock command (was siid:3 aiid:1, now correct siid:5 aiid:3)
- Fix mower start-zone-mow was sending DOCK command (siid:2 aiid:3 remapped to siid:5 aiid:3) — removed, use start-mow-ext with params instead
- Fix mower missing pause-mow action — added (siid:5 aiid:4)
- Fix mower missing clear-warning action — added (siid:4 aiid:3)
- Remove mower stop-mow-ext (siid:4 aiid:2, no HA equivalent)
- Fix set_properties method for writable states (was incorrectly sending as action)
- Fix boolean action commands now send in:[] parameter

## 0.3.5 (2026-04-19)

- Add AutoSwitch properties (4-50): collision avoidance, fill light, CleanGenius, cleaning route, auto charging, etc.
- Add PRE mowing preferences: cutting height, obstacle distance, mow mode, edge mowing, edge detection, direction change
- Add shortcuts support (4-48): parsed names, running state, start buttons
- Add cleaning history via cloud API (last 20 mow sessions with date, duration, area, completion)
- Fix battery byte parsing (buf[11] & 0x7F + charging bit 7)

## 0.3.4 (2026-04-19)

- Add mower settings states from getCFG (rain protection, frost protection, low speed, DND, battery config, volume, headlight, AI obstacle, camera, anti-theft, etc.)
- Load all settings on startup and auto-reload on prop.2.51 MQTT trigger
- Add dedicated remote states for setting CFG values (set-rain-protection, set-frost-protection, set-volume, find-robot, lock-robot, etc.)
- Split consumables into individual states (blade-hours, brush-hours, robot-maintenance-hours + health %)
- Add individual consumable reset buttons (reset-blade, reset-brush, reset-robot-maintenance)
- Correct prop.2.51 as generic settings-update trigger (WRP/FDP/LOW)
- Remove invalid cleaning-progress (4-63) from mower states

## 0.3.3 (2026-04-19)

- Parse all mower MQTT binary state fields (battery, error, location, docking, pin, camera, BLE/WiFi/LTE RSSI)
- Parse mower live position from MQTT siid:1 piid:4 (12-bit packed format)
- Parse mower task progress (region, percent, total/finished area)
- Draw robot position and dock on mower map image
- Draw robot, charger, virtual walls, no-go zones and zone names on vacuum map image
- Add siid-piid identifiers to all mower state names
- Fix mower status labels per common_mower_protocol.json
- Add named mower properties (task-info, device-time, zone-status, RTK, GPS satellites, positioning-mode)
- Fetch all siid property values on startup (removed siid<=3 filter)
- Fix undefined deviceArray entry in connectMqtt

## 0.3.2 (2026-04-17)

- Add MOVA brand support (MOVA 600, MOVA 1000)
- Add Cloud Service selector (Dreame/MOVA) in adapter settings
- Centralize API configuration (domain, auth, headers) per brand
- Add mower support (A1, A1 Pro, A2, A2 1200, A3 AWD 1000)
- Dedicated mower states (status, remote, map)
- Mower map rendering via iotuserdata API
- Add 3D LIDAR map generation and download URL
- Add retry logic for API requests
- Fix JSON parsing errors

## 0.2.2 (2025-01-24)

- Reduce CPU load while cleaning

## 0.2.1 (2025-01-15)

- Fix for canvas installation

## 0.2.0 (2024-12-28)

- Add simple maps

## 0.1.1 (2024-12-14)

- Improve error handling

## 0.1.0 (2024-12-14)

- (TA2k) initial release
