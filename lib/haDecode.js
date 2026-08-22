'use strict';
/*
 * HA-Port: decode_map_data_from_partial + decode_p_map_data_from_partial
 * ========================================================================
 * 1:1-Portierung aus:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * Referenz: dreame/map.py
 *   decode_map_data_from_partial    Zeilen 4220-5667
 *   decode_p_map_data_from_partial  Zeilen 5670-5898
 *   decode_map_partial (Versions-Erkennung) Zeilen 4130-4200
 *   decode_map / decode_saved_map   Zeilen 4203-4218
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Reiner DATEN-Parser (kein Rendering). Baut aus einem rohen Karten-Frame (Header +
 * Pixel-Bytes + JSON-Metadaten) ein JS-Objekt mit denselben Feldern wie HAs MapData
 * (types.py MapData) — unter denselben (snake_case) Namen, damit sich der Code direkt
 * gegen map.py/types.py pruefen laesst.
 *
 * Bewusst NICHT portiert (kein Rendering-/Anzeigebedarf in diesem Widget — siehe
 * PORT_STATUS.md fuer die Begruendung je Punkt):
 *  - AES-Kartenverschluesselung (Ebene von decode_map_partial, nicht dieser Funktionen).
 *  - decode_wifi_map_data / decode_cleaning_map_data: bauen eigene, rekursive
 *    MapData-Objekte fuer WLAN-Heatmap bzw. Reinigungs-Heatmap (nur bei clean_log/
 *    History-Karten bzw. "decmap" noetig). Rohfelder werden nur durchgereicht.
 *  - render_* (Bildaufbau) — das Widget zeichnet selbst ueber <canvas>.
 *
 * Bewusste Abweichung von HA (dokumentiert, kein "kreatives Fixen" ohne Hinweis):
 *  - set_obstacle_segment: HAs `obstacle.segment_id in map_data.segments.items()`
 *    vergleicht eine Zahl mit einer Liste von (key,value)-Tupeln und ist im Original
 *    IMMER False (Upstream-Bug) — siehe haMap.js.
 */

let pako;
try {
  pako = require('pako');
} catch (e) {
  const zlib = require('node:zlib');
  pako = { inflate: (b) => zlib.inflateSync(Buffer.from(b)) };
}
const { Buffer } = require('node:buffer');
const {
  MapPixelType, MapFrameType, StartupMethod, CleanupMethod, TaskEndType,
  DreameVacuumFloorMaterial, DreameVacuumFloorMaterialDirection, FurnitureType,
  ObstacleType, ObstacleIgnoreStatus, ObstacleReason,
  decodeIFramePixels, getSegments, getCarpets, setSegmentColorIndex, getPixelType,
  setRobotSegment, setStationSegment, setObstacleSegment, calculateSegmentCoords,
} = require('./haMap');

const HEADER_SIZE = 27;
// const.py: MAP_PARAMETER_NAME
const MAP_PARAMETER_NAME = 'name';

function clone(x) {
  if (x == null) return x;
  if (typeof structuredClone === 'function') return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

function enumHas(enumObj, value) {
  return Object.values(enumObj).includes(value);
}

// map.py: parse_areas (Zeilen 5164-5183)
function parseAreas(areas) {
  if (!areas) return null;
  return areas.map((area) => {
    const xs = [area[0], area[2]].sort((a, b) => a - b);
    const ys = [area[1], area[3]].sort((a, b) => a - b);
    return {
      x0: xs[0], y0: ys[0], x1: xs[1], y1: ys[0], x2: xs[1], y2: ys[1], x3: xs[0], y3: ys[1],
      angle: area.length > 4 ? area[4] : null,
    };
  });
}

// map.py: parse_lines (Zeilen 5185-5195)
function parseLines(lines) {
  if (!lines) return null;
  return lines.map((w) => ({ x0: w[0], y0: w[1], x1: w[2], y1: w[3] }));
}

// map.py: parse_carpets (Zeilen 5197-5221)
function parseCarpets(carpets) {
  if (!carpets) return null;
  return carpets.map((c) => {
    const ellipseRaw = c.length > 5 ? c[5] : null;
    const hiddenRaw = c.length > 7 ? c[7] : null;
    return {
      id: c.length > 4 ? parseInt(c[4], 10) : null,
      x0: c[0], y0: c[1], x1: c[2], y1: c[1], x2: c[2], y2: c[3], x3: c[0], y3: c[3],
      ellipse: ellipseRaw != null ? (ellipseRaw === '1' || ellipseRaw === 1) : null,
      carpet_type: c.length > 6 ? c[6] : null,
      ignored_areas: null, segments: null, polygon: null,
      hidden: hiddenRaw != null ? (hiddenRaw === '1' || hiddenRaw === 1) : null,
      tassel: c.length > 12 ? c.slice(8, 13) : null,
    };
  });
}

// map.py: Dreame-tr-String -> Path[]. L=relativ, l=absolute Linie (P-Frame-Anschluss), M/W/S=absoluter Punkt+Modus.
function parseTr(pathStr) {
  const re = /([MWSLl])(-?\d+),(-?\d+)/g;
  let m; let cx = 0, cy = 0;
  const path = [];
  while ((m = re.exec(pathStr))) {
    let operator = m[1];
    const x = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (operator === 'L') {
      cx += x; cy += y;
      path.push({ x: cx, y: cy, path_type: 'L' });
    } else {
      if (operator === 'l') operator = 'L';
      cx = x; cy = y;
      path.push({ x: cx, y: cy, path_type: operator });
    }
  }
  return path;
}

/**
 * map.py: decode_map_partial — nur der fuer uns relevante Teil (Header lesen,
 * JSON-Trailer parsen, Versions-Autoerkennung 4185-4195). AES-Zweig NICHT portiert
 * (siehe Datei-Kopf); ein verschluesselter Frame liefert hier einfach kaputte JSON
 * bzw. wird beim Aufrufer als "kein gueltiger Frame" behandelt.
 * @param {Buffer} inflated bereits Zlib-entpackter Frame (Header + Pixel + JSON)
 * @param {number} version Geraete-Basisversion (map_version)
 * @returns {{version:number, mapId:number, frameId:number, frameType:number,
 *            timestampMs:number|null, raw:Buffer, dataJson:Object}}
 */
function buildPartialMapFromInflated(inflated, version) {
  const mapId = inflated.readInt16LE(0);
  const frameId = inflated.readInt16LE(2);
  const frameType = inflated.readUInt8(4);
  const width = inflated.readInt16LE(19);
  const height = inflated.readInt16LE(21);
  const imageSize = HEADER_SIZE + width * height;

  let dataJson = {};
  let timestampMs = null;
  let ver = version;
  if (inflated.length >= imageSize) {
    try {
      dataJson = JSON.parse(inflated.toString('utf8', imageSize));
      if (dataJson.timestamp_ms) timestampMs = parseInt(dataJson.timestamp_ms, 10);
      if (
        ver < 3 &&
        ('saveMapId' in dataJson || 'cover' in dataJson || 'diff' in dataJson || 'curtain' in dataJson)
      ) {
        ver = 3;
      }
    } catch (e) { /* HA: nur warnen, Frame bleibt ohne data_json nutzbar */ }
  }

  return { version: ver, mapId, frameId, frameType, timestampMs, raw: inflated, dataJson };
}

/**
 * map.py: decode_saved_map (Zeilen 4216-4218) = decode_map(...)[0]
 * Entpackt eine eingebettete gespeicherte Karte (meta.rism / meta.whm: base64+zlib,
 * URL-sichere Zeichen wie im Original ersetzt) und dekodiert sie komplett ueber
 * decodeMapDataFromPartial.
 */
function decodeSavedMap(rawMapB64, version, rotation) {
  if (!rawMapB64 || typeof rawMapB64 !== 'string' || rawMapB64.length < 3) return null;
  let s = rawMapB64.replace(/_/g, '/').replace(/-/g, '+');
  let key = null;
  if (s.includes(',')) {
    const parts = s.split(',');
    key = parts[1];
    s = parts[0];
  }
  if (key) return null; // AES-verschluesselt: bewusst nicht entschluesselt (siehe Datei-Kopf)
  let inflated;
  try {
    inflated = Buffer.from(pako.inflate(Buffer.from(s, 'base64')));
  } catch (e) {
    return null;
  }
  if (!inflated || inflated.length < HEADER_SIZE) return null;
  const partial = buildPartialMapFromInflated(inflated, version);
  const [mapData] = decodeMapDataFromPartial(partial, rotation);
  return mapData;
}

/**
 * map.py: DreameVacuumMapDecoder.decode_map_data_from_partial (Zeilen 4220-5667).
 * @param {{version:number, mapId:number, frameId:number, frameType:number,
 *          timestampMs:number|null, raw:Buffer, dataJson:Object}} partialMap
 * @param {number} [rotation]
 * @returns {[Object|null, Object|null]} [mapData, savedMapData]
 */
function decodeMapDataFromPartial(partialMap, rotation = 0) {
  if (!partialMap) return [null, null];

  const mapData = {
    version: partialMap.version,
    map_id: partialMap.mapId,
    frame_id: partialMap.frameId,
    frame_type: partialMap.frameType,
    timestamp_ms: partialMap.timestampMs,
  };

  const raw = partialMap.raw;
  mapData.robot_position = { x: raw.readInt16LE(5), y: raw.readInt16LE(7), a: raw.readInt16LE(9) };
  mapData.charger_position = { x: raw.readInt16LE(11), y: raw.readInt16LE(13), a: raw.readInt16LE(15) };

  const gridSize = raw.readInt16LE(17);
  const width = raw.readInt16LE(19);
  const height = raw.readInt16LE(21);
  let left = raw.readInt16LE(23);
  let top = raw.readInt16LE(25);

  const imageSize = HEADER_SIZE + width * height;
  const dataJson = partialMap.dataJson || {};

  let savedMapData = null;

  try {
    if (Array.isArray(dataJson.origin) && dataJson.origin.length > 1) {
      left = dataJson.origin[0];
      top = dataJson.origin[1];
    }

    // types.py 4193-4201 (MapImageDimensions): original_top/left = Werte zum Bauzeitpunkt.
    // left/top koennen spaeter fuer die Render-Kopie verschoben werden (device.py 3071-3085);
    // original_* bleibt dabei der unveraenderte Anker.
    mapData.dimensions = { top, left, original_top: top, original_left: left, height, width, grid_size: gridSize, offset: Math.trunc(gridSize / 2) };
    mapData.rotation = rotation;

    let overrides = null;
    let changes = null;
    if (mapData.version === 3 && partialMap.frameType === MapFrameType.P) {
      if ('cover' in dataJson) {
        overrides = dataJson.cover;
        if (overrides && 'timestamp_ms' in overrides) mapData.timestamp_ms = parseInt(overrides.timestamp_ms, 10);
      }
      if ('diff' in dataJson) changes = dataJson.diff;
    }

    if (mapData.frame_type !== MapFrameType.W) {
      if ('mra' in dataJson) mapData.rotation = parseInt(dataJson.mra, 10);
      if ('cs' in dataJson) mapData.cleaned_area = parseInt(dataJson.cs, 10);
      if ('ct' in dataJson) {
        const value = dataJson.ct;
        if (typeof value === 'number' || typeof value === 'string') mapData.cleaning_time = parseInt(value, 10);
      }
      if ('wm' in dataJson) mapData.work_status = parseInt(dataJson.wm, 10);
      if ('cf' in dataJson) mapData.completed = dataJson.cf === 1;
      if ('clean_finish_remain_electricity' in dataJson) {
        mapData.remaining_battery = parseInt(dataJson.clean_finish_remain_electricity, 10);
      }

      mapData.customized_cleaning = dataJson.customeClean ?? null;
      mapData.docked = !!dataJson.oc;
      mapData.line_to_robot = !!dataJson.l2r;
      mapData.frame_map = !!(dataJson.fsm && dataJson.fsm === 1);
      mapData.restored_map = !!(dataJson.rpur && dataJson.rpur === 1);
      mapData.saved_map_status = -1;
      if ('ris' in dataJson) mapData.saved_map_status = dataJson.ris;
      mapData.clean_log = dataJson.iscleanlog === true;
      mapData.recovery_map = dataJson.us === 1;
      mapData.new_map = 'risp' in dataJson && dataJson.risp === 0;

      if ('smd' in dataJson) mapData.startup_method = enumHas(StartupMethod, dataJson.smd) ? dataJson.smd : StartupMethod.OTHER;
      if ('ctyi' in dataJson) mapData.task_end_type = enumHas(TaskEndType, dataJson.ctyi) ? dataJson.ctyi : TaskEndType.OTHER;
      if ('cmc' in dataJson) mapData.cleanup_method = enumHas(CleanupMethod, dataJson.cmc) ? dataJson.cmc : CleanupMethod.OTHER;
      if ('ds' in dataJson) mapData.dust_collection_count = parseInt(dataJson.ds || 0, 10);
      if ('wt' in dataJson) mapData.mop_wash_count = parseInt(dataJson.wt || 0, 10);
      mapData.multiple_cleaning_time = dataJson.multime ?? null;
      mapData.dos = dataJson.dos ?? null;
      mapData.mopping_mode = dataJson.mooClean ?? null;
      mapData.temporary_map = !!(dataJson.suw && (dataJson.suw === 6 || dataJson.suw === 5) && dataJson.fsm == null);
      mapData.saved_map = !!(
        mapData.frame_type === MapFrameType.I &&
        !mapData.restored_map &&
        !mapData.frame_map &&
        mapData.saved_map_status === -1 &&
        !mapData.clean_log
      );

      if ((dataJson.nc && dataJson.nc) || mapData.charger_position.a === 32767) mapData.charger_position = null;
      if ((dataJson.nr && dataJson.nr) || mapData.robot_position.a === 32767) mapData.robot_position = null;

      if (!mapData.saved_map && !mapData.recovery_map) mapData.index = 0;

      const pathStr = (overrides && 'tr' in overrides) ? overrides.tr : dataJson.tr;
      if (pathStr) mapData.path = parseTr(pathStr);

      mapData.small_path = (overrides && 'small_tr' in overrides) ? overrides.small_tr : (dataJson.small_tr ?? null);
      mapData.current_mop_type = (overrides && 'moptype' in overrides) ? overrides.moptype : (dataJson.moptype ?? null);

      if (Array.isArray(dataJson.sa)) mapData.active_segments = dataJson.sa.map((sa) => sa[0]);

      if ('delsr' in dataJson) mapData.hidden_segments = dataJson.delsr;

      if (dataJson.da2 && dataJson.da2.areas) mapData.active_areas = parseAreas(dataJson.da2.areas);

      if (dataJson.sp) mapData.active_points = dataJson.sp.map((pt) => ({ x: pt[0], y: pt[1] }));

      if ('cleanset' in dataJson) {
        mapData.cleanset = typeof dataJson.cleanset === 'string' ? JSON.parse(dataJson.cleanset) : dataJson.cleanset;
        mapData.sequence = true;
      }

      if ('carpetcleanset' in dataJson) {
        mapData.carpet_cleanset = typeof dataJson.carpetcleanset === 'string' ? JSON.parse(dataJson.carpetcleanset) : dataJson.carpetcleanset;
      }

      if ('cleanareaorder' in dataJson) {
        mapData.cleaning_sequence = {};
        for (const item of dataJson.cleanareaorder) {
          for (const [k, v] of Object.entries(item)) { mapData.cleaning_sequence[k] = v; break; }
        }
        const entries = Object.entries(mapData.cleaning_sequence).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
        mapData.cleaning_sequence = Object.fromEntries(entries);
        if (mapData.version === 1) mapData.version = 2;
      }

      if ('room_id_type' in dataJson) {
        mapData.mop_type = {};
        for (const [k, v] of Object.entries(dataJson.room_id_type)) {
          mapData.mop_type[k] = v === 1 ? 'C' : v === 2 ? 'B' : 'A';
        }
      }
    } else {
      mapData.need_optimization = true;
      mapData.wifi_map = true;
    }

    let carpetPixels = [];
    mapData.empty_map = (mapData.frame_type === MapFrameType.I || mapData.frame_type === MapFrameType.W);

    if (width * height > 0) {
      mapData.data = raw.slice(HEADER_SIZE, imageSize);
      mapData.empty_map = (width === 2 && height === 2);
      if (mapData.empty_map) {
        outer:
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (mapData.data[width * y + x] > 0) { mapData.empty_map = false; break outer; }
          }
        }
      }

      mapData.pixel_type = new Uint8Array(width * height);
      if (!mapData.empty_map) {
        const decoded = decodeIFramePixels({
          frameType: mapData.frame_type,
          version: mapData.version,
          frameMap: !!mapData.frame_map,
          savedMap: !!mapData.saved_map,
          savedMapStatus: mapData.saved_map_status,
          recoveryMap: !!mapData.recovery_map,
          data: mapData.data,
          width, height,
        });
        mapData.pixel_type = decoded.pixelType;
        mapData.empty_map = decoded.emptyMap;
        carpetPixels = decoded.carpetPixels;

        if (carpetPixels.length) mapData.carpet_pixels = carpetPixels;

        const segments = getSegments(mapData);
        const segmentInfo = [];

        if (Object.keys(segments).length && dataJson.seg_inf) {
          for (const [k, v] of Object.entries(dataJson.seg_inf)) {
            const segId = parseInt(k, 10);
            // HA-Quirk: Segment.area ist im Original immer 0 (vor calculate_coords berechnet,
            // danach nie neu gesetzt) — der v3-Zweig in setSegmentColorIndex ersetzt sie ohnehin
            // durch die walls_info-Flaeche.
            segmentInfo.push([segId, v.nei_id ?? null, 0]);

            const isUnmapped = !segments[segId];
            if (
              isUnmapped &&
              !mapData.wifi_map &&
              mapData.saved_map_status !== 2 &&
              !(!mapData.saved_map && mapData.version === 3)
            ) {
              continue;
            }

            const targetSeg = isUnmapped ? { id: segId, coords: null, unmapped: false } : segments[segId];

            if (v.nei_id !== undefined && v.nei_id !== null) targetSeg.neighbors = v.nei_id;
            if (v.type !== undefined && v.type !== null) targetSeg.type = parseInt(v.type, 10);
            if (v.index !== undefined && v.index !== null) targetSeg.index = v.index;
            if (v.roomID !== undefined && v.roomID !== null) targetSeg.unique_id = v.roomID;
            if (v.direction !== undefined && v.direction !== null) targetSeg.floor_material_direction = v.direction;

            if (v.material !== undefined && v.material !== null) {
              const material = v.material;
              if (enumHas(DreameVacuumFloorMaterial, material)) targetSeg.floor_material = material;
              else if (material === 3) {
                targetSeg.floor_material = DreameVacuumFloorMaterial.WOOD;
                targetSeg.floor_material_direction = DreameVacuumFloorMaterialDirection.VERTICAL;
              } else if (material === 4) {
                targetSeg.floor_material = DreameVacuumFloorMaterial.WOOD;
                targetSeg.floor_material_direction = DreameVacuumFloorMaterialDirection.HORIZONTAL;
              } else {
                targetSeg.floor_material = DreameVacuumFloorMaterial.NONE;
              }
            }

            if (v[MAP_PARAMETER_NAME]) {
              try { targetSeg.custom_name = Buffer.from(v[MAP_PARAMETER_NAME], 'base64').toString('utf8'); } catch (e) { /* ignore */ }
            }

            targetSeg.visibility = mapData.hidden_segments != null ? !mapData.hidden_segments.includes(segId) : true;

            if (isUnmapped) {
              segments[segId] = targetSeg;
              targetSeg.unmapped = true;
              if (!mapData.unmapped_segments) mapData.unmapped_segments = [];
              mapData.unmapped_segments.push(segId);
            }
          }
        }

        mapData.segments = segments;
      }
    }

    if (mapData.wifi_map) {
      mapData.robot_position = null;
      return [mapData, savedMapData];
    }

    let restoredMap = mapData.restored_map;
    if (mapData.empty_map && mapData.saved_map_status === 2 && !mapData.frame_map) {
      mapData.restored_map = false;
      restoredMap = true;
    }

    if ('rism' in dataJson) {
      savedMapData = decodeSavedMap(dataJson.rism, mapData.version, mapData.rotation);

      if (savedMapData) {
        savedMapData.timestamp_ms = mapData.timestamp_ms;
        mapData.saved_map_id = savedMapData.map_id;
        if (mapData.version < savedMapData.version) mapData.version = savedMapData.version;
        if (savedMapData.temporary_map) mapData.temporary_map = savedMapData.temporary_map;

        if (
          restoredMap ||
          mapData.recovery_map ||
          (mapData.saved_map_status === 2 && (mapData.empty_map || (!mapData.frame_map && mapData.version !== 0)))
        ) {
          mapData.segments = clone(savedMapData.segments);
          mapData.cleaning_sequence = savedMapData.cleaning_sequence;
          mapData.mop_type = savedMapData.mop_type;
          if (savedMapData.floor_material != null) mapData.floor_material = clone(savedMapData.floor_material);
          if (mapData.hidden_segments == null && savedMapData.hidden_segments != null) {
            mapData.hidden_segments = clone(savedMapData.hidden_segments);
          }

          if (mapData.saved_map_status === 2 && !mapData.frame_map) {
            // map.py 4710-4816: kombiniertes Raster aus gespeicherter + aktueller Karte
            const smd = savedMapData.dimensions;
            const mLeft = Math.min(mapData.dimensions.left, smd.left);
            const mTop = Math.min(mapData.dimensions.top, smd.top);
            const mWidth = Math.trunc(
              (Math.max(mapData.dimensions.left + mapData.dimensions.width * mapData.dimensions.grid_size,
                smd.left + smd.width * smd.grid_size) - mLeft) / smd.grid_size
            );
            const mHeight = Math.trunc(
              (Math.max(mapData.dimensions.top + mapData.dimensions.height * mapData.dimensions.grid_size,
                smd.top + smd.height * smd.grid_size) - mTop) / smd.grid_size
            );
            const si = Math.trunc((smd.left - mLeft) / smd.grid_size);
            const sj = Math.trunc((smd.top - mTop) / smd.grid_size);
            const sim = si + smd.width, sjm = sj + smd.height;
            const ni = Math.trunc((mapData.dimensions.left - mLeft) / mapData.dimensions.grid_size);
            const nj = Math.trunc((mapData.dimensions.top - mTop) / mapData.dimensions.grid_size);
            const nim = ni + mapData.dimensions.width, njm = nj + mapData.dimensions.height;
            const combinedPixelType = new Uint8Array(mWidth * mHeight);

            for (let j = 0; j < mHeight; j++) {
              for (let i = 0; i < mWidth; i++) {
                let savedValue = null;
                let segmentId = 0;
                if (j >= sj && i >= si && j < sjm && i < sim) {
                  savedValue = savedMapData.data[(i - si) + ((j - sj) * smd.width)];
                  segmentId = savedValue & 0x3f;
                }
                let cleanValue = 0;
                if (!restoredMap && j >= nj && i >= ni && j < njm && i < nim) {
                  const rawClean = mapData.data[(i - ni) + ((j - nj) * mapData.dimensions.width)];
                  cleanValue = rawClean & 3;
                }
                const idx = j * mWidth + i;
                if (segmentId !== 0 || mapData.empty_map) {
                  if (restoredMap && savedValue !== null) {
                    const isBorder = (savedValue >> 7) === 1;
                    if (isBorder) combinedPixelType[idx] = MapPixelType.WALL;
                    else if (savedValue === 63) combinedPixelType[idx] = MapPixelType.NEW_SEGMENT;
                    else combinedPixelType[idx] = segmentId;
                  } else {
                    combinedPixelType[idx] = cleanValue === 2 ? MapPixelType.WALL : segmentId;
                  }
                } else if (cleanValue !== 0) {
                  if (cleanValue === 1) combinedPixelType[idx] = MapPixelType.FLOOR;
                  else if (cleanValue === 2) combinedPixelType[idx] = MapPixelType.WALL;
                  else if (cleanValue === 3) combinedPixelType[idx] = MapPixelType.NEW_SEGMENT;
                  else combinedPixelType[idx] = cleanValue;
                }
              }
            }

            mapData.combined_pixel_type = combinedPixelType;
            mapData.combined_dimensions = { top: mTop, left: mLeft, original_top: mTop, original_left: mLeft, height: mHeight, width: mWidth, grid_size: smd.grid_size, offset: Math.trunc(smd.grid_size / 2) };
            mapData.empty_map = false;
            // HA: die carpet_pixels-Sammlung in dieser Schleife ist im Original auskommentiert
            // (dead code) — carpet_pixels bleibt daher hier immer leer, nur der restored_map-
            // Fallback unten kann sie setzen.
            if (restoredMap) mapData.carpet_pixels = getCarpets(mapData, savedMapData);
          } else {
            mapData.combined_pixel_type = savedMapData.pixel_type;
            mapData.combined_dimensions = savedMapData.dimensions;
            mapData.carpet_pixels = savedMapData.carpet_pixels;
          }
        } else if (savedMapData.segments != null) {
          if (mapData.segments == null && (mapData.saved_map_status === 1 || mapData.saved_map_status === 0)) {
            mapData.segments = {};
          }
          mapData.cleaning_sequence = savedMapData.cleaning_sequence;
          mapData.mop_type = savedMapData.mop_type;

          for (const [k, v] of Object.entries(savedMapData.segments)) {
            if (mapData.segments && mapData.segments[k]) {
              const seg = mapData.segments[k];
              seg.icon = v.icon; seg.name = v.name; seg.custom_name = v.custom_name;
              seg.type = v.type; seg.index = v.index; seg.unique_id = v.unique_id;
              seg.color_index = v.color_index; seg.neighbors = v.neighbors;
              seg.floor_material = v.floor_material; seg.floor_material_direction = v.floor_material_direction;
              seg.visibility = v.visibility; seg.carpet_cleaning = v.carpet_cleaning; seg.carpet_preferences = v.carpet_preferences;
              if (mapData.saved_map_status === 2) { seg.x = v.x; seg.y = v.y; }
            } else if (mapData.saved_map_status === 2) {
              if (!mapData.segments) mapData.segments = {};
              mapData.segments[k] = clone(v);
              mapData.segments[k].unmapped = true;
              if (!mapData.unmapped_segments) mapData.unmapped_segments = [];
              mapData.unmapped_segments.push(parseInt(k, 10));
            }
          }
        }

        if (!savedMapData.cleanset) savedMapData.cleanset = clone(mapData.cleanset);

        if (
          (mapData.saved_map_status === 2 || mapData.docked) &&
          mapData.charger_position == null &&
          !mapData.saved_map &&
          !mapData.recovery_map &&
          savedMapData.charger_position
        ) {
          mapData.charger_position = savedMapData.charger_position;
        }

        mapData.walls = savedMapData.walls;
        mapData.walls_version = savedMapData.walls_version;
        mapData.doors = savedMapData.doors;

        if (mapData.saved_map_status === 2) {
          mapData.no_go_areas = savedMapData.no_go_areas;
          mapData.no_mopping_areas = savedMapData.no_mopping_areas;
          mapData.virtual_walls = savedMapData.virtual_walls;
          mapData.virtual_thresholds = savedMapData.virtual_thresholds;
          mapData.passable_thresholds = savedMapData.passable_thresholds;
          mapData.impassable_thresholds = savedMapData.impassable_thresholds;
          mapData.ramps = savedMapData.ramps;
          mapData.carpets = savedMapData.carpets;
          mapData.deleted_carpets = savedMapData.deleted_carpets;
          mapData.detected_carpets = savedMapData.detected_carpets;
          mapData.router_position = savedMapData.router_position;
          mapData.curtains = savedMapData.curtains;
          mapData.hidden_segments = savedMapData.hidden_segments;
          mapData.predefined_points = savedMapData.predefined_points;
          mapData.cleaning_sequence = savedMapData.cleaning_sequence;
          if (mapData.cleaning_sequence != null && mapData.version === 1) mapData.version = 2;
          mapData.mop_type = savedMapData.mop_type;
          if (savedMapData.saved_furnitures != null) {
            mapData.furnitures = savedMapData.saved_furnitures;
            mapData.furniture_version = savedMapData.furniture_version;
            savedMapData.furnitures = savedMapData.saved_furnitures;
          }
          if (mapData.version === 0) {
            mapData.segments = clone(savedMapData.segments);
            mapData.charger_position = clone(savedMapData.charger_position);
          }
        }

        if (!mapData.carpet_pixels || !mapData.carpet_pixels.length) {
          mapData.carpet_pixels = getCarpets(mapData, savedMapData);
        }

        // map_data.clean_log -> decode_wifi_map_data: bewusst nicht portiert (History-Karten).
      }
    }

    if ('whmp' in dataJson) {
      const routerPosition = dataJson.whmp;
      if (routerPosition && routerPosition.length > 1) {
        mapData.router_position = { x: routerPosition[0], y: routerPosition[1] };
      }
    }

    const wifiMap = dataJson.whm;
    if ((mapData.version === 3 || mapData.saved_map) && wifiMap && wifiMap.length > 1) {
      const wifiMapData = decodeSavedMap(dataJson.whm, mapData.version, mapData.rotation);
      if (wifiMapData) {
        mapData.wifi_map_data = wifiMapData;
        if (mapData.wifi_map_data.router_position == null) mapData.wifi_map_data.router_position = mapData.router_position;
      }
    }

    if (!mapData.saved_map && mapData.version === 3) mapData.saved_map_id = dataJson.saveMapId ?? null;

    if (!mapData.saved_map && mapData.robot_position == null && mapData.docked && mapData.charger_position) {
      mapData.robot_position = clone(mapData.charger_position);
    }

    const wallsInfo = dataJson.walls_info;
    if (mapData.segments && Object.keys(mapData.segments).length) {
      setStationSegment(mapData);
      if (!mapData.saved_map) setRobotSegment(mapData);
      if (mapData.saved_map || mapData.version === 3) {
        const segmentInfoList = Object.entries(mapData.segments).map(([id, seg]) => [parseInt(id, 10), seg.neighbors ?? null, 0]);
        setSegmentColorIndex(mapData, segmentInfoList, wallsInfo);
      }
    }

    if ('nopush' in dataJson) mapData.notified = !!dataJson.nopush;

    // map.py 4950-4980: funiture_info (gespeicherte Karte) — Reihenfolge der Konstruktor-
    // Argumente: x=f[6], y=f[7], x0=f[6]-f[3]/2, y0=f[7]-f[4]/2, width=f[3], height=f[4],
    // type, edit_type=f[13]||0, angle=f[9], scale=f[12], furniture_id=f[0], segment_id=f[2].
    if (dataJson.funiture_info) {
      mapData.furniture_version = 2;
      mapData.saved_furnitures = {};
      let index = 0;
      for (const f of dataJson.funiture_info) {
        index += 1;
        let furnitureType = parseInt(f[1], 10);
        if (furnitureType === 8) furnitureType = 25;
        else if (furnitureType === 25) furnitureType = 8;

        if (f[3] > 0 && f[4] > 0) {
          if (enumHas(FurnitureType, furnitureType)) {
            mapData.saved_furnitures[index] = {
              x: Math.trunc(f[6]), y: Math.trunc(f[7]),
              x0: Math.trunc(f[6] - f[3] / 2), y0: Math.trunc(f[7] - f[4] / 2),
              width: f[3], height: f[4], type: furnitureType,
              edit_type: (f.length >= 14 && f[13]) ? f[13] : 0,
              angle: f[9], scale: f[12], furniture_id: f[0], segment_id: f[2],
            };
          }
        }
      }
    }

    if (mapData.version === 3) mapData.furnitures = mapData.saved_furnitures;

    if (mapData.furnitures == null) {
      const furnitureKey = (dataJson.ai_furniture_user && dataJson.ai_furniture_user.length) ? 'ai_furniture_user'
        : (dataJson.ai_furniture_new && dataJson.ai_furniture_new.length) ? 'ai_furniture_new' : 'ai_furniture';
      if (dataJson[furnitureKey]) {
        mapData.furniture_version = (furnitureKey === 'ai_furniture_user' || furnitureKey === 'ai_furniture_new') ? 1 : 0;
        mapData.furnitures = {};
        let index = 0;
        for (const f of dataJson[furnitureKey]) {
          const size = f.length;
          if (size >= 4) {
            const furnitureType = parseInt(f[2], 10);
            index += 1;
            if (enumHas(FurnitureType, furnitureType)) {
              const centerX = f[0], centerY = f[1];
              let startX0 = centerX, startY0 = centerY, rectWidth = 0, rectHeight = 0, angle = 0, scale = 1.0;
              if (size >= 8) {
                mapData.furniture_version = 1;
                startX0 = f[4]; startY0 = f[5];
                rectWidth = Math.abs(f[6]); rectHeight = Math.abs(f[7]);
                if (size >= 9) {
                  angle = parseFloat(f[8]);
                  if (furnitureKey === 'ai_furniture') {
                    if (angle === 180) angle = 0; else if (angle === 0) angle = 180;
                  }
                }
                if (size >= 10) scale = parseFloat(f[9]);
              } else {
                mapData.furniture_version = 0;
              }
              mapData.furnitures[index] = {
                x: centerX, y: centerY, x0: startX0, y0: startY0, width: rectWidth, height: rectHeight,
                type: furnitureType, edit_type: f[3], angle, scale,
              };
            }
          }
        }
      }
    }

    // map.py 5045-5134: Hindernisse (ai_obstacle)
    const obstaclesRaw = (changes && 'ai_obstacle' in changes) ? changes.ai_obstacle : dataJson.ai_obstacle;
    if (obstaclesRaw) {
      mapData.obstacles = {};
      let index = 1;
      for (const obstacle of obstaclesRaw) {
        const size = obstacle.length;
        if (size >= 4) {
          let obstacleType = parseInt(obstacle[2], 10);
          const smallObject = size > 17 && String(obstacle[17]) === '1' && ((obstacleType >= 128 && obstacleType <= 138) || obstacleType === 142);
          if (!enumHas(ObstacleType, obstacleType)) {
            if (obstacleType === 160 || obstacleType === 166 || obstacleType === 207 || smallObject) continue;
            obstacleType = ObstacleType.OBSTACLE;
          }

          const possibility = smallObject ? 0 : Math.trunc(parseFloat(obstacle[3]) * 100);
          if (mapData.version === 3 && possibility > 0 && possibility < 50) continue;

          let ignoreStatus;
          if (size > 18) ignoreStatus = parseInt(obstacle[18], 10);
          else {
            const last = String(obstacle[obstacle.length - 1]);
            ignoreStatus = (last.length === 1 && Number(last) >= 0 && Number(last) <= 4) ? parseInt(last, 10) : 0;
          }

          if (
            ignoreStatus === ObstacleIgnoreStatus.HIDDEN ||
            ignoreStatus === ObstacleIgnoreStatus.ERROR ||
            (ignoreStatus === ObstacleIgnoreStatus.AUTOMATICALLY_IGNORED && mapData.version === 3)
          ) {
            continue;
          }

          const id = (size >= 5 && String(obstacle[4]).trim() !== '') ? obstacle[4] : null;
          const x = parseFloat(obstacle[0]);
          const y = parseFloat(obstacle[1]);

          const obj = { x, y, type: obstacleType, possibility, object_id: id, ignore_status: ignoreStatus, segment_id: null, segment: null, color_index: null, reason: null, index };

          if (obstacleType === ObstacleType.BLOCKED_ROOM) {
            obj.segment_id = Math.trunc(x); obj.x = 0; obj.y = 0; obj.possibility = null;
          }

          // Python: str(id).replace(".", "", 1).isdigit() — ersten Punkt entfernen, dann Ziffern-Check
          let idIsDigit = false;
          if (id != null) {
            const idStr = String(id);
            const dot = idStr.indexOf('.');
            const noFirstDot = dot === -1 ? idStr : idStr.slice(0, dot) + idStr.slice(dot + 1);
            idIsDigit = noFirstDot.length > 0 && /^[0-9]+$/.test(noFirstDot);
          }
          if (
            size >= 7 &&
            ((id != null && idIsDigit && parseFloat(id) >= 1000) || obstacleType === ObstacleType.BLOCKED_ROOM)
          ) {
            if (size >= 8) {
              obj.file_name = obstacle[5];
              obj.key = obstacle[6];
              obj.pos_x = String(obstacle[7]).trim() !== '' ? parseFloat(obstacle[7]) * 100 : 0.0;
              obj.pos_y = String(obstacle[8]).trim() !== '' ? parseFloat(obstacle[8]) * 100 : 0.0;
              obj.width = (size >= 10 && String(obstacle[9]).trim() !== '') ? parseFloat(obstacle[9]) * 100 : null;
              obj.height = (size >= 11 && String(obstacle[10]).trim() !== '') ? parseFloat(obstacle[10]) * 100 : null;
              obj.picture_status = (size >= 13 && String(obstacle[11]).trim() !== '') ? parseInt(obstacle[11], 10) : 2;
              obj.index2 = size >= 13 ? obstacle[12] : null;
            } else {
              obj.file_name = obstacle[6];
              obj.key = obstacle[5];
            }
          }

          mapData.obstacles[String(index)] = obj;
          index += 1;
        }
      }
      setObstacleSegment(mapData, mapData.obstacles);
    }

    // map.py 5136-5162: Laser-Hindernisse
    const laserObstacleRaw = (overrides && 'laser_obstacle' in overrides) ? overrides.laser_obstacle : dataJson.laser_obstacle;
    if (laserObstacleRaw) {
      if (!mapData.laser_obstacles) mapData.laser_obstacles = {};
      let index = 1;
      for (const obstacle of laserObstacleRaw) {
        const size = obstacle.length;
        if (size >= 3) {
          let obstacleType = parseInt(obstacle[2], 10);
          if (!enumHas(ObstacleType, obstacleType)) obstacleType = ObstacleType.OBSTACLE;
          mapData.laser_obstacles[String(index)] = {
            x: parseFloat(obstacle[0]), y: parseFloat(obstacle[1]), type: obstacleType,
            possibility: size > 3 ? Math.trunc(parseFloat(obstacle[3]) * 100) : 100,
            object_id: size >= 5 ? obstacle[4] : null, segment_id: null, segment: null, color_index: null,
          };
          index += 1;
        }
      }
      setObstacleSegment(mapData, mapData.laser_obstacles);
    }

    // map.py 5223-5235: vw (nur setzen, falls noch nicht belegt)
    if (dataJson.vw) {
      const vw = dataJson.vw;
      if (!mapData.no_go_areas) mapData.no_go_areas = parseAreas(vw.rect);
      if (!mapData.no_mopping_areas) mapData.no_mopping_areas = parseAreas(vw.mop);
      if (!mapData.virtual_walls) mapData.virtual_walls = parseLines(vw.line);
      if (!mapData.carpets) mapData.carpets = parseCarpets(vw.addcpt);
      if (!mapData.deleted_carpets) mapData.deleted_carpets = parseCarpets(vw.nocpt);
    }

    // map.py 5237-5243: rec_vw (empfohlene Zonen, immer ueberschrieben)
    const recVw = dataJson.rec_vw;
    if (recVw) {
      mapData.recommended_area_type = recVw.type ?? null;
      mapData.recommended_no_go_areas = parseAreas(recVw.rect);
      mapData.recommended_no_mopping_areas = parseAreas(recVw.mop);
      mapData.recommended_virtual_walls = parseLines(recVw.line);
      mapData.recommended_carpets = parseCarpets(recVw.carpet);
    }

    // map.py 5245-5258: vws (Schwellen/Rampen/Abgruende)
    if (dataJson.vws) {
      const vws = dataJson.vws;
      if (!mapData.virtual_thresholds) mapData.virtual_thresholds = parseLines(vws.vwsl);
      if ('npthrsd' in vws) {
        mapData.passable_thresholds = mapData.virtual_thresholds;
        mapData.virtual_thresholds = null;
        if (!mapData.impassable_thresholds) mapData.impassable_thresholds = parseLines(vws.npthrsd);
      }
      if (!mapData.ramps) mapData.ramps = parseAreas(vws.ramp);
      if (!mapData.cliffs) mapData.cliffs = parseLines(vws.cliff);
    }

    // map.py 5260-5269: rec_vws — 1:1 inkl. HA-Eigenheit (nutzt recVw.type statt rec_vws.type,
    // und parseAreas statt parseLines fuer vwsl — beides im Original so vorhanden).
    const recVws = dataJson.rec_vws;
    if (recVws) {
      mapData.recommended_threshold_type = recVw ? recVw.type ?? null : null;
      mapData.recommended_virtual_thresholds = parseAreas(recVws.vwsl);
      if ('npthrsd' in recVws) {
        mapData.recommended_passable_thresholds = mapData.recommended_virtual_thresholds;
        mapData.recommended_virtual_thresholds = null;
        mapData.recommended_impassable_thresholds = parseLines(recVws.npthrsd);
      }
      mapData.recommended_ramps = parseAreas(recVws.ramp);
      mapData.recommended_cliffs = parseLines(recVws.cliff);
    }

    // map.py 5271-5284: Vorhaenge
    const curtains = 'curtain' in dataJson ? dataJson.curtain : dataJson.ct;
    if (curtains && typeof curtains === 'object' && curtains.line && !mapData.curtains) {
      mapData.curtains = curtains.line.map((line) => ({ x0: line[0], y0: line[1], x1: line[2], y1: line[3] }));
    }

    // map.py 5285-5341: erkannte Teppiche (Polygon bevorzugt, sonst carpet_info)
    if (dataJson.carpet_polygon && Object.keys(dataJson.carpet_polygon).length) {
      mapData.detected_carpets = [];
      for (const [carpetId, carpet] of Object.entries(dataJson.carpet_polygon)) {
        if (carpet.length > 0 && carpet[0].length >= 8) {
          const coords = carpet[0];
          const xs = [], ys = [];
          for (let k = 0; k < coords.length; k += 2) { xs.push(coords[k]); ys.push(coords[k + 1]); }
          mapData.detected_carpets.push({
            id: parseInt(carpetId, 10),
            x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.min(...ys),
            x2: Math.max(...xs), y2: Math.max(...ys), x3: Math.min(...xs), y3: Math.max(...ys),
            ellipse: false, carpet_type: carpet.length > 1 ? parseInt(carpet[1], 10) : null,
            ignored_areas: null, segments: null, polygon: coords,
            hidden: !(carpet.length <= 2 || carpet[2] === 0),
          });
        }
      }
    } else if (dataJson.carpet_info) {
      mapData.detected_carpets = [];
      for (const [carpetId, carpet] of Object.entries(dataJson.carpet_info)) {
        mapData.detected_carpets.push({
          id: parseInt(carpetId, 10),
          x0: carpet[0], y0: carpet[1], x1: carpet[2], y1: carpet[1], x2: carpet[2], y2: carpet[3], x3: carpet[0], y3: carpet[3],
          ellipse: carpet.length > 6 ? carpet[6] : null, carpet_type: null,
          ignored_areas: carpet.length > 5 ? carpet[5] : null, segments: carpet[4], polygon: null, hidden: null,
        });
      }
    }

    // map.py 5343-5380: Absenkungen/Randbereiche
    const lowLyingAreaKey = 'sneak_areas_end' in dataJson ? 'sneak_areas_end' : 'sneak_areas';
    const lowLyingAreasRaw = (changes && 'sneak_areas' in changes) ? changes.sneak_areas : dataJson[lowLyingAreaKey];
    if (lowLyingAreasRaw && !mapData.low_lying_areas) {
      mapData.low_lying_areas = [];
      for (const area of lowLyingAreasRaw) {
        const coords = area.roi;
        const xs = [], ys = [];
        for (let k = 0; k < coords.length; k += 2) { xs.push(coords[k]); ys.push(coords[k + 1]); }
        mapData.low_lying_areas.push({
          id: area.id,
          x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.min(...ys),
          x2: Math.max(...xs), y2: Math.max(...ys), x3: Math.min(...xs), y3: Math.max(...ys),
          polygon: coords, type: area.type ?? null, hidden: area.hide ?? null, ms: area.ms ?? null, area: area.area ?? null,
        });
      }
    }

    // map.py 5382-5420: vordefinierte Punkte / aktive Wegpunkte
    if ('pointinfo' in dataJson) {
      const pointsRaw = dataJson.pointinfo;
      let points = {};
      if (Array.isArray(pointsRaw) && pointsRaw.length > 0 && pointsRaw[0]) points = pointsRaw[0];
      else if (pointsRaw && typeof pointsRaw === 'object') points = pointsRaw;

      if (points && Object.keys(points).length) {
        if (!mapData.predefined_points) {
          if (points.spoint) {
            mapData.predefined_points = points.spoint.map((pt) => ({ x: pt[0], y: pt[1], completed: !!pt[2], type: pt[3] }));
          } else {
            mapData.predefined_points = [];
          }
        }
        const targetPoints = points.tpoint ?? points.spoint;
        if (targetPoints && !mapData.active_cruise_points) {
          mapData.active_cruise_points = {};
          let idx = 0;
          for (const pt of targetPoints) {
            idx += 1;
            mapData.active_cruise_points[idx] = { x: pt[0], y: pt[1], completed: !!pt[2], type: pt[3] };
          }
        }
      } else if (!mapData.predefined_points) {
        mapData.predefined_points = [];
      }
    }

    // map.py 5422-5432: Aufgaben-Wegpunkte
    if ('tpointinfo' in dataJson) {
      mapData.task_cruise_points = {};
      let idx = 0;
      for (const pt of dataJson.tpointinfo) {
        idx += 1;
        mapData.task_cruise_points[idx] = { x: pt[0], y: pt[1], completed: !!pt[2], type: pt[3] };
      }
    }

    // map.py 5434-5441: blockierte Raeume
    if ('area_clean_detail' in dataJson && !restoredMap) {
      const values = dataJson.area_clean_detail;
      if (values) {
        mapData.blocked_segments = {};
        for (const v of values) {
          if (enumHas(ObstacleReason, v[1])) mapData.blocked_segments[v[0]] = v.length > 3 ? [v[1], v[2], v[3]] : [v[1]];
        }
      }
    }

    // map.py 5443-5451: Reinigungs-Heatmap ("decmap") — bewusst nicht dekodiert (siehe Datei-Kopf),
    // Rohdaten nur durchreichen, falls vorhanden.
    if ('decmap' in dataJson || mapData.multiple_cleaning_time) {
      mapData.cleaning_map_data_raw = dataJson.decmap ?? null;
    }

    // map.py 5452-5471: BLOCKED_ROOM-Hindernisse mit blocked_segments abgleichen
    if (mapData.obstacles && !restoredMap) {
      const obstaclesCopy = clone(mapData.obstacles);
      for (const [k, v] of Object.entries(obstaclesCopy)) {
        if (v.type === ObstacleType.BLOCKED_ROOM) {
          const blocked = mapData.blocked_segments && mapData.blocked_segments[v.segment_id];
          if (blocked && (blocked.length <= 4 || blocked[4] !== 0)) {
            const obstacle = mapData.obstacles[k];
            obstacle.reason = blocked[0];
            if (blocked.length > 1) { obstacle.x = blocked[1]; obstacle.y = blocked[2]; }
          } else {
            delete mapData.obstacles[k];
          }
        }
      }
    }

    // map.py 5473-5501: fehlende BLOCKED_ROOM-Hindernisse aus blocked_segments nachtragen
    if (mapData.blocked_segments && !mapData.cleaning_map && !restoredMap) {
      for (const [k, v] of Object.entries(mapData.blocked_segments)) {
        if (v.length <= 4 || v[4] !== 0) {
          let found = false;
          if (mapData.obstacles) {
            for (const obstacle of Object.values(mapData.obstacles)) {
              if (obstacle.type === ObstacleType.BLOCKED_ROOM && obstacle.segment_id === parseInt(k, 10)) { found = true; break; }
            }
          }
          if (!found) {
            const obstacle = { x: 0, y: 0, type: ObstacleType.BLOCKED_ROOM, possibility: null, segment_id: parseInt(k, 10), reason: v[0], segment: null, color_index: null };
            if (mapData.segments && mapData.segments[obstacle.segment_id]) {
              const segment = mapData.segments[obstacle.segment_id];
              obstacle.x = segment.x; obstacle.y = segment.y; obstacle.segment = segment.name; obstacle.color_index = segment.color_index;
            }
            if (v.length > 1) { obstacle.x = v[1]; obstacle.y = v[2]; }
            if (!mapData.obstacles) mapData.obstacles = {};
            mapData.obstacles[String(Object.keys(mapData.obstacles).length + 1)] = obstacle;
          }
        }
      }
    }

    // map.py 5503-5511: v3 P-Frame-Diff (geloeschte Objekte)
    if (changes && changes.deleteContent) {
      const del = changes.deleteContent;
      if ('ai_obstacle' in del) mapData.deleted_obstacles = del.ai_obstacle;
      if ('sneak_areas' in del) mapData.deleted_low_lying_areas = del.sneak_areas;
      if ('rec_vw' in del) mapData.deleted_recommended_area_type = del.rec_vw;
    }

    // map.py 5513-5663: Vektor-Waende/Tueren aus walls_info.storeys, sonst aus gespeicherter Karte
    if (!mapData.walls && wallsInfo && 'storeys' in wallsInfo) {
      mapData.walls_version = wallsInfo.version_flag ?? null;
      const storey = wallsInfo.storeys[0];
      const walls = {};
      const roomsData = storey.rooms ?? storey.r ?? [];
      for (const room of roomsData) {
        const segmentId = room.room_id ?? room.i;
        if (!(mapData.segments && mapData.segments[segmentId]) && !(mapData.hidden_segments && mapData.hidden_segments.includes(segmentId))) continue;

        const wallsData = room.walls ?? room.w ?? [];
        walls[segmentId] = [];
        for (const wall of wallsData) {
          let type, x, y, initialX0, initialY0, initialX1, initialY1, x0, y0, x1, y1;
          if (Array.isArray(wall)) {
            [type, initialX0, initialY0, initialX1, initialY1, x, y] = wall;
            if (wall.length > 7) { [, , , , , , , x0, y0, x1, y1] = wall; }
            else { x0 = initialX0; y0 = initialY0; x1 = initialX1; y1 = initialY1; }
          } else {
            type = wall.type; x = wall.normal_x; y = wall.normal_y;
            initialX0 = wall.beg_pt_x; initialY0 = wall.beg_pt_y; initialX1 = wall.end_pt_x; initialY1 = wall.end_pt_y;
            x0 = wall._beg_pt_x ?? initialX0; y0 = wall._beg_pt_y ?? initialY0;
            x1 = wall._end_pt_x ?? initialX1; y1 = wall._end_pt_y ?? initialY1;
          }
          walls[segmentId].push({ x0, y0, x1, y1, initial_x0: initialX0, initial_y0: initialY0, initial_x1: initialX1, initial_y1: initialY1, type, id: null, x, y, status: null });
        }
      }

      const doors = [];
      const doorsData = storey.doors ?? storey.d ?? [];
      for (const door of doorsData) {
        let type, id, status, initialX0, initialY0, initialX1, initialY1, x0, y0, x1, y1;
        if (Array.isArray(door)) {
          [type, id, status, initialX0, initialY0, initialX1, initialY1] = door;
          if (door.length > 7) { [, , , , , , , x0, y0, x1, y1] = door; }
          else { x0 = initialX0; y0 = initialY0; x1 = initialX1; y1 = initialY1; }
        } else {
          type = door.door_type; id = door.door_id; status = door.door_status;
          initialX0 = door.beg_pt_x; initialY0 = door.beg_pt_y; initialX1 = door.end_pt_x; initialY1 = door.end_pt_y;
          x0 = door._beg_pt_x ?? initialX0; y0 = door._beg_pt_y ?? initialY0;
          x1 = door._end_pt_x ?? initialX1; y1 = door._end_pt_y ?? initialY1;
        }
        doors.push({ x0, y0, x1, y1, initial_x0: initialX0, initial_y0: initialY0, initial_x1: initialX1, initial_y1: initialY1, type, id, x: null, y: null, status });
      }

      mapData.walls = walls;
      mapData.doors = doors;
    } else if (savedMapData && savedMapData.walls && mapData.saved_map_status === 2) {
      mapData.walls = savedMapData.walls;
      mapData.walls_version = savedMapData.walls_version;
      mapData.doors = savedMapData.doors;
    } else if (mapData.version === 0 && !mapData.saved_map) {
      mapData.need_optimization = !restoredMap;
    }

    if (mapData.walls && mapData.wifi_map_data) {
      mapData.wifi_map_data.walls = mapData.walls;
      mapData.wifi_map_data.walls_version = mapData.walls_version;
      mapData.wifi_map_data.doors = mapData.doors;
      mapData.wifi_map_data.hidden_segments = mapData.hidden_segments;
    }
  } catch (e) {
    // HA: _LOGGER.error("Map Parse Failed: %s", traceback...) — Fehler wird geloggt, nicht geworfen
  }

  return [mapData, savedMapData];
}

/**
 * map.py: DreameVacuumMapDecoder.decode_p_map_data_from_partial (Zeilen 5670-5898).
 * Wendet einen P-Frame (Teil-Update) auf eine bereits vorhandene mapData an.
 * @param {Object} partialMap wie bei decodeMapDataFromPartial
 * @param {Object} currentMapData bisherige (I-Frame-basierte) Karte
 * @returns {Object} currentMapData (mutiert und zurueckgegeben, wie im Original)
 */
function decodePMapDataFromPartial(partialMap, currentMapData) {
  if (partialMap.frameType !== MapFrameType.P) return currentMapData;

  const pPartial = Object.assign({}, partialMap, { version: currentMapData.version });
  const [mapData] = decodeMapDataFromPartial(pPartial, 0);
  if (!mapData) return currentMapData;

  try {
    currentMapData.frame_id = mapData.frame_id;
    currentMapData.robot_position = mapData.robot_position;
    currentMapData.timestamp_ms = mapData.timestamp_ms;
    currentMapData.docked = mapData.docked;
    currentMapData.line_to_robot = mapData.line_to_robot;
    currentMapData.temporary_map = mapData.temporary_map;
    currentMapData.small_path = mapData.small_path;
    currentMapData.mop_type = mapData.mop_type;
    currentMapData.laser_obstacles = mapData.laser_obstacles;
    currentMapData.saved_map = false;
    currentMapData.empty_map = false;
    currentMapData.restored_map = false;
    currentMapData.recovery_map = false;
    currentMapData.clean_log = false;
    currentMapData.frame_map = true;

    if (mapData.docked != null) currentMapData.docked = mapData.docked;

    if (mapData.charger_position != null && (mapData.version !== 0 || currentMapData.saved_map_status !== 2)) {
      currentMapData.charger_position = mapData.charger_position;
    }

    if (mapData.obstacles != null) {
      if (mapData.version === 3) {
        if (!currentMapData.obstacles) currentMapData.obstacles = {};
        for (const obstacle of Object.values(mapData.obstacles)) {
          const foundKey = Object.entries(currentMapData.obstacles).find(([, item]) => item.index === obstacle.index);
          if (foundKey) currentMapData.obstacles[foundKey[0]] = obstacle;
          else currentMapData.obstacles[String(Object.keys(currentMapData.obstacles).length + 1)] = obstacle;
        }
        if (mapData.deleted_obstacles) {
          const delSet = new Set(mapData.deleted_obstacles.map(String));
          const kept = Object.values(currentMapData.obstacles).filter((x) => !delSet.has(String(x.index)));
          currentMapData.obstacles = {};
          kept.forEach((item, i) => { currentMapData.obstacles[String(i + 1)] = item; });
        }
      } else {
        currentMapData.obstacles = mapData.obstacles;
      }
    }

    if (mapData.detected_carpets != null) currentMapData.detected_carpets = mapData.detected_carpets;
    if (mapData.active_cruise_points != null) currentMapData.active_cruise_points = mapData.active_cruise_points;

    if (mapData.low_lying_areas != null) {
      if (mapData.version === 3) {
        currentMapData.low_lying_areas = currentMapData.low_lying_areas || [];
        for (const area of mapData.low_lying_areas) {
          const idx = currentMapData.low_lying_areas.findIndex((item) => item.id === area.id);
          if (idx !== -1) currentMapData.low_lying_areas[idx] = area;
          else currentMapData.low_lying_areas.push(area);
        }
        if (mapData.deleted_low_lying_areas) {
          const delSet = new Set(mapData.deleted_low_lying_areas.map(String));
          currentMapData.low_lying_areas = currentMapData.low_lying_areas.filter((item) => !delSet.has(String(item.id)));
        }
      } else {
        currentMapData.low_lying_areas = mapData.low_lying_areas;
      }
    }

    if (mapData.carpet_cleanset != null) currentMapData.carpet_cleanset = mapData.carpet_cleanset;

    // map.py 5762-5881: P-Frame liefert nur die Differenz zum vorherigen Frame
    if (mapData.data) {
      const cd = currentMapData.dimensions;
      const nd = mapData.dimensions;
      const gridSize = nd.grid_size;
      const left = Math.min(nd.left, cd.left);
      const top = Math.min(nd.top, cd.top);
      const maxLeft = Math.max(nd.left + nd.width * gridSize, cd.left + cd.width * cd.grid_size);
      const maxTop = Math.max(nd.top + nd.height * gridSize, cd.top + cd.height * cd.grid_size);
      const width = Math.trunc((maxLeft - left) / gridSize);
      const height = Math.trunc((maxTop - top) / gridSize);

      const data = new Uint8Array(width * height);
      const pixelType = new Uint8Array(width * height); // OUTSIDE-Default (0)

      const leftOffset0 = Math.trunc((cd.left - left) / cd.grid_size);
      const topOffset0 = Math.trunc((cd.top - top) / cd.grid_size);
      for (let y = 0; y < cd.height; y++) {
        for (let x = 0; x < cd.width; x++) {
          data[(width * (topOffset0 + y)) + leftOffset0 + x] = currentMapData.data[(cd.width * y) + x];
          pixelType[(width * (topOffset0 + y)) + leftOffset0 + x] = currentMapData.pixel_type[(cd.width * y) + x];
        }
      }

      const leftOffset = Math.trunc((nd.left - left) / gridSize);
      const topOffset = Math.trunc((nd.top - top) / gridSize);
      const carpetSet = new Set((currentMapData.carpet_pixels || []).map((p) => `${p[0]},${p[1]}`));
      let carpetPixelsTouched = false;

      for (let y = 0; y < nd.height; y++) {
        for (let x = 0; x < nd.width; x++) {
          const currentIndex = (nd.width * y) + x;
          const newData = mapData.data[currentIndex];
          if (newData) {
            const newIndex = (width * (topOffset + y)) + leftOffset + x;
            const newValue = mapData.version === 3 ? newData : (data[newIndex] + newData) & 0xff;
            data[newIndex] = newValue;

            const [pt, carpet] = getPixelType(currentMapData, newValue);
            pixelType[newIndex] = pt;

            if (carpet) { carpetPixelsTouched = true; if (!currentMapData.carpet_pixels) currentMapData.carpet_pixels = []; }
            if (currentMapData.carpet_pixels) {
              const key = `${leftOffset + x},${topOffset + y}`;
              if (!carpet && carpetSet.has(key)) {
                carpetSet.delete(key);
                carpetPixelsTouched = true;
              } else if (carpet && !carpetSet.has(key)) {
                carpetSet.add(key);
                carpetPixelsTouched = true;
              }
            }
          }
        }
      }

      if (carpetPixelsTouched && currentMapData.carpet_pixels) {
        currentMapData.carpet_pixels = [...carpetSet].map((s) => s.split(',').map(Number));
      }

      currentMapData.data = data;
      currentMapData.pixel_type = pixelType;
      currentMapData.dimensions = { top, left, original_top: top, original_left: left, height, width, grid_size: gridSize, offset: Math.trunc(gridSize / 2) };
      currentMapData.combined_dimensions = null;
      currentMapData.combined_pixel_type = null;

      const segments = getSegments(currentMapData);
      if (Object.keys(segments).length) {
        for (const k of Object.keys(currentMapData.segments || {})) {
          if (!segments[k]) {
            if (currentMapData.saved_map_status === 2) currentMapData.segments[k].unmapped = true;
            else delete currentMapData.segments[k];
          }
        }
        for (const [k, v] of Object.entries(segments)) {
          if (currentMapData.segments && currentMapData.segments[k]) {
            currentMapData.segments[k].unmapped = false;
            currentMapData.segments[k].coords = v.coords.slice();
            if (currentMapData.saved_map_status !== 2) {
              currentMapData.segments[k].x = v.x;
              currentMapData.segments[k].y = v.y;
            }
            calculateSegmentCoords(currentMapData.segments[k], currentMapData.dimensions);
          }
        }
      } else if (currentMapData.saved_map_status === 2) {
        for (const v of Object.values(currentMapData.segments || {})) v.unmapped = true;
      } else {
        currentMapData.segments = {};
      }

      currentMapData.unmapped_segments = null;
      for (const [k, v] of Object.entries(currentMapData.segments || {})) {
        if (v.unmapped) {
          if (!currentMapData.unmapped_segments) currentMapData.unmapped_segments = [];
          currentMapData.unmapped_segments.push(parseInt(k, 10));
        }
      }

      if (mapData.version === 0) currentMapData.need_optimization = true;
    }

    if (mapData.path && mapData.path.length) {
      if (currentMapData.path && currentMapData.path.length) currentMapData.path = currentMapData.path.concat(mapData.path);
      else currentMapData.path = mapData.path;
    }

    setRobotSegment(currentMapData);
    setStationSegment(currentMapData);
    setObstacleSegment(currentMapData, currentMapData.obstacles);
    setObstacleSegment(currentMapData, currentMapData.laser_obstacles);
  } catch (e) {
    // HA: _LOGGER.error("P Map Parse Failed: %s", traceback...)
  }

  return currentMapData;
}

module.exports = {
  HEADER_SIZE,
  buildPartialMapFromInflated,
  decodeSavedMap,
  decodeMapDataFromPartial,
  decodePMapDataFromPartial,
  parseAreas, parseLines, parseCarpets, parseTr,
};
