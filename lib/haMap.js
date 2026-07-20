'use strict';
/*
 * HA-Port: Dreame-Karten-Dekoder (Bausteine)
 * ===========================================
 * 1:1-Portierung aus:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * Referenz: dreame/map.py, dreame/types.py
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * WICHTIG: Diese Datei bildet HAs Logik EXAKT ab (gleiche Verzweigungen, gleiche
 * Zahlen). Keine eigenen Erfindungen, keine Vereinfachungen. Wenn etwas nicht
 * passt, ist es ein Port-Fehler und gegen map.py zu prüfen — nicht "kreativ" zu fixen.
 */

// types.py: class MapPixelType(IntEnum)
const MapPixelType = {
  OUTSIDE: 0,
  WIFI_WALL: 2,
  WIFI_UNREACHED: 10,
  WIFI_POOR: 11,
  WIFI_LOW: 12,
  WIFI_HIGH: 13,
  WIFI_EXCELLENT: 14,
  WALL: 255,
  FLOOR: 254,
  NEW_SEGMENT: 253,
  UNKNOWN: 252,
  OBSTACLE_WALL: 251,
  DIRTY_AREA: 250,
  CLEAN_AREA: 249,
};

// types.py: class MapFrameType(IntEnum)
const MapFrameType = { I: 73, P: 80, W: 87 };

// types.py: class StartupMethod(IntEnum)
const StartupMethod = { OTHER: -1, BY_BUTTON: 0, THROUGH_APP: 1, SCHEDULED_ACTIVATION: 2, THROUGH_VOICE: 3 };

// types.py: class CleanupMethod(IntEnum)
const CleanupMethod = { OTHER: -1, DEFAULT_MODE: 0, CUSTOMIZED_CLEANING: 1, CLEANGENIUS: 2, WATER_STAIN_CLEANING: 3 };

// types.py: class TaskEndType(IntEnum)
const TaskEndType = { OTHER: 0, MANUAL_DOCKING: 1, NORMAL_RECHARGING: 2, ABNORMAL_DOCKING: 3, STOP: 4 };

// types.py: class DreameVacuumFloorMaterial(IntEnum)
const DreameVacuumFloorMaterial = { UNKNOWN: -1, NONE: 0, WOOD: 1, TILE: 2, MEDIUM_PILE_CARPET: 5, LOW_PILE_CARPET: 6, CARPET: 7 };

// types.py: class DreameVacuumFloorMaterialDirection(IntEnum)
const DreameVacuumFloorMaterialDirection = { UNKNOWN: -1, HORIZONTAL: 0, VERTICAL: 90 };

// types.py: class ObstacleType(IntEnum)
const ObstacleType = {
  UNKNOWN: 0, BASE: 128, SCALE: 129, THREAD: 130, WIRE: 131, TOY: 132, SHOES: 133, SOCK: 134,
  FECE: 135, TRASH_CAN: 136, FABRIC: 137, POWER_STRIP: 138, LIQUID_STAIN: 139, OBSTACLE: 142,
  PET: 158, CLEANING_TOOLS: 163, DETECTED_STAIN: 169, BLOCKED_ROOM: 200, EASY_TO_STUCK_FURNITURE: 201,
  UNCLEANABLE_STAIN: 202, LEG: 204, LARGE_PARTICLES: 205, DRIED_STAIN: 206, FOOD_BOWL: 209,
  PET_BED: 210, CLEANED_STAIN: 214, SKIPPED_UNCLEANABLE_STAIN: 215, CLEANED_DRIED_STAIN: 216,
  CLEANED_LARGE_PARTICLES: 217, HAIR: 225, PAPER: 226, CLEANED_HAIR: 228, SUNDRY: 229,
};

// types.py: class ObstacleIgnoreStatus(IntEnum)
const ObstacleIgnoreStatus = { UNKNOWN: -1, NOT_IGNORED: 0, MANUALLY_IGNORED: 1, AUTOMATICALLY_IGNORED: 2, ERROR: 3, HIDDEN: 4 };

// types.py: class ObstacleReason(IntEnum)
const ObstacleReason = {
  BLOCKED_BY_VIRTUAL_WALL: 2, BLOCKED_BY_DOOR: 3, BLOCKED_BY_THRESHOLD: 4, BLOCKED_BY_OBSTACLE: 5,
  BLOCKED_BY_CARPET: 6, BLOCKED_BY_DETECTED_CARPET: 7, BLOCKED_BY_HIDDEN_OBSTACLE: 8,
  BLOCKED_BY_DYNAMIC_OBSTACLE: 9, PASSAGE_TOO_LOW: 10, STEP_TOO_LOW: 27, FAILED_TO_CROSS_THRESHOLD: 33,
};

// types.py: class FurnitureType(IntEnum)
const FurnitureType = {
  SINGLE_BED: 1, DOUBLE_BED: 2, ARM_CHAIR: 3, TWO_SEAT_SOFA: 4, THREE_SEAT_SOFA: 5, DINING_TABLE: 6,
  NIGHTSTANT: 7, COFFEE_TABLE: 8, TOILET: 9, LITTER_BOX: 10, PET_BED: 11, FOOD_BOWL: 12, PET_TOILET: 13,
  REFRIGERATOR: 14, WASHING_MACHINE: 15, ENCLOSED_LITTER_BOX: 16, AIR_CONDITIONER: 17, TV_CABINET: 18,
  BOOKSHELF: 19, SHOE_CABINET: 20, WARDROBE: 21, GREENERY: 22, FLOOR_MIRROR: 23, L_SHAPED_SOFA: 24,
  ROUND_COFFEE_TABLE: 25, TABLE: 26, ARM_CHAIR_NARROW: 29, THREE_SEAT_SOFA_NARROW: 30, L_SHAPED_SOFA_RIGHT: 31,
};

// types.py: class DreameVacuumTaskStatus(IntEnum)
const DreameVacuumTaskStatus = {
  UNKNOWN: -1, COMPLETED: 0, AUTO_CLEANING: 1, ZONE_CLEANING: 2, SEGMENT_CLEANING: 3, SPOT_CLEANING: 4,
  FAST_MAPPING: 5, AUTO_CLEANING_PAUSED: 6, ZONE_CLEANING_PAUSED: 7, SEGMENT_CLEANING_PAUSED: 8,
  SPOT_CLEANING_PAUSED: 9, MAP_CLEANING_PAUSED: 10, DOCKING_PAUSED: 11, MOPPING_PAUSED: 12,
  SEGMENT_MOPPING_PAUSED: 13, ZONE_MOPPING_PAUSED: 14, AUTO_MOPPING_PAUSED: 15, AUTO_DOCKING_PAUSED: 16,
  SEGMENT_DOCKING_PAUSED: 17, ZONE_DOCKING_PAUSED: 18, CRUISING_PATH: 20, CRUISING_PATH_PAUSED: 21,
  CRUISING_POINT: 22, CRUISING_POINT_PAUSED: 23, SUMMON_CLEAN_PAUSED: 24, RETURNING_INSTALL_MOP: 25,
  RETURNING_REMOVE_MOP: 26, STATION_CLEANING: 27, PET_FINDING: 30, AUTO_CLEANING_WASHING_PAUSED: 31,
  AREA_CLEANING_WASHING_PAUSED: 32, CUSTOM_CLEANING_WASHING_PAUSED: 33, PICKING_UP_ITEM: 34,
  PICKING_UP_ITEM_PAUSED: 35, PICKING_UP_ITEM_SUCCESS: 36, REMOTE_PICKUP_INITIALIZING: 37,
  REMOTE_PICKUP_IDENTIFING: 38, MANUAL_REMOTE_PICKUP: 39, AUTOMATIC_REMOTE_PICKUP: 40,
  REMOTE_PICKUP_IN_PROGRESS: 41, REMOTE_PICKUP_PAUSED: 42, PLACING_ITEM: 43, PLACING_ITEM_PAUSED: 44,
};

// types.py: class DreameVacuumStatus(IntEnum)
const DreameVacuumStatus = {
  UNKNOWN: -1, IDLE: 0, PAUSED: 1, CLEANING: 2, BACK_HOME: 3, PARTIAL_CLEANING: 4, FOLLOW_WALL: 5,
  CHARGING: 6, OTA: 7, FCT: 8, WIFI_SET: 9, POWER_OFF: 10, FACTORY: 11, ERROR: 12, REMOTE_CONTROL: 13,
  SLEEPING: 14, SELF_REPAIR: 15, FACTORY_FUNCION_TEST: 16, STANDBY: 17, SEGMENT_CLEANING: 18,
  ZONE_CLEANING: 19, SPOT_CLEANING: 20, FAST_MAPPING: 21, CRUISING_PATH: 22, CRUISING_POINT: 23,
  SUMMON_CLEAN: 24, SHORTCUT: 25, PERSON_FOLLOW: 26, PET_GUARDING: 27, AUTO_ARRANGEMENT: 28,
  SMART_ARRANGEMENT: 29, ZONED_ARRANGEMENT: 30, WATER_CHECK: 1501,
};

/**
 * 1:1-Port der HA-Status-Properties aus device.py, die die Render-Vorverarbeitung steuert:
 *   started         (9038-9058)  — Geraet hat eine aktive Aufgabe
 *   segment_cleaning(8819-8830)  — Raumreinigung laeuft
 *   zone_cleaning   (8792-8803)  — Zonenreinigung laeuft
 *   spot_cleaning   (8806-8816)  — Punktreinigung laeuft
 *
 * WICHTIG (device.py 3104-3109, 3165-3175): Die Kartendaten des Geraets enthalten IMMER
 * die zuletzt aktiven Segmente/Zonen/Punkte ("Map data always contains last active ..."),
 * auch wenn nichts mehr laeuft. Ohne diese Riegel bliebe z.B. die Ausgrauung fuer immer
 * haengen. Deshalb sind diese Properties Pflicht, kein Beiwerk.
 *
 * ➖ NICHT portiert: HAs `go_to_zone` — das ist kein Geraetewert, sondern ein
 * HA-Integrations-Feature (GoToZoneSettings, vom Nutzer ueber HA gestartet). Bei uns
 * existiert es nicht, entspricht damit dauerhaft None/false.
 *
 * @param {{taskStatus:number, status:number, cleaningPaused:boolean|number}} s Rohwerte aus
 *   den States status.task-status / status.status / status.cleaning-paused
 * @returns {{started:boolean, segmentCleaning:boolean, zoneCleaning:boolean, spotCleaning:boolean}}
 */
function deviceStatusFlags(s) {
  const T = DreameVacuumTaskStatus;
  const S = DreameVacuumStatus;
  // device.py task_status (7846-7858): unbekannte/fehlende Werte -> UNKNOWN (-1).
  // Achtung, HA-Verhalten: UNKNOWN ist weder COMPLETED noch DOCKING_PAUSED -> started = true.
  const taskStatus = s && Object.values(T).includes(s.taskStatus) ? s.taskStatus : T.UNKNOWN;
  const status = s && Object.values(S).includes(s.status) ? s.status : S.UNKNOWN;
  const cleaningPaused = !!(s && s.cleaningPaused);

  const started = Boolean(
    (taskStatus !== T.COMPLETED && taskStatus !== T.DOCKING_PAUSED) ||
      cleaningPaused ||
      status === S.CLEANING ||
      status === S.SEGMENT_CLEANING ||
      status === S.ZONE_CLEANING ||
      status === S.SPOT_CLEANING ||
      status === S.PARTIAL_CLEANING ||
      status === S.FAST_MAPPING ||
      status === S.CRUISING_PATH ||
      status === S.CRUISING_POINT ||
      status === S.SHORTCUT,
  );

  return {
    started,
    segmentCleaning: Boolean(
      started &&
        (taskStatus === T.SEGMENT_CLEANING ||
          taskStatus === T.SEGMENT_CLEANING_PAUSED ||
          taskStatus === T.SEGMENT_MOPPING_PAUSED ||
          taskStatus === T.SEGMENT_DOCKING_PAUSED),
    ),
    zoneCleaning: Boolean(
      started &&
        (taskStatus === T.ZONE_CLEANING ||
          taskStatus === T.ZONE_CLEANING_PAUSED ||
          taskStatus === T.ZONE_MOPPING_PAUSED ||
          taskStatus === T.ZONE_DOCKING_PAUSED),
    ),
    spotCleaning: Boolean(
      started && (taskStatus === T.SPOT_CLEANING || taskStatus === T.SPOT_CLEANING_PAUSED || status === S.SPOT_CLEANING),
    ),
    taskStatus,
  };
}

/**
 * map.py: DreameVacuumMapDecoder._get_pixel_type(map_data, pixel)
 * NUR fuer P-Frames (decode_p_map_data_from_partial ruft dies pro geaendertem Pixel auf).
 * Fuer I-Frames benutzt HA einen ANDEREN, eigenen 5-verzweigten Algorithmus — siehe
 * decodeIFramePixels() unten (map.py deckt das inline in decode_map_data_from_partial ab,
 * NICHT ueber diese Funktion).
 * @param {{version:number, frame_map:boolean, saved_map_status:number}} mapData
 * @param {number} pixel Roh-Byte
 * @returns {[number, boolean]} [pixelType, carpet]
 */
function getPixelType(mapData, pixel) {
  if (mapData.version === 3) {
    const carpet = (pixel & 0x80) !== 0;
    const segment_id = pixel & 0x1f;

    if (segment_id === 0) return [MapPixelType.OUTSIDE, carpet];

    const wall = (pixel >> 5) & 0x03;
    if (wall === 3) return [200 + segment_id, carpet];

    if (segment_id === 31) {
      if (wall > 0) return [MapPixelType.WALL, carpet];
      if (mapData.saved_map_status === 1 || mapData.saved_map_status === 0) {
        return [MapPixelType.NEW_SEGMENT, carpet];
      }
      return [MapPixelType.FLOOR, carpet];
    }

    if (wall > 0) return [100 + segment_id, carpet];

    return [segment_id, carpet];
  }

  if (mapData.frame_map) {
    const carpet = (pixel & 0x03) === 3;
    let segment_id = pixel >> 2;

    if (segment_id > 0 && segment_id < 64) {
      if (segment_id === 63) return [MapPixelType.WALL, carpet];
      if (segment_id === 62) return [MapPixelType.FLOOR, carpet];
      if (segment_id === 61) return [MapPixelType.UNKNOWN, carpet];
      return [segment_id, carpet];
    }

    segment_id = pixel & 0x03;
    // as implemented on the app
    if (segment_id === 1 || segment_id === 3) return [MapPixelType.NEW_SEGMENT, carpet];
    if (segment_id === 2) return [MapPixelType.WALL, carpet];
  } else if (mapData.version === 0) {
    const carpet = (pixel & 0x03) === 3;
    const segment_id = pixel & 0x7f;
    if (segment_id === 1 || segment_id === 3) return [MapPixelType.NEW_SEGMENT, carpet];
    else if (segment_id === 2) return [MapPixelType.WALL, carpet];
  } else {
    const carpet = (pixel & 0x40) === 64;
    const segment_id = pixel & 0x3f;
    if (pixel >> 7) {
      return [segment_id ? 100 + segment_id : MapPixelType.WALL, carpet];
    }

    if (segment_id > 0) {
      if (mapData.saved_map_status === 1 || mapData.saved_map_status === 0) {
        // as implemented on the app
        if (segment_id === 1 || segment_id === 3) return [MapPixelType.NEW_SEGMENT, carpet];
        if (segment_id === 2) return [MapPixelType.WALL, carpet];
        return [MapPixelType.OUTSIDE, false];
      }
      return [segment_id, carpet];
    }
  }

  return [MapPixelType.OUTSIDE, false];
}

/**
 * map.py: decode_map_data_from_partial, Pixel-Schleife (Zeilen ~4472-4590).
 * Eigener Algorithmus fuer I-/W-Frames — NICHT _get_pixel_type. 5 Zweige in HAs
 * fester Reihenfolge: version==3 | frame_map | saved_map_status 0/1 | (version==0
 * und nicht gespeichert/wiederhergestellt) ODER saved_map_status==2 | sonst (v1/2 Normalfall).
 * @param {{frameType:number, version:number, frameMap:boolean, savedMap:boolean,
 *          savedMapStatus:number, recoveryMap:boolean, data:Uint8Array, width:number, height:number}} p
 * @returns {{pixelType:Uint8Array, carpetPixels:number[][], emptyMap:boolean}}
 */
function decodeIFramePixels(p) {
  const { frameType, version, frameMap, savedMap, savedMapStatus, recoveryMap, data, width, height } = p;
  const n = width * height;
  const pixelType = new Uint8Array(n); // 0 = OUTSIDE (np.full-Default)
  const carpetPixels = [];
  let emptyMap = true;

  if (frameType === MapFrameType.W) {
    // map.py 4476-4485
    try {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = width * y + x;
          const pixel = data[idx] & 0x0f;
          if (pixel > 0) {
            emptyMap = false;
            pixelType[idx] = pixel;
          }
        }
      }
    } catch (e) { /* HA: bare except: pass */ }
    return { pixelType, carpetPixels, emptyMap };
  }

  if (frameType !== MapFrameType.I) {
    // P-Frames laufen NICHT hier durch (decode_p_map_data_from_partial nutzt getPixelType
    // pro geaendertem Pixel); ohne I/W bleibt pixel_type unveraendert und map.py setzt
    // empty_map bei diesem Fallthrough auf true (kein Zweig setzt es zurueck auf false).
    return { pixelType, carpetPixels, emptyMap: true };
  }

  if (version === 3) {
    // map.py 4488-4519
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = width * y + x;
        const pixel = data[idx];
        if (pixel > 0) {
          emptyMap = false;
          if ((pixel & 0x80) !== 0) carpetPixels.push([x, y]);
          const segment_id = pixel & 0x1f;
          const wall = (pixel >> 5) & 0x03;
          if (segment_id === 0) {
            pixelType[idx] = MapPixelType.OUTSIDE;
          } else if (segment_id === 31) {
            if (wall > 0) {
              pixelType[idx] = wall === 3 ? 200 + segment_id : MapPixelType.WALL;
            } else {
              pixelType[idx] = (savedMapStatus === 1 || savedMapStatus === 0) ? MapPixelType.NEW_SEGMENT : MapPixelType.FLOOR;
            }
          } else {
            if (wall > 0) pixelType[idx] = wall === 3 ? 200 + segment_id : 100 + segment_id;
            else pixelType[idx] = segment_id;
          }
        }
      }
    }
  } else if (frameMap) {
    // map.py 4520-4543
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = width * y + x;
        const pixel = data[idx];
        if (pixel > 0) {
          if ((pixel & 0x03) === 3) carpetPixels.push([x, y]);
          emptyMap = false;
          let segment_id = pixel >> 2;
          if (segment_id > 0 && segment_id < 64) {
            if (segment_id === 63) pixelType[idx] = MapPixelType.WALL;
            else if (segment_id === 62) pixelType[idx] = MapPixelType.FLOOR;
            else if (segment_id === 61) pixelType[idx] = MapPixelType.UNKNOWN;
            else pixelType[idx] = segment_id;
          } else {
            segment_id = pixel & 0x3f;
            if (segment_id === 1 || segment_id === 3) pixelType[idx] = MapPixelType.NEW_SEGMENT;
            else if (segment_id === 2) pixelType[idx] = MapPixelType.WALL;
          }
        }
      }
    }
  } else if (savedMapStatus === 1 || savedMapStatus === 0) {
    // map.py 4544-4558 — emptyMap bleibt true, ausser NEW_SEGMENT/WALL kommt vor
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = width * y + x;
        const pixel = data[idx];
        if (pixel > 0) {
          if ((pixel & 0x03) === 3) carpetPixels.push([x, y]);
          const segment_id = pixel & 0x3f;
          if (segment_id === 1 || segment_id === 3) { emptyMap = false; pixelType[idx] = MapPixelType.NEW_SEGMENT; }
          else if (segment_id === 2) { emptyMap = false; pixelType[idx] = MapPixelType.WALL; }
        }
      }
    }
  } else if ((version === 0 && !savedMap && !recoveryMap) || savedMapStatus === 2) {
    // map.py 4559-4573 — KEIN "pixel>0"-Gate (bewusst wie im Original)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = width * y + x;
        const pixel = data[idx];
        if ((pixel & 0x03) === 3) carpetPixels.push([x, y]);
        const segment_id = pixel & 0x3f;
        if (segment_id > 0) {
          emptyMap = false;
          pixelType[idx] = segment_id === 2 ? MapPixelType.WALL : MapPixelType.NEW_SEGMENT;
        }
      }
    }
  } else {
    // map.py 4574-4589 — Normalfall v1/v2
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = width * y + x;
        const pixel = data[idx];
        if (pixel > 0) {
          if ((pixel & 0x40) === 64) carpetPixels.push([x, y]);
          emptyMap = false;
          const segment_id = pixel & 0x3f;
          if (pixel >> 7) {
            pixelType[idx] = segment_id ? 100 + segment_id : MapPixelType.WALL;
          } else if (segment_id > 0) {
            pixelType[idx] = segment_id;
          }
        }
      }
    }
  }

  return { pixelType, carpetPixels, emptyMap };
}

/**
 * map.py: DreameVacuumMapDecoder._get_segment_center (Zeilen 4027-4074).
 * Sucht auf einer Zeile/Spalte die laengste zusammenhaengende Strecke des Segments
 * (Luecken bis 3 Pixel werden toleriert) und liefert deren Mitte.
 */
function getSegmentCenter(m, segmentId, center, vertical) {
  const lines = [];
  let zeroPixels = -1;
  let segmentPixel = 0;
  let line = null;
  const width = m.dimensions.width;
  const limit = vertical ? m.dimensions.height : width;

  for (let k = 0; k < limit; k++) {
    const idx = vertical ? (k * width + center) : (center * width + k);
    if (idx >= m.data.length) continue;
    const pixelVal = m.data[idx];
    let segment;
    if (m.version === 3) {
      segment = pixelVal & 0x1f;
      if (segment === 31 || ((pixelVal >> 5) & 0x03) === 3) segment = 0;
    } else {
      segment = pixelVal & 0x3f;
    }

    if (segment === segmentId) {
      segmentPixel = k;
      zeroPixels = 0;
      if (line === null) line = [segmentPixel];
    } else if (segment === 0) {
      if (zeroPixels >= 0) {
        zeroPixels++;
        if (zeroPixels >= 4 && line !== null) {
          line.push(segmentPixel);
          lines.push(line);
          line = null;
        }
      }
    } else if (line !== null) {
      line.push(segmentPixel);
      lines.push(line);
      line = null;
    }
  }
  if (line !== null) { line.push(segmentPixel); lines.push(line); }

  if (lines.length) {
    let maxLine = lines[0];
    for (const l of lines) if ((l[1] - l[0]) > (maxLine[1] - maxLine[0])) maxLine = l;
    return Math.ceil((maxLine[1] - maxLine[0]) / 2 + maxLine[0]);
  }
  return null;
}

/** map.py: Segment.calculate_coords (types.py 3668-3678) */
function calculateSegmentCoords(segment, dims) {
  if (segment.unmapped) return;
  const grid = dims.grid_size;
  if (segment.coords && segment.coords[0] != null && grid) {
    segment.x0 = Math.floor(dims.left + segment.coords[0] * grid);
    segment.y0 = Math.floor(dims.top + segment.coords[1] * grid);
    segment.x1 = Math.floor(dims.left + segment.coords[2] * grid + grid);
    segment.y1 = Math.floor(dims.top + segment.coords[3] * grid + grid);
  }
}

/** map.py: Zone.check_point / Area.check_point (types.py 3582, 3947-3955) — achsenparalleles Bbox+size */
function segmentCheckPoint(seg, x, y, size) {
  if (seg.x0 == null || seg.x1 == null || seg.y0 == null || seg.y1 == null) return false;
  const minX = Math.min(seg.x0, seg.x1), maxX = Math.max(seg.x0, seg.x1);
  const minY = Math.min(seg.y0, seg.y1), maxY = Math.max(seg.y0, seg.y1);
  return x >= minX - size && x <= maxX + size && y >= minY - size && y <= maxY + size;
}

/**
 * map.py: DreameVacuumMapDecoder.get_segments(map_data) (Zeilen 6110-6170).
 * Baut die Segment-Liste (Raum-ID -> Bounding-Box + Mittelpunkt) aus dem pixel_type-Raster.
 * "100+seg" (Raum-Zelle mit Wand) wird auf die Basis-Raum-ID normalisiert. Der Mittelpunkt
 * wird bei gespeicherter Karte / v3 per getSegmentCenter verfeinert (konkave Raumformen).
 * @param {{pixel_type:Uint8Array, data:Uint8Array, dimensions:Object, version:number, saved_map:boolean}} m
 */
function getSegments(m) {
  const segments = {};
  const { width, height } = m.dimensions;
  const maxSeg = m.version === 3 ? 32 : 64;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let segment_id = m.pixel_type[width * y + x];
      if (segment_id > 100 && segment_id < 200) segment_id -= 100;

      if (segment_id > 0 && segment_id < maxSeg) {
        if (!segments[segment_id]) {
          segments[segment_id] = { id: segment_id, coords: [x, y, x, y], unmapped: false };
          continue;
        }
        const s = segments[segment_id];
        if (x < s.coords[0]) s.coords[0] = x;
        else if (x > s.coords[2]) s.coords[2] = x;
        if (y < s.coords[1]) s.coords[1] = y;
        else if (y > s.coords[3]) s.coords[3] = y;
      }
    }
  }

  for (const segment of Object.values(segments)) {
    let cx = Math.ceil((segment.coords[2] - segment.coords[0]) / 2 + segment.coords[0]);
    let cy = Math.ceil((segment.coords[3] - segment.coords[1]) / 2 + segment.coords[1]);

    if (m.saved_map || m.version === 3) {
      if (m.version === 0) {
        if (m.pixel_type[cy * width + cx] !== segment.id) {
          let startI = -1, endI = -1;
          for (let i = 0; i < width; i++) {
            const value = m.pixel_type[cy * width + i];
            if (startI === -1) { if (value === segment.id) startI = i; }
            else if (value !== segment.id || i === width - 1) { endI = i - 1; break; }
          }
          if (startI !== -1 && endI !== -1) cx = (endI - startI) + startI;
        }
      } else {
        const centerX = getSegmentCenter(m, segment.id, cy, false);
        if (centerX !== null) {
          const centerY = getSegmentCenter(m, segment.id, centerX, true);
          if (centerY !== null) { cx = centerX; cy = centerY; }
        }
      }
    }

    segment.x = Math.floor(m.dimensions.left + cx * m.dimensions.grid_size + m.dimensions.offset);
    segment.y = Math.floor(m.dimensions.top + cy * m.dimensions.grid_size + m.dimensions.offset);
    calculateSegmentCoords(segment, m.dimensions);
  }
  return segments;
}

/** map.py: DreameVacuumMapDecoder._find_px_type (Zeilen 4077-4127) */
function findPxType(x, y, m, maxSteps = 50) {
  let pixelType = m.pixel_type, dims = m.dimensions;
  if (m.combined_pixel_type) { pixelType = m.combined_pixel_type; dims = m.combined_dimensions; }
  if (!pixelType || !dims) return 0;

  const px0 = Math.trunc((x - dims.left) / dims.grid_size);
  const py0 = Math.trunc((y - dims.top) / dims.grid_size);
  const maxX = dims.width - 1, maxY = dims.height - 1;
  const clampedX = Math.max(0, Math.min(px0, maxX));
  const clampedY = Math.max(0, Math.min(py0, maxY));
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const at = (xx, yy) => pixelType[yy * dims.width + xx];

  function find(xx, yy, distance, steps) {
    if (steps > maxSteps) return 0;
    for (const [dx, dy] of directions) {
      const nx = xx + dx * distance, ny = yy + dy * distance;
      if (nx >= 0 && nx <= maxX && ny >= 0 && ny <= maxY) {
        const pxv = at(nx, ny);
        if (pxv != null) {
          let val = pxv;
          if (val > 100 && val < 200) val -= 100;
          if (val !== 255 && val !== 0) return val;
        }
      }
    }
    return find(xx, yy, distance + 1, steps + 1);
  }

  const pxv = at(clampedX, clampedY);
  if (pxv != null) {
    let val = pxv;
    if (val > 100 && val < 200) val -= 100;
    if (val === 255 || (val > 200 && val < 232) || val === 0) {
      return maxSteps ? find(clampedX, clampedY, 1, 1) : 0;
    }
    return (!maxSteps || pxv < 100) ? val : 0;
  }
  return maxSteps ? find(clampedX, clampedY, 1, 1) : 0;
}

/** map.py: DreameVacuumMapDecoder.set_robot_segment (Zeilen 6173-6190) */
function setRobotSegment(m) {
  if (m.segments && Object.keys(m.segments).length && m.saved_map_status === 2 && m.robot_position) {
    let seg = findPxType(m.robot_position.x, m.robot_position.y, m);
    if (!m.segments[seg]) {
      seg = 0;
      for (const v of Object.values(m.segments)) {
        if (!v.unmapped && segmentCheckPoint(v, m.robot_position.x, m.robot_position.y, m.dimensions.grid_size * 4)) { seg = v.id; break; }
      }
    }
    m.robot_segment = seg;
  } else {
    m.robot_segment = null;
  }
}

/** map.py: DreameVacuumMapDecoder.set_station_segment (Zeilen 6193-6210) */
function setStationSegment(m) {
  if (m.segments && Object.keys(m.segments).length && m.charger_position) {
    let seg = findPxType(m.charger_position.x, m.charger_position.y, m);
    if (!m.segments[seg]) {
      seg = 0;
      for (const v of Object.values(m.segments)) {
        if (!v.unmapped && segmentCheckPoint(v, m.charger_position.x, m.charger_position.y, m.dimensions.grid_size * 4)) { seg = v.id; break; }
      }
    }
    m.station_segment = seg;
  } else {
    m.station_segment = null;
  }
}

/**
 * map.py: DreameVacuumMapDecoder.set_obstacle_segment (Zeilen 6213-6241).
 * ABWEICHUNG von HA (bewusst, dokumentiert): HAs `if obstacle.segment_id in
 * map_data.segments.items():` vergleicht eine Zahl mit einer Liste von (key,value)-Tupeln
 * und ist damit im Original IMMER False (Upstream-Bug) — der BLOCKED_ROOM-Zweig faellt bei
 * HA nie in die "gefunden"-Kachel. Wir portieren die erkennbar GEMEINTE Logik (segment_id
 * in map_data.segments), da ein bewusst repliziertes Nichts hier keinen Sinn ergibt.
 */
function setObstacleSegment(m, obstacles) {
  if (!m.segments || !Object.keys(m.segments).length || !obstacles) return;
  for (const obstacle of Object.values(obstacles)) {
    if (obstacle.type === ObstacleType.BLOCKED_ROOM) {
      const segment = obstacle.segment_id != null ? m.segments[obstacle.segment_id] : null;
      if (segment) {
        obstacle.x = segment.x; obstacle.y = segment.y;
        obstacle.segment = segment.name; obstacle.color_index = segment.color_index;
      }
    } else {
      const seg = findPxType(obstacle.x, obstacle.y, m, 200);
      const segment = m.segments[seg];
      if (!segment) {
        for (const v of Object.values(m.segments)) {
          if (!v.unmapped && segmentCheckPoint(v, obstacle.x, obstacle.y, m.dimensions.grid_size * 4)) {
            obstacle.segment = v.name; obstacle.segment_id = v.id; obstacle.color_index = v.color_index;
            break;
          }
        }
      } else {
        obstacle.segment = segment.name; obstacle.segment_id = segment.id; obstacle.color_index = segment.color_index;
      }
    }
  }
}

/** map.py: DreameVacuumMapDecoder.get_carpets (Zeilen 6565-6591) */
function getCarpets(mapData, savedMapData) {
  if (mapData.saved_map_status === 2 && savedMapData && savedMapData.carpet_pixels && savedMapData.carpet_pixels.length) {
    let leftOffset = 0;
    if (savedMapData.dimensions.left < mapData.dimensions.left) {
      leftOffset = Math.trunc((mapData.dimensions.left - savedMapData.dimensions.left) / mapData.dimensions.grid_size);
    }
    let topOffset = 0;
    if (savedMapData.dimensions.top < mapData.dimensions.top) {
      topOffset = Math.trunc((mapData.dimensions.top - savedMapData.dimensions.top) / mapData.dimensions.grid_size);
    }
    if (leftOffset !== 0 || topOffset !== 0) {
      const carpetPixels = [];
      for (const point of savedMapData.carpet_pixels) {
        const x = point[0] - leftOffset, y = point[1] - topOffset;
        if (x >= 0 && x < mapData.dimensions.width && y >= 0 && y < mapData.dimensions.height) {
          const value = mapData.pixel_type[y * mapData.dimensions.width + x];
          if (value > 0) carpetPixels.push([x, y]);
        }
      }
      return carpetPixels;
    }
    return savedMapData.carpet_pixels;
  }
  return mapData.carpet_pixels;
}

/** map.py: DreameVacuumMapDecoder._compare_segment_neighbors / _compare_colors (3935-3951) */
function compareSegmentNeighbors(r1, r2) {
  const alen = r1[1] ? r1[1].length : 0;
  const blen = r2[1] ? r2[1].length : 0;
  if (alen === blen) return r1[0] - r2[0];
  return blen - alen;
}
function compareColors(c1, c2) {
  return c1[1] !== c2[1] ? c1[1] - c2[1] : c1[0] - c2[0];
}

/**
 * map.py: DreameVacuumMapDecoder.set_segment_color_index (Zeilen 6494-6563) — "as
 * implemented on the app". Vergibt 4 Farb-Indizes (0-3): Segmente nach Nachbaranzahl
 * (absteigend, dann ID) sortiert, je Segment die am wenigsten benutzte Farbe ohne
 * Nachbar-Kollision. Bei version==3 zusaetzlich: Flaeche aus walls_info (Shoelace-Formel),
 * groesstes Segment zuerst, Farb-Remap [0,2,3,1].
 * @param {{version:number, segments:Object}} mapData
 * @param {Array<[number, number[]|null, number]>} segmentInfo [id, nei_id, area] — wird von
 *   v3 in-place mutiert (Flaeche), wie im Original.
 * @param {Object} [wallsInfo] meta.walls_info (nur fuer version==3 gebraucht)
 */
function setSegmentColorIndex(mapData, segmentInfo, wallsInfo) {
  const areaColorIndex = {};
  if (!segmentInfo || !segmentInfo.length) return;

  let sortedSegments;
  if (mapData.version === 3) {
    if (wallsInfo && wallsInfo.storeys && wallsInfo.storeys[0] && wallsInfo.storeys[0].rooms) {
      for (const room of wallsInfo.storeys[0].rooms) {
        const walls = room.walls;
        if (!walls || !walls.length) continue;
        const n = walls.length;
        let area = 0;
        for (let i = 0; i < n; i++) {
          const a = walls[i], b = walls[(i + 1) % n];
          area += a.beg_pt_x * b.beg_pt_y - b.beg_pt_x * a.beg_pt_y;
        }
        const segmentId = room.room_id;
        for (let i = 0; i < segmentInfo.length; i++) {
          if (segmentInfo[i][0] === segmentId) { segmentInfo[i][2] = Math.abs(area / 2); break; }
        }
      }
    }
    segmentInfo.sort((a, b) => a[0] - b[0]);
    let maxAreaItem = segmentInfo[0];
    for (const s of segmentInfo) if (s[2] > maxAreaItem[2]) maxAreaItem = s;
    const rest = segmentInfo.filter((s) => s[0] !== maxAreaItem[0]).sort(compareSegmentNeighbors);
    sortedSegments = [maxAreaItem, ...rest];
  } else {
    sortedSegments = [...segmentInfo].sort(compareSegmentNeighbors);
  }

  for (const segment of sortedSegments) {
    const usedIds = [];
    if (segment[1]) for (const nid of segment[1]) if (areaColorIndex[nid] !== undefined) usedIds.push(areaColorIndex[nid]);
    const areaColorNum = [0, 1, 2, 3].map((i) => [i, 0]);
    for (const j of Object.values(areaColorIndex)) areaColorNum[j][1]++;
    areaColorNum.sort(compareColors);
    for (const areaColor of areaColorNum) {
      if (!usedIds.includes(areaColor[0])) { areaColorIndex[segment[0]] = areaColor[0]; break; }
    }
    if (areaColorIndex[segment[0]] === undefined) areaColorIndex[segment[0]] = 0;
  }

  for (const [k, v] of Object.entries(areaColorIndex)) {
    const color = mapData.version === 3 ? [0, 2, 3, 1][v] : v;
    if (mapData.segments && mapData.segments[k]) mapData.segments[k].color_index = color;
  }
}

/**
 * map.py: DreameVacuumMapRenderer._check_carpet (Polygon-Teil) — Ray-Casting-Test.
 * @param {number} x Weltkoordinate
 * @param {number} y Weltkoordinate
 * @param {number[]} polygon [x1,y1,x2,y2,...] Weltkoordinaten
 */
function pointInPolygon(x, y, polygon) {
  let check = false;
  const n = polygon.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const sx = polygon[i], sy = polygon[i + 1];
    const tx = polygon[j], ty = polygon[j + 1];
    if (sx === x && sy === y && tx === x && ty === y) return true;
    if (sy === ty && sy === y && ((sx > x && tx < x) || (sx < x && tx > x))) return true;
    if ((sy < y && ty >= y) || (sy >= y && ty < y)) {
      const xx = sx + ((y - sy) * (tx - sx)) / (ty - sy);
      if (xx === x) return true;
      if (xx > x) check = !check;
    }
  }
  return check;
}

module.exports = {
  MapPixelType, MapFrameType, StartupMethod, CleanupMethod, TaskEndType,
  DreameVacuumTaskStatus, DreameVacuumStatus, deviceStatusFlags,
  DreameVacuumFloorMaterial, DreameVacuumFloorMaterialDirection,
  ObstacleType, ObstacleIgnoreStatus, ObstacleReason, FurnitureType,
  getPixelType, decodeIFramePixels, getSegments, getSegmentCenter, calculateSegmentCoords,
  segmentCheckPoint, findPxType, setRobotSegment, setStationSegment, setObstacleSegment,
  getCarpets, setSegmentColorIndex, pointInPolygon,
};
