/* eslint-disable */
const decodeMultiMapData = (mapDataStr, angle) => {
  const _cryptoJs = require('crypto-js');
  const _buffer = require('buffer');
  const _pako = require('pako');
  _pako.default = _pako;
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

  const _Const = { default: { showAllFurniture: false } };
  const _this = this;
  this.rotateMapVW2View = function (ovw, angle) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return ovw;
    }

    var vw = {};

    for (var key in ovw) {
      var vws = ovw[key];
      var nVws = [];

      for (var i in vws) {
        var item = vws[i];

        if (item.length >= 4) {
          var newItem = (0, _toConsumableArray2.default)(item);

          if (key == 'addcpt' && item.length > 5 && item[5] == 1) {
            var newCenter = _this.rotateMapPos(item[0], item[1], angle);

            newItem[0] = newCenter.x;
            newItem[1] = newCenter.y;

            if (angle == 90 || angle == 270) {
              newItem[2] = item[3];
              newItem[3] = item[2];
            }
          } else {
            var p1 = _this.rotateMapPos(item[0], item[1], angle);

            var p2 = _this.rotateMapPos(item[2], item[3], angle);

            var x1 = p1.x;
            var x2 = p2.x;
            var y1 = p1.y;
            var y2 = p2.y;

            if (key != 'line' && key != 'cliff') {
              if (x1 > x2) {
                var tmp = x1;
                x1 = x2;
                x2 = tmp;
              }

              if (y1 > y2) {
                var _tmp16 = y1;
                y1 = y2;
                y2 = _tmp16;
              }
            }

            newItem[0] = x1;
            newItem[1] = y1;
            newItem[2] = x2;
            newItem[3] = y2;
          }

          nVws.push(newItem);
        }
      }

      vw[key] = nVws;
    }

    return vw;
  };

  this.rotateMapVWS2View = function (ovws, angle) {
    var vw = {};

    for (var key in ovws) {
      var vws = ovws[key];
      var nVws = [];

      for (var i in vws) {
        var item = vws[i];

        if (item.length >= 4) {
          var p1 = _this.rotateMapPos(item[0], item[1], angle);

          var p2 = _this.rotateMapPos(item[2], item[3], angle);

          var x1 = p1.x;
          var x2 = p2.x;
          var y1 = p1.y;
          var y2 = p2.y;

          if (key != 'vwsl' && key != 'npthrsd' && key != 'pthrsd' && key != 'line' && key != 'cliff') {
            if (x1 > x2) {
              var tmp = x1;
              x1 = x2;
              x2 = tmp;
            }

            if (y1 > y2) {
              var _tmp17 = y1;
              y1 = y2;
              y2 = _tmp17;
            }
          }

          // var newItem = (0, _toConsumableArray2.default)(item);
          // newItem[0] = x1;
          // newItem[1] = y1;
          // newItem[2] = x2;
          // newItem[3] = y2;
          // nVws.push(newItem);
        }
      }

      vw[key] = nVws;
    }

    return vw;
  };
  this.rotateMapInfo = function (x, y, width, height, mapInfo, saveMapInfo, angle, gridWidth) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return {
        x: x,
        y: y,
        mapInfo: mapInfo,
        width: width,
        height: height,
        saveMapInfo: saveMapInfo,
      };
    }

    var nWidth = width;
    var nHeight = height;

    if ((angle / 90) % 2 != 0) {
      nWidth = height;
      nHeight = width;
    }

    var nMapInfo = [];
    var nSaveMapInfo = undefined;

    if (saveMapInfo) {
      nSaveMapInfo = [];
    }

    var ox = x;
    var oy = y;

    switch (angle) {
      case 90:
        for (var i = 0; i < nWidth; i++) {
          for (var j = 0; j < nHeight; j++) {
            var nIndex = j * nWidth + i;
            var oIndex = width * (height - i - 1) + j;
            nMapInfo[nIndex] = mapInfo[oIndex];

            if (saveMapInfo) {
              nSaveMapInfo[nIndex] = saveMapInfo[oIndex];
            }
          }
        }

        ox = x;
        oy = y + gridWidth * height;
        break;

      case 180:
        for (var _i17 = 0; _i17 < nWidth; _i17++) {
          for (var _j13 = 0; _j13 < nHeight; _j13++) {
            var _nIndex2 = _j13 * nWidth + _i17;

            var _oIndex = width * (height - _j13 - 1) + (width - _i17 - 1);

            nMapInfo[_nIndex2] = mapInfo[_oIndex];

            if (saveMapInfo) {
              nSaveMapInfo[_nIndex2] = saveMapInfo[_oIndex];
            }
          }
        }

        ox = x + gridWidth * width;
        oy = y + gridWidth * height;
        break;

      case 270:
        for (var _i18 = 0; _i18 < nWidth; _i18++) {
          for (var _j14 = 0; _j14 < nHeight; _j14++) {
            var _nIndex3 = _j14 * nWidth + _i18;

            var _oIndex2 = width * _i18 + (width - _j14 - 1);

            nMapInfo[_nIndex3] = mapInfo[_oIndex2];

            if (saveMapInfo) {
              nSaveMapInfo[_nIndex3] = saveMapInfo[_oIndex2];
            }
          }
        }

        ox = x + gridWidth * width;
        oy = y;
        break;

      default:
        return {
          x: x,
          y: y,
          mapInfo: mapInfo,
          width: width,
          height: height,
          saveMapInfo: saveMapInfo,
        };
    }

    var vPos = this.rotateMapPos(ox, oy, angle);
    return {
      x: vPos.x,
      y: vPos.y,
      width: nWidth,
      height: nHeight,
      mapInfo: nMapInfo,
      saveMapInfo: nSaveMapInfo,
    };
  };

  this.rotateCarpetInfo = function (width, height, carpetInfo, angle) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270 || carpetInfo.length <= 0) {
      return carpetInfo;
    }

    var nWidth = width;
    var nHeight = height;

    if ((angle / 90) % 2 != 0) {
      nWidth = height;
      nHeight = width;
    }

    var nMapInfo = [];

    switch (angle) {
      case 90:
        for (var i = 0; i < nWidth; i++) {
          for (var j = 0; j < nHeight; j++) {
            var nIndex = j * nWidth + i;
            var oIndex = width * (height - i - 1) + j;
            nMapInfo[nIndex] = carpetInfo[oIndex];
          }
        }

        break;

      case 180:
        for (var _i19 = 0; _i19 < nWidth; _i19++) {
          for (var _j15 = 0; _j15 < nHeight; _j15++) {
            var _nIndex4 = _j15 * nWidth + _i19;

            var _oIndex3 = width * (height - _j15 - 1) + (width - _i19 - 1);

            nMapInfo[_nIndex4] = carpetInfo[_oIndex3];
          }
        }

        break;

      case 270:
        for (var _i20 = 0; _i20 < nWidth; _i20++) {
          for (var _j16 = 0; _j16 < nHeight; _j16++) {
            var _nIndex5 = _j16 * nWidth + _i20;

            var _oIndex4 = width * _i20 + (width - _j16 - 1);

            nMapInfo[_nIndex5] = carpetInfo[_oIndex4];
          }
        }

        break;

      default:
        return carpetInfo;
    }

    return nMapInfo;
  };

  this.rotateMapPosWithAngle = function (pos, angle) {
    if (angle == undefined) {
      angle = 0;
    }

    if (pos == undefined) {
      return;
    }

    var ox = pos.x;
    var oy = pos.y;
    var oAngle = pos.angle;

    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return {
        x: ox,
        y: oy,
        angle: oAngle,
      };
    }

    var sa = Math.sin((-angle / 180) * Math.PI);
    var ca = Math.cos((-angle / 180) * Math.PI);
    var nx = Math.round(ox * ca + oy * sa);
    var ny = Math.round(-ox * sa + oy * ca);
    return {
      x: nx,
      y: ny,
      angle: oAngle + angle,
    };
  };

  this.rotateMapPos = function (ox, oy, angle) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return {
        x: ox,
        y: oy,
      };
    }

    var sa = Math.sin((-angle / 180) * Math.PI);
    var ca = Math.cos((-angle / 180) * Math.PI);
    var nx = Math.round(ox * ca + oy * sa);
    var ny = Math.round(-ox * sa + oy * ca);
    return {
      x: nx,
      y: ny,
    };
  };

  this.rotateViewPos = function (nx, ny, angle) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return {
        x: nx,
        y: ny,
      };
    }

    var _sa = Math.sin((angle / 180) * Math.PI);

    var _ca = Math.cos((angle / 180) * Math.PI);

    var ox = Math.round(nx * _ca + ny * _sa);
    var oy = Math.round(-nx * _sa + ny * _ca);
    return {
      x: ox,
      y: oy,
    };
  };
  this.rotateFloor = function (floorDir) {
    var angle = _this.mapData && _this.mapData.rotateAngle ? _this.mapData.rotateAngle : 0;

    if (angle == undefined) {
      angle = 0;
    }

    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return floorDir;
    }

    var dir = (floorDir + angle) % 180;
    return dir;
  };

  this.buildFloorMap = function (areaInfo, width, height, mapInfo, floorMapInfo) {
    var floorMultiple = 2;

    for (var j = 0; j < height; j++) {
      for (var i = 0; i < width; i++) {
        for (var nj = floorMultiple * j; nj < floorMultiple * j + floorMultiple; nj++) {
          for (var ni = floorMultiple * i; ni < floorMultiple * i + floorMultiple; ni++) {
            floorMapInfo[nj * width * floorMultiple + ni] = 0;
          }
        }
      }
    }

    var floorTileAreas = [];
    var transverseFloorAreas = [];
    var longitudinalFloorAreas = [];
    var areas = Object.keys(areaInfo);

    for (var _i10 = 0; _i10 < areas.length; _i10++) {
      var areaId = areas[_i10];
      var item = areaInfo[areaId];

      if (item && item.material == 2) {
        floorTileAreas.push(parseInt(areaId));
      } else if (item && (item.material == 1 || item.material == 3 || item.material == 4)) {
        var areaItem = areaInfo[areaId];

        if (!areaItem) {
          continue;
        }

        if (item.material == 3) {
          longitudinalFloorAreas.push(parseInt(areaId));
        } else if (item.material == 4) {
          transverseFloorAreas.push(parseInt(areaId));
        } else {
          var areaW = areaItem.maxX - areaItem.minX;
          var areaH = areaItem.maxY - areaItem.minY;

          if (areaW > areaH) {
            transverseFloorAreas.push(parseInt(areaId));
          } else {
            longitudinalFloorAreas.push(parseInt(areaId));
          }
        }
      }
    }

    var floorTileSize = 12;
    var wn = Math.floor(width / floorTileSize);
    var hn = Math.floor(height / floorTileSize);

    if (floorTileAreas.length > 0) {
      for (var _i11 = 1; _i11 <= wn; _i11++) {
        for (var _j7 = 0; _j7 < height; _j7++) {
          var iw = _i11 * floorTileSize;
          var ih = _j7;
          var index = ih * width + iw;

          if (index < mapInfo.length && mapInfo[index] > 0) {
            var _areaId3 = mapInfo[index];

            if (floorTileAreas.indexOf(_areaId3) >= 0) {
              floorMapInfo[width * 2 * ih * 2 + 2 * iw + 1] = 2;
              floorMapInfo[width * 2 * ih * 2 + 2 * iw + width * 2 + 1] = 2;
            }
          }
        }
      }

      for (var _i12 = 0; _i12 < width; _i12++) {
        for (var _j8 = 1; _j8 <= hn; _j8++) {
          var _iw = _i12;

          var _ih = _j8 * floorTileSize;

          var _index3 = _ih * width + _iw;

          if (_index3 < mapInfo.length && mapInfo[_index3] > 0) {
            var _areaId4 = mapInfo[_index3];

            if (floorTileAreas.indexOf(_areaId4) >= 0) {
              floorMapInfo[width * 2 * _ih * 2 + 2 * _iw + width * 2] = 2;
              floorMapInfo[width * 2 * _ih * 2 + 2 * _iw + width * 2 + 1] = 2;
            }
          }
        }
      }
    }

    var floorWidth = 4;
    var floorHeight = 16;

    if (transverseFloorAreas.length > 0) {
      wn = Math.floor((2 * width) / floorHeight);
      hn = Math.floor(height / floorWidth);

      for (var _i13 = 1; _i13 <= wn; _i13++) {
        for (var _j9 = 1; _j9 < height; _j9++) {
          var _iw2 = (_i13 * floorHeight) / 2;

          var _ih2 = _j9;

          if (
            (Math.floor((_j9 - 1) / floorWidth) % 2 == 1 && _i13 % 2 == 1) ||
            (Math.floor((_j9 - 1) / floorWidth) % 2 == 0 && _i13 % 2 == 0)
          ) {
            var _index4 = _ih2 * width + _iw2;

            if (_index4 < mapInfo.length && mapInfo[_index4] > 0) {
              var _areaId5 = mapInfo[_index4];

              if (transverseFloorAreas.indexOf(_areaId5) >= 0) {
                floorMapInfo[width * 2 * _ih2 * 2 + 2 * _iw2 + 1] = 2;
                floorMapInfo[width * 2 * _ih2 * 2 + 2 * _iw2 + width * 2 + 1] = 2;
              }
            }
          }
        }
      }

      for (var _i14 = 0; _i14 < width; _i14++) {
        for (var _j10 = 1; _j10 <= hn; _j10++) {
          var _iw3 = _i14;

          var _ih3 = _j10 * floorWidth;

          var _index5 = _ih3 * width + _iw3;

          if (_index5 < mapInfo.length && mapInfo[_index5] > 0) {
            var _areaId6 = mapInfo[_index5];

            if (transverseFloorAreas.indexOf(_areaId6) >= 0) {
              floorMapInfo[width * 2 * _ih3 * 2 + 2 * _iw3 + width * 2] = 2;
              floorMapInfo[width * 2 * _ih3 * 2 + 2 * _iw3 + width * 2 + 1] = 2;
            }
          }
        }
      }
    }

    if (longitudinalFloorAreas.length > 0) {
      wn = Math.floor(width / floorWidth);
      hn = Math.floor((2 * height) / floorHeight);

      for (var _i15 = 1; _i15 <= wn; _i15++) {
        for (var _j11 = 0; _j11 < height; _j11++) {
          var _iw4 = _i15 * floorWidth;

          var _ih4 = _j11;

          var _index6 = _ih4 * width + _iw4;

          if (_index6 < mapInfo.length && mapInfo[_index6] > 0) {
            var _areaId7 = mapInfo[_index6];

            if (longitudinalFloorAreas.indexOf(_areaId7) >= 0) {
              floorMapInfo[width * 2 * _ih4 * 2 + 2 * _iw4 + 1] = 2;
              floorMapInfo[width * 2 * _ih4 * 2 + 2 * _iw4 + width * 2 + 1] = 2;
            }
          }
        }
      }

      for (var _i16 = 1; _i16 < width; _i16++) {
        for (var _j12 = 1; _j12 <= hn; _j12++) {
          var _iw5 = _i16;

          var _ih5 = (_j12 * floorHeight) / 2;

          if (
            (Math.floor((_i16 - 1) / floorWidth) % 2 == 1 && _j12 % 2 == 1) ||
            (Math.floor((_i16 - 1) / floorWidth) % 2 == 0 && _j12 % 2 == 0)
          ) {
            var _index7 = _ih5 * width + _iw5;

            if (_index7 < mapInfo.length && mapInfo[_index7] > 0) {
              var _areaId8 = mapInfo[_index7];

              if (longitudinalFloorAreas.indexOf(_areaId8) >= 0) {
                floorMapInfo[width * 2 * _ih5 * 2 + 2 * _iw5 + width * 2] = 2;
                floorMapInfo[width * 2 * _ih5 * 2 + 2 * _iw5 + width * 2 + 1] = 2;
              }
            }
          }
        }
      }
    }
  };
  this.handleWallsInfoData = function (walls_info, material) {
    if (walls_info.fixVersion && walls_info.fixVersion == 1) {
      if (walls_info.storeys && walls_info.storeys.length > 0 && walls_info.storeys[0].r) {
        var rooms = [];
        var doors = [];
        walls_info.storeys[0].r.forEach(function (room) {
          var _room = {
            room_id: room.i,
            floor_type: room.f,
          };
          var _walls = [];
          room.w.forEach(function (wall) {
            if (wall.length > 7) {
              _walls.push({
                type: wall[0],
                beg_pt_x: wall[1],
                beg_pt_y: wall[2],
                end_pt_x: wall[3],
                end_pt_y: wall[4],
                normal_x: wall[5],
                normal_y: wall[6],
                _beg_pt_x: wall[7],
                _beg_pt_y: wall[8],
                _end_pt_x: wall[9],
                _end_pt_y: wall[10],
              });
            } else {
              _walls.push({
                type: wall[0],
                beg_pt_x: wall[1],
                beg_pt_y: wall[2],
                end_pt_x: wall[3],
                end_pt_y: wall[4],
                normal_x: wall[5],
                normal_y: wall[6],
              });
            }
          });
          _room.walls = _walls;
          rooms.push(_room);
        });
        walls_info.storeys[0].d.forEach(function (door) {
          if (door.length > 7) {
            doors.push({
              door_type: door[0],
              door_id: door[1],
              door_status: door[2],
              beg_pt_x: door[3],
              beg_pt_y: door[4],
              end_pt_x: door[5],
              end_pt_y: door[6],
              _beg_pt_x: door[7],
              _beg_pt_y: door[8],
              _end_pt_x: door[9],
              _end_pt_y: door[10],
            });
          } else {
            doors.push({
              door_type: door[0],
              door_id: door[1],
              door_status: door[2],
              beg_pt_x: door[3],
              beg_pt_y: door[4],
              end_pt_x: door[5],
              end_pt_y: door[6],
            });
          }
        });
        walls_info.storeys[0] = {
          rooms: rooms,
          doors: doors,
        };
        delete walls_info.fixVersion;
      }
    }

    if (walls_info.storeys && walls_info.storeys.length > 0) {
      walls_info.storeys[0].rooms.map(function (item) {
        if (material[item.room_id]) {
          item.floor_type = material[item.room_id];
        } else {
          item.floor_type = 0;
        }
      });
    }

    return walls_info;
  };
  this.rotateMapPos = function (ox, oy, angle) {
    if (angle % 90 != 0 || angle <= 0 || angle > 270) {
      return {
        x: ox,
        y: oy,
      };
    }

    var sa = Math.sin((-angle / 180) * Math.PI);
    var ca = Math.cos((-angle / 180) * Math.PI);
    var nx = Math.round(ox * ca + oy * sa);
    var ny = Math.round(-ox * sa + oy * ca);
    return {
      x: nx,
      y: ny,
    };
  };

  this.getAesKey = function (value) {
    if (!value) return '';

    const sha256Str = _cryptoJs.default.SHA256(value).toString();

    return sha256Str.substr(0, 32);
  };

  const _createForOfIteratorHelperLoose = function (o, allowArrayLike) {
    var it = (typeof Symbol !== 'undefined' && o[Symbol.iterator]) || o['@@iterator'];
    if (it) return (it = it.call(o)).next.bind(it);
    if (
      Array.isArray(o) ||
      (it = _unsupportedIterableToArray(o)) ||
      (allowArrayLike && o && typeof o.length === 'number')
    ) {
      if (it) o = it;
      var i = 0;
      return function () {
        if (i >= o.length) return { done: true };
        return { done: false, value: o[i++] };
      };
    }
    throw new TypeError(
      'Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.',
    );
  };

  this.cleanOrderToMap = function (cleanareaorder, ignoreDelsr, delsr) {
    if (!cleanareaorder) {
      return {};
    }

    var orderMap = {};
    var tmp = [];
    cleanareaorder == null
      ? undefined
      : cleanareaorder.map(function (item) {
          Object.keys(item).map(function (areaId) {
            var deleted = ignoreDelsr && (delsr == null ? undefined : delsr.includes(Number(areaId)));

            if (!deleted) {
              tmp.push({
                areaId: areaId,
                order: item[areaId],
              });
            }
          });
        });
    tmp.sort(function (a, b) {
      return a.order - b.order;
    });
    tmp.map(function (item, index) {
      orderMap[item.areaId] = index + 1;
    });
    return orderMap;
  };

  this.rotateViewSneak2Map = function (commitData) {
    var rotateAngle = _this.mapData && _this.mapData.rotateAngle ? _this.mapData.rotateAngle : 0;
    commitData.map(function (item) {
      if (item.length > 0 && item.length % 2 == 0) {
        for (var i = 0; i < item.length / 2; i++) {
          var x = item[i * 2];
          var y = item[i * 2 + 1];

          var newPos = _this.rotateViewPos(x, y, rotateAngle);

          item[i * 2] = newPos.x;
          item[i * 2 + 1] = newPos.y;
        }
      }
    });
    return commitData;
  };

  this.rotateMapSneakAreas = function (sneak_areas) {
    var rotateAngle = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var newData = JSON.parse(JSON.stringify(sneak_areas));

    if (newData) {
      newData == null
        ? undefined
        : newData.map(function (sneakArea) {
            for (var i = 0; i < sneakArea.roi.length / 2; i++) {
              var x = sneakArea.roi[i * 2];
              var y = sneakArea.roi[i * 2 + 1];

              var newPos = _this.rotateMapPosWithAngle(
                {
                  x: x,
                  y: y,
                },
                rotateAngle,
              );

              sneakArea.roi[i * 2] = newPos.x;
              sneakArea.roi[i * 2 + 1] = newPos.y;
            }
          });
    }

    return newData;
  };

  this.transformSneakArea = function (sneak_areas) {
    if (sneak_areas) {
      sneak_areas == null
        ? undefined
        : sneak_areas.map(function (sneakArea) {
            var _sneakArea$roi;

            (_sneakArea$roi = sneakArea.roi) == null
              ? undefined
              : _sneakArea$roi.map(function (item, index) {
                  if (index % 2 == 0) {
                    if (sneakArea.minX == undefined) {
                      sneakArea.minX = item;
                    } else {
                      sneakArea.minX = Math.min(sneakArea.minX, item);
                    }

                    if (sneakArea.maxX == undefined) {
                      sneakArea.maxX = item;
                    } else {
                      sneakArea.maxX = Math.max(sneakArea.maxX, item);
                    }
                  } else {
                    if (sneakArea.minY == undefined) {
                      sneakArea.minY = item;
                    } else {
                      sneakArea.minY = Math.min(sneakArea.minY, item);
                    }

                    if (sneakArea.maxY == undefined) {
                      sneakArea.maxY = item;
                    } else {
                      sneakArea.maxY = Math.max(sneakArea.maxY, item);
                    }
                  }
                });
          });
    }

    return sneak_areas;
  };

  this.transformWallsInfo = function (wallsInfo, delsr) {
    var _wallsInfo$storeys;

    if (!wallsInfo || ((_wallsInfo$storeys = wallsInfo.storeys) == null ? undefined : _wallsInfo$storeys.length) <= 0) {
      return;
    }

    var roomInfo = wallsInfo.storeys[0];
    var walls = [];
    var rooms = [];

    for (var i = 0; i < roomInfo.rooms.length; i++) {
      var room = roomInfo.rooms[i];
      var roomItem = {
        areaId: room.room_id,
      };

      if (delsr && delsr.length > 0 && delsr.indexOf(room.room_id) > -1) {
        continue;
      }

      var roomPoints = [];

      for (var j in room.walls) {
        var wall = room.walls[j];

        if (wall._beg_pt_x === undefined) {
          wall._beg_pt_x = wall.beg_pt_x;
          wall._end_pt_x = wall.end_pt_x;
          wall._beg_pt_y = wall.beg_pt_y;
          wall._end_pt_y = wall.end_pt_y;
        }

        _this.addPoint(roomPoints, {
          x: wall._beg_pt_x,
          y: wall._beg_pt_y,
        });

        _this.addPoint(roomPoints, {
          x: wall._end_pt_x,
          y: wall._end_pt_y,
        });

        _this.addToWalls(walls, wall);
      }

      roomItem = (0, _extends2.default)(roomItem, {
        roomPoints: roomPoints,
      });
      rooms.push(roomItem);
    }

    for (var _i9 = 0; _i9 < roomInfo.doors.length; _i9++) {
      var door = roomInfo.doors[_i9];

      if (door._beg_pt_x === undefined) {
        door._beg_pt_x = door.beg_pt_x;
        door._end_pt_x = door.end_pt_x;
        door._beg_pt_y = door.beg_pt_y;
        door._end_pt_y = door.end_pt_y;
      }

      door.isVertical = door._beg_pt_x === door._end_pt_x;
      door.min = {
        x: Math.min(door._beg_pt_x, door._end_pt_x),
        y: Math.min(door._beg_pt_y, door._end_pt_y),
      };
      door.max = {
        x: Math.max(door._beg_pt_x, door._end_pt_x),
        y: Math.max(door._beg_pt_y, door._end_pt_y),
      };

      for (var _j6 = 0; _j6 < walls.length; _j6++) {
        var _wall = walls[_j6];

        if (door.isVertical === _wall.isVertical) {
          if (door.isVertical) {
            if (door.min.x === _wall.min.x && _wall.min.y <= door.min.y && _wall.max.y >= door.max.y) {
              _wall.door = door;
            }
          } else {
            if (door.min.y === _wall.min.y && _wall.min.x <= door.min.x && _wall.max.x >= door.max.x) {
              _wall.door = door;
            }
          }
        }
      }
    }

    return {
      walls: walls,
      rooms: rooms,
    };
  };

  this.rotateFloorPlan = function (floorPlan, angel) {
    var _floorPlan$rooms, _floorPlan$walls;

    if (!floorPlan) {
      return;
    }

    (_floorPlan$rooms = floorPlan.rooms) == null
      ? undefined
      : _floorPlan$rooms.map(function (room) {
          room.roomPoints.map(function (point) {
            var ratatePoint = _this.rotateMapPos(point.x, point.y, angel);

            point.x = ratatePoint.x;
            point.y = ratatePoint.y;
          });
        });
    (_floorPlan$walls = floorPlan.walls) == null
      ? undefined
      : _floorPlan$walls.map(function (wall) {
          wall.min = _this.rotateMapPos(wall.min.x, wall.min.y, angel);
          wall.max = _this.rotateMapPos(wall.max.x, wall.max.y, angel);

          if (wall.door) {
            wall.door.min = _this.rotateMapPos(wall.door.min.x, wall.door.min.y, angel);
            wall.door.max = _this.rotateMapPos(wall.door.max.x, wall.door.max.y, angel);
          }
        });
    return floorPlan;
  };

  this.getMultiMap = function (angle) {
    var _this$multiMap3;

    if (!_this.multiMap) {
      return _this.saveMap;
    }

    var multiMap = {};

    for (var key in _this.multiMap) {
      if (key != 'mapInfo') {
        multiMap[key] = _this.multiMap[key];
      }
    }

    var mapInfo = [];

    for (var i = 0; i < _this.multiMap.mapInfo.length; i++) {
      var _this$multiMap;

      var value = _this.multiMap.mapInfo[i];
      var areaId = value & 0x3f;
      var border = value >> 7;

      if ((_this$multiMap = _this.multiMap) != null && _this$multiMap.delsr && _this.multiMap.delsr.includes(areaId)) {
        var _this$multiMap2;

        if (
          (_this$multiMap2 = _this.multiMap) != null &&
          _this$multiMap2.areaColor &&
          _this.multiMap.areaColor[areaId.toString()]
        ) {
          _this.multiMap.areaColor[areaId.toString()] = deletedAreaColor;
        }

        if (border == 1) {
          mapInfo.push(255 + areaId);
        } else {
          mapInfo.push(areaId);
        }

        _this.multiMap.areaColor['' + (255 + areaId)] = deletedAreaBorder;
      } else {
        if (border == 1) {
          mapInfo.push(255);
        } else {
          mapInfo.push(areaId);
        }
      }
    }

    var rotateAngle = angle;

    if (rotateAngle == undefined) {
      rotateAngle = 0;
    }

    var width = _this.multiMap.width;
    var height = _this.multiMap.height;
    var areaInfo = _this.multiMap.areaInfo;
    var floorMulitMapInfo = [];

    if (areaInfo) {
      _this.buildFloorMap(areaInfo, width, height, mapInfo, floorMulitMapInfo);
    }

    var rotateMapInfo = _this.rotateMapInfo(
      _this.multiMap.x,
      _this.multiMap.y,
      width,
      height,
      mapInfo,
      undefined,
      rotateAngle,
      _this.multiMap.gridWidth,
    );

    var rotateFloorInfo = _this.rotateCarpetInfo(width * 2, height * 2, floorMulitMapInfo, rotateAngle);

    multiMap.x = rotateMapInfo.x;
    multiMap.y = rotateMapInfo.y;
    multiMap.width = rotateMapInfo.width;
    multiMap.height = rotateMapInfo.height;

    if (areaInfo) {
      var nAreaInfo = {};

      for (var _key in areaInfo) {
        var item = JSON.parse(JSON.stringify(areaInfo[_key]));

        var nPos = _this.rotateMapPos(item.centerX, item.centerY, rotateAngle);

        var nMin = _this.rotateMapPos(item.minX, item.minY, rotateAngle);

        var nMax = _this.rotateMapPos(item.maxX, item.maxY, rotateAngle);

        var x1 = nMin.x;
        var x2 = nMax.x;
        var y1 = nMin.y;
        var y2 = nMax.y;

        if (x1 > x2) {
          var tmp = x1;
          x1 = x2;
          x2 = tmp;
        }

        if (y1 > y2) {
          var _tmp = y1;
          y1 = y2;
          y2 = _tmp;
        }

        item.centerX = nPos.x;
        item.centerY = nPos.y;
        item.minX = x1;
        item.minY = y1;
        item.maxX = x2;
        item.maxY = y2;
        nAreaInfo[_key] = item;
      }

      areaInfo = nAreaInfo;
    }

    multiMap.areaInfo = areaInfo;
    multiMap.chargerPos = _this.rotateMapPosWithAngle(_this.multiMap.chargerPos, rotateAngle);
    multiMap.mapInfo = rotateMapInfo.mapInfo;
    multiMap.floorMapInfo = rotateFloorInfo;
    multiMap.carpetColor = carpetColor;
    multiMap.angle = angle;

    if (_this.multiMap.vw) {
      multiMap.vw = _this.rotateMapVW2View(_this.multiMap.vw, rotateAngle);
    }

    if (_this.multiMap.vws) {
      multiMap.vws = _this.rotateMapVWS2View(_this.multiMap.vws, rotateAngle);
    }

    if (_this.multiMap.ct) {
      multiMap.ct = _this.rotateMapVWS2View(_this.multiMap.ct, rotateAngle);
    }

    if (_Const.default.supportShowFloorPlan && _this.multiMap.walls_info) {
      multiMap.floorPlan = _this.transformWallsInfo(_this.multiMap.walls_info);
      multiMap.floorPlan = _this.rotateFloorPlan(multiMap.floorPlan, rotateAngle);
    }

    var sneak_areas = (_this$multiMap3 = _this.multiMap) == null ? undefined : _this$multiMap3.sneak_areas;

    if (sneak_areas) {
      sneak_areas = sneak_areas.filter(function (item) {
        return item.hide != 1 && item.hide != 2;
      });

      var rotateSneakAreas = _this.rotateMapSneakAreas(sneak_areas, rotateAngle);

      multiMap.sneak_areas = _this.transformSneakArea(rotateSneakAreas);
    }

    return multiMap;
  };
  const changeData = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

  if (!mapDataStr) {
    return null;
  }

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

    const rotateCarpetInfo = carpetMapInfo; //this.rotateCarpetInfo(iwidth * 2, iHeight * 2, carpetMapInfo, angle);
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
          const nFurniture = JSON.parse(
            JSON.stringify({
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
            }),
          );
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

module.exports = {
  decodeMultiMapData,
};
