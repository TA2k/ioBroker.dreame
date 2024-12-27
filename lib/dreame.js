const decodeMultiMapData = (mapDataStr, angle) => {
  const _cryptoJs = require('crypto-js');
  const _buffer = require('buffer');
  const _pako = require('pako');
  const areaColors = '#FF9CCAFA', // Cleaned area color
    borderColor = '#FFA6BAD0', // Border color
    tmpMapColor = '#FFB8E3FF', // Temporary map color
    tmpBorderColor = '#FFA6BAD0', // Temporary border color
    deletedAreaColor = '#ffe2e2e2', // Deleted area color
    deletedAreaBorder = 'rgba(226, 226, 226, 0.4)', // Deleted area border color
    transparentColor = '#00000000', // Transparent color
    unreachedColor = '#FFE5EAEE', // Unreached area color
    outerBorderColor = '#ffC8CCD4', // Outer border color
    carpetColor = '#4D000000', // Carpet color
    wifiUnreached = '#FFE5EAEE', // Unreached WiFi area
    wifiSignal4 = '#FFD9E2EF', // WiFi signal strength 4
    wifiSignal3 = '#FFCDDAEF', // WiFi signal strength 3
    wifiSignal2 = '#FFA1BDF2', // WiFi signal strength 2
    wifiSignal1 = '#FF81A8F5'; // WiFi signal strength 1
  this.getAesKey = function (value) {
    if (!value) return '';

    const sha256Str = _cryptoJs.default.SHA256(value).toString();

    return sha256Str.substr(0, 32);
  };

  const changeData = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

  if (!mapDataStr) {
    return null;
  }

  module.exports = {
    decodeMultiMapData,
  };

  let aesKey = '';
  let sourceStr = '';

  if (mapDataStr.includes(',')) {
    const splitArr = mapDataStr.split(',');
    sourceStr = splitArr[0];
    sourceStr = sourceStr.replace(/-/g, '+');
    sourceStr = sourceStr.replace(/_/g, '/');
    aesKey = this.getAesKey(splitArr[1]);
  } else {
    mapDataStr = mapDataStr.replace(/-/g, '+');
    mapDataStr = mapDataStr.replace(/_/g, '/');
  }

  let buffer = _buffer.Buffer.alloc(0);

  if (aesKey) {
    const aes_key = _cryptoJs.default.enc.Utf8.parse(aesKey);

    const iv = _cryptoJs.default.enc.Utf8.parse('');

    const decrypted = _cryptoJs.default.AES.decrypt(sourceStr, aes_key, {
      iv: iv,
      mode: _cryptoJs.default.mode.CBC,
      padding: _cryptoJs.default.pad.Pkcs7,
    });

    const base64Data = decrypted.toString(_cryptoJs.default.enc.Base64);

    const decryptedBuffer = _buffer.Buffer.from(base64Data, 'base64');

    buffer = decryptedBuffer;
  } else {
    buffer = _buffer.Buffer.from(mapDataStr, 'base64');
  }

  if (!buffer || buffer.length == 0) {
    return;
  }

  try {
    let _expands8, _expands9, _expands10;

    const unZipArrayBuffer = _pako.default.inflate(buffer);

    const unZipBuffer = _buffer.Buffer.from(unZipArrayBuffer);

    const map_id = unZipBuffer.readInt16LE(0);
    const frame_type = unZipBuffer.readInt8(4);
    const robotPos = {};
    robotPos.x = unZipBuffer.readInt16LE(5);
    robotPos.y = unZipBuffer.readInt16LE(7);
    robotPos.angle = unZipBuffer.readInt16LE(9);
    const chargerPos = {};
    chargerPos.x = unZipBuffer.readInt16LE(11);
    chargerPos.y = unZipBuffer.readInt16LE(13);
    chargerPos.angle = unZipBuffer.readInt16LE(15);
    const gridWidth = unZipBuffer.readInt16LE(17);
    const iwidth = unZipBuffer.readInt16LE(19);
    const iHeight = unZipBuffer.readInt16LE(21);

    let _x = unZipBuffer.readInt16LE(23);

    let _y = unZipBuffer.readInt16LE(25);

    _x = _x - gridWidth / 2;
    _y = _y - gridWidth / 2;
    let expands = undefined;

    if (unZipBuffer.length > 27 + iwidth * iHeight) {
      const expandDatas = _buffer.Buffer.alloc(unZipBuffer.length - 27 - iwidth * iHeight, 0);

      for (let i = 0; i < expandDatas.length; i++) {
        expandDatas[i] = unZipBuffer[i + 27 + iwidth * iHeight];
      }

      try {
        const expandData = new String(expandDatas).toString();
        expands = JSON.parse(expandData);
      } catch (e) {}
    }

    if (frame_type != 73) {
      return null;
    }

    const mapInfo = _buffer.Buffer.alloc(iwidth * iHeight, 0);

    if (unZipBuffer.length < 27 + iwidth * iHeight) {
      console.log('map data is missing');
      return null;
    }

    if (expands && expands.robot && Array.isArray(expands.robot) && expands.robot.length > 1) {
      robotPos.x = expands.robot[0];
      robotPos.y = expands.robot[1];
    }

    if (expands && expands.charger && Array.isArray(expands.charger) && expands.charger.length > 1) {
      chargerPos.x = expands.charger[0];
      chargerPos.y = expands.charger[1];
    }

    if (expands && expands.origin && Array.isArray(expands.origin) && expands.origin.length > 1) {
      _x = expands.origin[0] - gridWidth / 2;
      _y = expands.origin[1] - gridWidth / 2;
    }

    const areaColor = {};
    const areaInfo = {};
    const areaNames = {};
    const seg_inf = expands.seg_inf;
    const areaTypes = {};
    const material = {};
    const areaColorIndex = {};

    if (seg_inf) {
      const seg_inf_tmp = [];

      for (const areaId in seg_inf) {
        const item = seg_inf[areaId];
        item.areaId = areaId;
        seg_inf_tmp.push(item);
      }

      seg_inf_tmp.sort(function (a, b) {
        let alen = 0;
        let blen = 0;

        if (a.nei_id) {
          alen = a.nei_id.length;
        }

        if (b.nei_id) {
          blen = b.nei_id.length;
        }

        if (alen == blen) {
          return a.areaId - b.areaId;
        }

        return blen - alen;
      });

      for (let _i28 = 0; _i28 < seg_inf_tmp.length; _i28++) {
        const _item13 = seg_inf_tmp[_i28];
        const _areaId11 = _item13.areaId;
        const neiIds = _item13['nei_id'];
        const useids = [];

        if (_item13 && _item13 != null && _item13.material) {
          if (
            (_item13 == null ? undefined : _item13.material) == 1 &&
            (_item13 == null ? undefined : _item13.direction) != undefined
          ) {
            if ((_item13 == null ? undefined : _item13.direction) == 90) {
              material[_areaId11] = 3;
            } else if ((_item13 == null ? undefined : _item13.direction) == 0) {
              material[_areaId11] = 4;
            } else {
              material[_areaId11] = 1;
            }
          } else {
            material[_areaId11] = _item13.material;
          }
        }

        if (_item13.type != undefined) {
          areaTypes[_areaId11] = {
            type: _item13.type,
            index: _item13.index ? _item13.index : 0,
          };

          if (_item13.type === 0) {
            if (_item13.name) {
              areaNames[_areaId11] = {
                name: _buffer.Buffer.from(_item13.name, 'base64').toString(),
                type: 0,
              };
            } else {
              areaNames[_areaId11] = {
                name: 'custom',
                type: 0,
              };
            }
          }
        }

        for (const _i29 in neiIds) {
          const nid = neiIds[_i29];

          if (areaColorIndex[nid] != undefined) {
            useids.push(areaColorIndex[nid]);
          }
        }

        const areaColorNum = [];

        for (let _i30 = 0; _i30 < 4; _i30++) {
          areaColorNum.push({
            colorId: _i30,
            num: 0,
          });
        }

        const sortbyage = function sortbyage(a, b) {
          if (a.num != b.num) {
            return a.num - b.num;
          } else {
            return a.colorId - b.colorId;
          }
        };

        for (const _areaId12 in areaColorIndex) {
          const colorIndex = areaColorIndex[_areaId12];
          areaColorNum[colorIndex].num += 1;
        }

        areaColorNum.sort(sortbyage);

        for (let _i31 = 0; _i31 < 4; _i31++) {
          const cid = areaColorNum[_i31].colorId;
          const index = useids.indexOf(cid);

          if (index == -1) {
            areaColorIndex[_areaId11] = cid;
            break;
          }
        }

        if (areaColorIndex[_areaId11] == undefined) {
          areaColorIndex[_areaId11] = 0;
        }
      }

      for (const _areaId13 in areaColorIndex) {
        areaColor[_areaId13] = areaColors[areaColorIndex[_areaId13]];
      }
    }

    areaColor['255'] = borderColor;
    areaColor['254'] = unreachedColor;
    areaColor['0'] = transparentColor;

    for (let j = 0; j < iHeight; j++) {
      for (let _i32 = 0; _i32 < iwidth; _i32++) {
        const _index11 = j * iwidth + _i32;

        const value = unZipBuffer[_index11 + 27];
        mapInfo[_index11] = value;

        const _areaId14 = value & 0x3f;

        if (areaColor[_areaId14] == undefined) {
          let selectIndex = 0;

          if (_areaId14 % 4 == 1) {
            selectIndex = 0;
          } else if (_areaId14 % 4 == 2) {
            selectIndex = 1;
          } else if (_areaId14 % 4 == 3) {
            selectIndex = 2;
          } else if (_areaId14 % 4 == 0) {
            selectIndex = 3;
          }

          areaColor[_areaId14] = areaColors[selectIndex];
          areaColorIndex[_areaId14] = selectIndex;
        }

        if (_areaId14 != 0) {
          if (!areaInfo[_areaId14]) {
            areaInfo[_areaId14] = {
              minX: _i32,
              minY: j,
              maxX: _i32,
              maxY: j,
            };
          } else {
            if (areaInfo[_areaId14].minX > _i32) {
              areaInfo[_areaId14].minX = _i32;
            }

            if (areaInfo[_areaId14].maxX < _i32) {
              areaInfo[_areaId14].maxX = _i32;
            }

            if (areaInfo[_areaId14].minY > j) {
              areaInfo[_areaId14].minY = j;
            }

            if (areaInfo[_areaId14].maxY < j) {
              areaInfo[_areaId14].maxY = j;
            }
          }
        }
      }
    }

    const _loop4 = function _loop4(key) {
      const item = areaInfo[key];
      item.minX = _x + item.minX * gridWidth + gridWidth / 2;
      item.maxX = _x + item.maxX * gridWidth + gridWidth / 2;
      item.minY = _y + item.minY * gridWidth + gridWidth / 2;
      item.maxY = _y + item.maxY * gridWidth + gridWidth / 2;
      const center = {
        x: (item.maxX - item.minX) / 2 + item.minX,
        y: (item.maxY - item.minY) / 2 + item.minY,
      };

      let _i = Math.floor((center.x - _x) / gridWidth);

      const _j = Math.floor((center.y - _y) / gridWidth);

      const cp = [];
      let zeroNum = -1;
      let lastAreaIndex = 0;
      let line = undefined;

      for (let _i33 = 0; _i33 < iwidth; _i33++) {
        const _index12 = _j * iwidth + _i33;

        const _value8 = mapInfo[_index12] & 0x3f;

        if (_value8 == key) {
          lastAreaIndex = _i33;
          zeroNum = 0;

          if (!line) {
            line = {
              start: _i33,
            };
          }
        } else if (_value8 == 0) {
          if (zeroNum >= 0) {
            zeroNum = zeroNum + 1;

            if (zeroNum >= 4) {
              if (line) {
                line.end = lastAreaIndex;
                cp.push(line);
                line = undefined;
              }
            }
          }
        } else {
          if (line) {
            line.end = lastAreaIndex;
            cp.push(line);
            line = undefined;
          }
        }
      }

      if (line) {
        line.end = lastAreaIndex;
        cp.push(line);
        line = undefined;
      }

      if (cp.length > 0) {
        let maxLine = cp[0];

        for (let _i34 = 1; _i34 < cp.length; _i34++) {
          if (cp[_i34].end - cp[_i34].start > maxLine.end - maxLine.start) {
            maxLine = cp[_i34];
          }
        }

        center.x = ((maxLine.end - maxLine.start) * gridWidth) / 2 + gridWidth / 2 + _x + maxLine.start * gridWidth;
        _i = Math.floor((center.x - _x) / gridWidth);
        const vCp = [];
        zeroNum = -1;
        lastAreaIndex = 0;
        line = undefined;

        for (let _j23 = 0; _j23 < iHeight; _j23++) {
          const _index13 = _j23 * iwidth + _i;

          const _value9 = mapInfo[_index13] & 0x3f;

          if (_value9 == key) {
            lastAreaIndex = _j23;
            zeroNum = 0;

            if (!line) {
              line = {
                start: _j23,
              };
            }
          } else if (_value9 == 0) {
            if (zeroNum >= 0) {
              zeroNum = zeroNum + 1;

              if (zeroNum >= 4) {
                if (line) {
                  line.end = lastAreaIndex;
                  vCp.push(line);
                  line = undefined;
                }
              }
            }
          } else {
            if (line) {
              line.end = lastAreaIndex;
              vCp.push(line);
              line = undefined;
            }
          }
        }

        if (line) {
          line.end = lastAreaIndex;
          vCp.push(line);
          line = undefined;
        }

        if (vCp.length > 0) {
          let _maxLine = vCp[0];

          for (let _i35 = 1; _i35 < vCp.length; _i35++) {
            if (vCp[_i35].end - vCp[_i35].start > _maxLine.end - _maxLine.start) {
              _maxLine = vCp[_i35];
            }
          }

          center.y =
            ((_maxLine.end - _maxLine.start) * gridWidth) / 2 + gridWidth / 2 + _y + _maxLine.start * gridWidth;
        }
      }

      item.centerX = center.x;
      item.centerY = center.y;

      if (material[key]) {
        item.material = material[key];
      }

      if (changeData && (changeData == null ? undefined : changeData.length) > 0) {
        changeData.forEach(function (areaData, _index) {
          if (key == (areaData == null ? undefined : areaData.areaId)) {
            item.material = areaData == null ? undefined : areaData.mType;
          }
        });
      }

      if (areaTypes[key]) {
        item.areaType = areaTypes[key];
      }

      if (areaNames[key]) {
        item.areaName = areaNames[key].name;
      }
    };

    for (const key in areaInfo) {
      _loop4(key);
    }

    const carpetMapInfo = [];
    let carpetCoverAreas = [];
    const carpet_info = (_expands8 = expands) == null ? undefined : _expands8.carpet_info;
    const carpet_polygon = (_expands9 = expands) == null ? undefined : _expands9.carpet_polygon;
    const vw = (_expands10 = expands) == null ? undefined : _expands10.vw;
    // this.getCarpetInfo(
    //   mapInfo,
    //   _x,
    //   _y,
    //   gridWidth,
    //   iwidth,
    //   iHeight,
    //   carpetMapInfo,
    //   vw,
    //   carpet_info,
    //   carpet_polygon,
    //   function (value) {
    //     const cleanValue = value & 0x3f;
    //     return cleanValue;
    //   },
    //   function (value) {
    //     return (value & 0x40) == 64;
    //   },
    //   function (value) {
    //     return value >> 7 == 1 || value == 0;
    //   },
    // );

    if (carpetMapInfo.length > 0) {
      if (carpet_polygon) {
        carpetCoverAreas = _CarpetCoverUtils.default.getCarpetPolygonCoverAreas(carpet_polygon);
      } else {
        carpetCoverAreas = _CarpetCoverUtils.default.GetSaveMapCarpetCover(
          _x,
          _y,
          gridWidth,
          iwidth,
          iHeight,
          [].concat(carpetMapInfo),
        );
      }
    }

    if (carpetCoverAreas.length > 0) {
      carpetCoverAreas = this.rotateCoverAreas2View(carpetCoverAreas, angle);
    }

    const rotateCarpetInfo = this.rotateCarpetInfo(iwidth * 2, iHeight * 2, carpetMapInfo, angle);
    this.multiMap = {
      map_id: map_id,
      x: _x,
      y: _y,
      mapInfo: mapInfo,
      width: iwidth,
      height: iHeight,
      gridWidth: gridWidth,
      areaColor: areaColor,
      areaColorIndex: areaColorIndex,
      areaInfo: areaInfo,
      areaNames: areaNames,
      areaType: areaTypes,
      chargerPos: chargerPos,
      carpetInfo: rotateCarpetInfo,
      carpetColor: carpetColor,
      carpetCoverAreas: carpetCoverAreas,
    };

    if (expands && expands.seg_inf) {
      this.multiMap.seg_inf = expands.seg_inf;
    }

    if (expands && expands.vw) {
      this.multiMap.vw = expands.vw;
    } else {
      this.multiMap.vw = undefined;
    }

    if (expands && expands.vws) {
      this.multiMap.vws = expands.vws;
    } else {
      this.multiMap.vws = undefined;
    }

    if (expands && expands.ct) {
      this.multiMap.ct = expands.ct;
    } else {
      this.multiMap.ct = undefined;
    }

    if (expands && expands.pointinfo) {
      this.multiMap.pointinfo = expands.pointinfo;
    } else {
      this.multiMap.pointinfo = undefined;
    }

    if (expands && expands.whm) {
      this.multiMap.whm = expands.whm;
    } else {
      this.multiMap.whm = undefined;
    }

    if (expands && expands.whmp) {
      this.multiMap.whmp = expands.whmp;
    } else {
      this.multiMap.whmp = undefined;
    }

    if (expands && expands.delsr) {
      this.multiMap.delsr = expands.delsr;
    } else {
      this.multiMap.delsr = undefined;
    }

    if (expands && expands.cleanareaorder) {
      this.multiMap.cleanareaorder = expands.cleanareaorder;
      this.multiMap.orderMap = this.cleanOrderToMap(expands.cleanareaorder, true, expands.delsr);
    } else {
      this.multiMap.cleanareaorder = undefined;
    }

    if (expands && expands.sneak_areas) {
      this.multiMap.sneak_areas = expands.sneak_areas;
    } else {
      this.multiMap.sneak_areas = undefined;
    }

    if (expands && expands.funiture_info) {
      const furniture = [];

      for (
        var _iterator27 = _createForOfIteratorHelperLoose(expands.funiture_info), _step27;
        !(_step27 = _iterator27()).done;

      ) {
        const _item14 = _step27.value;
        const rFurniture = _item14;

        if (_item14.length > 0) {
          let x = rFurniture[6],
            y = rFurniture[7],
            type = _item14[1];

          if (type < 1 || (_Const.default.showAllFurniture ? type > 25 : type > 13)) {
            continue;
          }

          const pos = this.rotateMapPos(rFurniture[6], rFurniture[7], angle);
          (x = pos.x), (y = pos.y);
          const rectW = Math.abs(rFurniture[3]);
          const rectH = Math.abs(rFurniture[4]);
          const nFurniture = (0, _extends2.default)({
            x: x,
            y: y,
            type: type,
            furnitureId: rFurniture[0],
            roomId: rFurniture[2],
            width: rectW,
            height: rectH,
            rotateAngle: rFurniture[9],
            scale: rFurniture[12],
            editType: rFurniture[13] || 0,
            version: 1,
          });
          furniture.push(nFurniture);
        }
      }

      this.multiMap.furniture = furniture;
    }

    if (expands.walls_info) {
      this.multiMap.walls_info = this.handleWallsInfoData(expands.walls_info, material);
    }

    return this.getMultiMap(angle);
  } catch (e) {
    console.log('------decodeMultiMap', e);
    return null;
  }
};
module.exports = decodeMultiMapData;
