'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.3
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;
const axiosRetry = require('axios-retry').default;
const Json2iob = require('json2iob');
const crypto = require('crypto');
const mqtt = require('mqtt');
const zlib = require('node:zlib');
//check if canvas is available because is optional dependency
let createCanvas;
let ImageData;
try {
  ({ createCanvas, ImageData } = require('canvas'));
} catch (e) {
  console.log('Canvas not available. No Map will be available');
}

const { decodeMultiMapData } = require('./lib/dreame');
const DreameLevel = Object.freeze({
  0: 'Silent',
  1: 'Basic',
  2: 'Strong',
  3: 'Full Speed',
});
const DreameCleaningMode = Object.freeze({
  0: 'Sweeping',
  1: 'Mopping',
  2: 'Sweeping and Mopping',
});
let Waterstr = '';
for (let i = 1; i < 6; i++) {
  Waterstr = Waterstr + i + ':Low ' + i + ',';
}
for (let i = 6; i < 17; i++) {
  Waterstr = Waterstr + i + ':Middle ' + i + ',';
}
for (let i = 17; i < 28; i++) {
  Waterstr = Waterstr + i + ':Height ' + i + ',';
}
for (let i = 28; i < 33; i++) {
  Waterstr = Waterstr + i + ':Ultra ' + i + ',';
}
const DreameWaterVolume = Object.fromEntries(
  Waterstr.replace(/,.$/, '')
    .split(',')
    .map((i) => i.split(':')),
);
const DreameRepeat = Object.freeze({
  1: '1',
  2: '2',
  3: '3',
});
const DreameRoute = Object.freeze({
  1: 'Standart',
  2: 'Intensive',
  3: 'Deep',
  546: 'Intelligent',
});
const DreameRoomClean = Object.freeze({
  0: 'No',
  1: 'Yes',
});

// HA-kompatible Property Namen (aus Home Assistant dreame-vacuum types.py)
const PROPERTY_NAME_MAP = Object.freeze({
  // SIID 2 - Vacuum (Robot Cleaner)
  '2-1': 'state',
  '2-2': 'error',
  // SIID 3 - Battery
  '3-1': 'battery_level',
  '3-2': 'charging_status',
  // SIID 4 - Vacuum Extend (Hauptservice)
  '4-1': 'status',
  '4-2': 'cleaning_time',
  '4-3': 'cleaned_area',
  '4-4': 'suction_level',
  '4-5': 'water_volume',
  '4-6': 'water_tank',
  '4-7': 'task_status',
  '4-8': 'cleaning_start_time',
  '4-9': 'clean_log_file_name',
  '4-10': 'cleaning_properties',
  '4-11': 'resume_cleaning',
  '4-12': 'carpet_boost',
  '4-13': 'clean_log_status',
  '4-14': 'serial_number',
  '4-15': 'remote_control',
  '4-16': 'mop_cleaning_remainder',
  '4-17': 'cleaning_paused',
  '4-18': 'faults',
  '4-19': 'nation_matched',
  '4-20': 'relocation_status',
  '4-21': 'obstacle_avoidance',
  '4-22': 'ai_detection',
  '4-23': 'cleaning_mode',
  '4-24': 'upload_map',
  '4-25': 'self_wash_base_status',
  '4-26': 'customized_cleaning',
  '4-27': 'child_lock',
  '4-28': 'carpet_sensitivity',
  '4-29': 'tight_mopping',
  '4-30': 'cleaning_cancel',
  '4-31': 'y_clean',
  '4-32': 'water_electrolysis',
  '4-33': 'carpet_recognition',
  '4-34': 'self_clean',
  '4-35': 'warn_status',
  '4-36': 'carpet_avoidance',
  '4-37': 'auto_add_detergent',
  '4-38': 'capability',
  '4-39': 'save_water_tips',
  '4-40': 'drying_time',
  '4-41': 'no_water_warning',
  '4-45': 'auto_mount_mop',
  '4-46': 'mop_wash_level',
  '4-47': 'scheduled_clean',
  '4-48': 'quick_command',
  '4-49': 'intelligent_recognition',
  '4-50': 'auto_switch_settings',
  '4-51': 'auto_water_refilling',
  '4-52': 'mop_in_station',
  '4-53': 'mop_pad_installed',
  // SIID 5 - DND
  '5-1': 'dnd',
  '5-2': 'dnd_start',
  '5-3': 'dnd_end',
  '5-4': 'dnd_task',
  // SIID 6 - Map
  '6-1': 'map_data',
  '6-2': 'frame_info',
  '6-3': 'object_name',
  '6-4': 'map_extend_data',
  '6-5': 'robot_time',
  '6-6': 'result_code',
  '6-7': 'multi_floor_map',
  '6-8': 'map_list',
  '6-9': 'recovery_map_list',
  '6-10': 'map_recovery',
  '6-11': 'map_recovery_status',
  '6-13': 'old_map_data',
  '6-14': 'backup_map_status',
  '6-15': 'wifi_map',
  // SIID 7 - Audio
  '7-1': 'volume',
  '7-2': 'voice_packet_id',
  '7-3': 'voice_change_status',
  '7-4': 'voice_change',
  // SIID 8 - Time
  '8-1': 'timezone',
  '8-2': 'schedule',
  '8-3': 'schedule_id',
  '8-4': 'schedule_cancel_reason',
  '8-5': 'cruise_schedule',
  // SIID 9 - Main Brush
  '9-1': 'main_brush_time_left',
  '9-2': 'main_brush_left',
  // SIID 10 - Side Brush
  '10-1': 'side_brush_time_left',
  '10-2': 'side_brush_left',
  // SIID 11 - Filter
  '11-1': 'filter_left',
  '11-2': 'filter_time_left',
  // SIID 12 - Clean Logs / Statistics
  '12-1': 'first_cleaning_date',
  '12-2': 'total_cleaning_time',
  '12-3': 'cleaning_count',
  '12-4': 'total_cleaned_area',
  // SIID 13 - Map Saving
  '13-1': 'map_saving',
  // SIID 15 - Collect Dust / Auto Empty
  '15-1': 'auto_dust_collecting',
  '15-2': 'auto_empty_frequency',
  '15-3': 'dust_collection',
  '15-5': 'auto_empty_status',
  // SIID 16 - Sensor
  '16-1': 'sensor_dirty_left',
  '16-2': 'sensor_dirty_time_left',
  // SIID 17 - Secondary Filter
  '17-1': 'secondary_filter_left',
  '17-2': 'secondary_filter_time_left',
  // SIID 18 - Mop
  '18-1': 'mop_pad_left',
  '18-2': 'mop_pad_time_left',
  // SIID 19 - Silver Ion
  '19-1': 'silver_ion_time_left',
  '19-2': 'silver_ion_left',
  // SIID 20 - Detergent
  '20-1': 'detergent_left',
  '20-2': 'detergent_time_left',
  // SIID 10001 - Camera/Stream
  '10001-1': 'stream_status',
  '10001-2': 'stream_audio',
  '10001-4': 'stream_record',
  '10001-5': 'take_photo',
  '10001-6': 'stream_keep_alive',
  '10001-7': 'stream_fault',
  '10001-9': 'camera_brightness',
  '10001-10': 'camera_light',
  '10001-99': 'stream_property',
  '10001-101': 'stream_cruise_point',
  '10001-103': 'stream_task',
  '10001-1003': 'stream_upload',
  '10001-1100': 'stream_code',
  '10001-1101': 'stream_set_code',
  '10001-1102': 'stream_verify_code',
  '10001-1103': 'stream_reset_code',
  '10001-2003': 'stream_space',
});

let UpdateCleanset = true;
let CheckRCObject = false;
let CheckSCObject = false;
let CheckUObject = true;
class Dreame extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: 'dreame',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));

    this.deviceArray = [];
    this.states = {};
    this.json2iob = new Json2iob(this);
    this.requestClient = axios.create({
      withCredentials: true,
      timeout: 3 * 60 * 1000, //3min client timeout
    });
    axiosRetry(this.requestClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      onRetry: (retryCount, error) => {
        this.log.debug(`Retry ${retryCount}: ${error.message}`);
      },
      onMaxRetryTimesExceeded: (error) => {
        this.log.error(`Request failed after 3 retries: ${error.message}`);
      },
    });
    this.remoteCommands = {};
    this.specStatusDict = {};
    this.specPropsToIdDict = {};
    this.specActiosnToIdDict = {};
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.setState('info.connection', false, true);
    if (this.config.interval < 0.5) {
      this.log.info('Set interval to minimum 0.5');
      this.config.interval = 0.5;
    }
    if (this.config.interval > 2147483647) {
      this.log.info('Set interval to maximum 2147483647');
      this.config.interval = 2147483647;
    }
    if (!this.config.username || !this.config.password) {
      this.log.error('Please set username and password in the instance settings');
      return;
    }
    if (!createCanvas) {
      this.log.warn('Canvas not available. Map will not be available');
    }
    this.updateInterval = null;
    this.reLoginTimeout = null;
    this.refreshTokenTimeout = null;
    this.session = {};
    this.firstStart = true;
    this.subscribeStates('*.remote.*');
    this.subscribeStates('*.cleanset.*');
    this.log.info('Login to Dreame Cloud...');
    await this.login();
    if (this.session.access_token) {
      await this.getDeviceList();

      await this.fetchSpecs();
      await this.createRemotes();
      await this.updateDevicesViaSpec();
      await this.connectMqtt();
      this.updateInterval = setInterval(
        async () => {
          await this.updateDevicesViaSpec();
        },
        this.config.interval * 60 * 1000,
      );
      this.refreshTokenInterval = setInterval(
        async () => {
          await this.refreshToken();
        },
        (this.session.expires_in - 100 || 3500) * 1000,
      );
    }
  }

  async login() {
    await this.requestClient({
      method: 'post',
      url: 'https://eu.iot.dreame.tech:13267/dreame-auth/oauth/token',
      headers: {
        'user-agent': 'Dart/3.2 (dart:io)',
        'dreame-meta': 'cv=i_829',
        'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
        'tenant-id': '000000',
        host: 'eu.iot.dreame.tech:13267',
        authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
        'content-type': 'application/x-www-form-urlencoded',
        'dreame-auth': 'bearer',
      },
      data: {
        grant_type: 'password',
        scope: 'all',
        platform: 'IOS',
        type: 'account',
        username: this.config.username,
        password: crypto
          .createHash('md5')
          .update(this.config.password + 'RAylYC%fmSKp7%Tq')
          .digest('hex'),
        country: 'DE',
        lang: 'de',
      },
    })
      .then((response) => {
        this.log.debug('Login response: ' + JSON.stringify(response.data));
        this.session = response.data;
        this.setState('info.connection', true, true);
      })
      .catch((error) => {
        this.log.error('Login error: ' + error);
        error.response && this.log.error('Login error response: ' + JSON.stringify(error.response.data));
        this.setState('info.connection', false, true);
      });
  }
  async getDeviceList() {
    await this.requestClient({
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://eu.iot.dreame.tech:13267/dreame-user-iot/iotuserbind/device/listV2',
      headers: {
        'user-agent': 'Dart/3.2 (dart:io)',
        'dreame-meta': 'cv=i_829',
        'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
        'tenant-id': '000000',
        host: 'eu.iot.dreame.tech:13267',
        authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
        'content-type': 'application/json',
        'dreame-auth': 'bearer ' + this.session.access_token,
      },
      data: {
        sharedStatus: 1,
        current: 1,
        size: 100,
        lang: 'de',
        timestamp: Date.now(),
      },
    })
      .then(async (response) => {
        /*
        example response:
        {
    "code": 0,
    "success": true,
    "data": {
        "page": {
            "records": [
                {
                    "id": "xxx",
                    "did": "xxxx",
                    "model": "dreame.vacuum.r2449k",
                    "ver": "4.3.9_1252",
                    "customName": "",
                    "property": "{\"iotId\":\"xxxxxxxx\",\"lwt\":1,\"mac\":\"\"}",
                    "mac": "7",
                    "vendor": "ali",
                    "master": true,
                    "masterUid": "",
                    "masterUid2UUID": null,
                    "masterName": null,
                    "permissions": "",
                    "bindDomain": "10000.mt.eu.iot.dreame.tech:19973",
                    "sharedTimes": 0,
                    "sharedStatus": 1,
                    "calltag": null,
                    "updateTime": "2024-06-07 12:03:09",
                    "lang": null,
                    "deviceInfo": {
                        "productId": "10279",
                        "categoryPath": "/lifeapps/vacuum",
                        "model": "dreame.vacuum.r2449k",
                        "remark": "",
                        "feature": "video_ali,fastCommand",
                        "videoDynamicVendor": true,
                        "defaultVendors": [
                            "ali"
                        ],
                        "scType": "WIFI",
                        "extendScType": [
                            "QR_CODE"
                        ],
                        "status": "Live",
                        "mainImage": {
                            "as": "1",
                            "caption": "1",
                            "height": 0,
                            "width": 0,
                            "imageUrl": "https://oss.iot.dreame.tech/pub/pic/000000/ali_dreame/dreame.vacuum.r2449k/9acf24adb5ca3d15341fd869f2aa985f20240311084500.png",
                            "smallImageUrl": ""
                        },
                        "popup": {
                            "as": "1",
                            "caption": "1",
                            "height": 0,
                            "width": 0,
                            "imageUrl": "https://oss.iot.dreame.tech/pub/pic/000000/ali_dreame/dreame.vacuum.r2449k/9acf24adb5ca3d15341fd869f2aa985f20240311084500.png",
                            "smallImageUrl": ""
                        },
                        "icon": {
                            "as": "1",
                            "caption": "1",
                            "height": 0,
                            "width": 0,
                            "imageUrl": "https://oss.iot.dreame.tech/pub/pic/000000/ali_dreame/dreame.vacuum.r2449k/9acf24adb5ca3d15341fd869f2aa985f20240311084500.png",
                            "smallImageUrl": ""
                        },
                        "overlook": {
                            "as": "1",
                            "caption": "1",
                            "height": 0,
                            "width": 0,
                            "imageUrl": "https://oss.iot.dreame.tech/pub/pic/000000/ali_dreame/dreame.vacuum.r2449k/9acf24adb5ca3d15341fd869f2aa985f20240311084500.png",
                            "smallImageUrl": ""
                        },
                        "images": [],
                        "extensionId": "1228",
                        "updatedAt": "1711721850712",
                        "createdAt": "1705565151025",
                        "releaseAt": "1710848634605",
                        "quickConnectStatus": -1,
                        "quickConnects": {},
                        "permit": "video",
                        "firmwareDevelopType": "SINGLE_PLATFORM",
                        "bindType": "",
                        "displayName": "X40 Ultra Complete",
                        "liveKeyDefine": {},
                        "qaKeyDefine": {}
                    },
                    "online": true,
                    "latestStatus": 21,
                    "battery": 100,
                    "videoStatus": "{\"operType\":\"end\",\"operation\":\"monitor\",\"result\":0,\"status\":0}",
                    "region": null,
                    "featureCode": -1,
                    "featureCode2": 31,
                    "keyDefine": {
                        "ver": 1,
                        "url": "https://cnbj2.fds.api.xiaomi.com/000000-public/file/54587b0364cdd763deba93a974ef5aa05cbe7dcc_dreame.vacuum.r2449k_iotKeyValue_translate_1.json"
                    }
                }
            ],
            "total": "1",
            "size": "100",
            "current": "1",
            "orders": [],
            "optimizeCountSql": true,
            "hitCount": false,
            "searchCount": true,
            "pages": "1"
        }
    },
    "msg": "操作成功"
}
        */
        this.log.debug('Device list response: ' + JSON.stringify(response.data));

        if (
          response.data.code == '0' &&
          response.data &&
          response.data.data &&
          response.data.data.page &&
          response.data.data.page.records
        ) {
          this.deviceArray = response.data.data.page.records;
          for (const device of this.deviceArray) {
            await this.extendObject(device.did, {
              type: 'device',
              common: {
                name: device.customName || device.deviceInfo.displayName || device.model,
              },
              native: {},
            });
            this.extendObject(device.did + '.map', {
              type: 'channel',
              common: {
                name: 'Map and map related controls',
              },
              native: {},
            });
            if (device.keyDefine) {
              const iotKeyValue = await this.requestClient({
                method: 'get',
                url: device.keyDefine.url,
              })
                .then((response) => {
                  this.log.debug('iotKeyValue response: ' + JSON.stringify(response.data));
                  return response.data;
                })
                .catch((error) => {
                  this.log.error('iotKeyValue error: ' + error);
                  error.response &&
                    this.log.error('iotKeyValue error response: ' + JSON.stringify(error.response.data));
                });
              /*{
            "keyDefine": {
              "2.1": {
                "de": {
                  "1": "Reinigung"}},
            "ver": 1,
            "model": "dreame.vacuum.r2449k",
            "hash": "54587b0364cdd763deba93a974ef5aa05cbe7dcc"
          }*/

              if (iotKeyValue && iotKeyValue.keyDefine) {
                //replace dot in id with - and select en language

                for (const key in iotKeyValue.keyDefine) {
                  if (Object.hasOwnProperty.call(iotKeyValue.keyDefine, key)) {
                    const element = iotKeyValue.keyDefine[key];
                    if (element['en'] && element['en'] !== 'null') {
                      this.log.debug('Device: ' + JSON.stringify(device));
                      this.log.debug(`Set ${device.did}.${key.replace(/\./g, '-')} to ${element['en']}`);
                      if (!this.states[device.did]) {
                        this.states[device.did] = {};
                      }
                      this.states[device.did][key.replace(/\./g, '-')] = element['en'];
                    }
                  }
                }
              }
            }
            this.json2iob.parse(device.did + '.general', device, {
              states: { latestStatus: this.states[device.did] },
              channelName: 'General Updated at Start',
            });
            await this.getMap(device, true);
          }
        } else {
          this.log.error('No Devices found: ' + JSON.stringify(response.data));
        }
      })
      .catch((error) => {
        this.log.error('Device list error: ' + error);
        error.response && this.log.error('Device list error response: ' + JSON.stringify(error.response.data));
        this.log.error(error.stack);
      });
  }

  async fetchSpecs() {
    this.log.info('Fetching Specs');
    const allDevices = await this.requestClient({
      url: 'https://miot-spec.org/miot-spec-v2/instances?status=all',
    }).catch((error) => {
      this.log.error('failing to get all devices');
      this.log.error(error);
      error.response && this.log.error(JSON.stringify(error.response.data));
    });

    const specs = [];
    for (const device of this.deviceArray) {
      const type = allDevices.data.instances
        .filter((obj) => {
          return obj.model === device.model && obj.status === 'released';
        })
        .map((obj) => {
          return obj.type;
        });
      if (type.length === 0) {
        this.log.info(`No spec found for ${device.model} set to default spec type`);
        type[0] = 'urn:miot-spec-v2:device:vacuum:0000A006:dreame-r2320:1';
      }
      device.spec_type = type[0];
      specs.push(type[0]);
    }
    await this.requestClient({
      method: 'post',
      url: 'https://miot-spec.org/miot-spec-v2/instance',
      data: {
        urns: specs,
      },
    })
      .then(async (res) => {
        this.specs = res.data;
      })
      .catch((error) => {
        this.log.error(error);
        error.response && this.log.error(JSON.stringify(error.response.data));
      });
  }
  async createRemotes() {
    for (const device of this.deviceArray) {
      if (this.specs[device.spec_type]) {
        this.log.debug(JSON.stringify(this.specs[device.spec_type]));
        await this.extractRemotesFromSpec(device);
      }
      const remoteArray = this.remoteCommands[device.model] || [];
      for (const remote of remoteArray) {
        await this.extendObject(device.did + '.remotePlugins', {
          type: 'channel',
          common: {
            name: 'Remote Controls extracted from Plugin definition',
            desc: 'Not so reliable alternative remotes',
          },
          native: {},
        });
        await this.extendObject(device.did + '.remotePlugins.customCommand', {
          type: 'state',
          common: {
            name: 'Send Custom command via Plugin',
            type: 'mixed',
            role: 'state',
            def: 'set_level_favorite,16',
            write: true,
            read: true,
          },
          native: {},
        });
        let name = remote;
        let params = '';
        if (typeof remote === 'object') {
          name = remote.type;
          params = remote.params;
        }
        try {
          await this.extendObject(device.did + '.remotePlugins.' + name, {
            type: 'state',
            common: {
              name: name + ' ' + params || '',
              type: 'mixed',
              role: 'state',
              def: false,
              write: true,
              read: true,
            },
            native: {},
          });
        } catch (error) {
          this.log.error(error);
        }
      }
    }
  }
  async extractRemotesFromSpec(device) {
    const spec = this.specs[device.spec_type];
    this.log.info(`Extracting remotes from spec for ${device.model} ${spec.description}`);
    this.log.info(
      'You can detailed information about status and remotes here: http://www.merdok.org/miotspec/?model=' +
        device.model,
    );
    let siid = 0;
    this.specStatusDict[device.did] = [];
    this.specActiosnToIdDict[device.did] = {};
    this.specPropsToIdDict[device.did] = {};
    for (const service of spec.services) {
      if (service.iid) {
        siid = service.iid;
      } else {
        siid++;
      }
      const typeArray = service.type.split(':');
      if (typeArray[3] === 'device-information') {
        continue;
      }
      if (!service.properties) {
        this.log.warn(`No properties for ${device.model} ${service.description} cannot extract information`);
        continue;
      }
      try {
        //this.log.info(JSON.stringify(service));
        let piid = 0;
        for (const property of service.properties) {
          if (property.iid) {
            piid = property.iid;
          } else {
            piid++;
          }
          const siidPiid = `${siid}-${piid}`;
          const remote = {
            siid: siid,
            piid: piid,
            did: device.did,
            model: device.model,
            name: PROPERTY_NAME_MAP[siidPiid]+' ' +siidPiid || (service.description + ' - ' + property.description + ' ' + siidPiid),
            type: property.type,
            access: property.access,
          };
          const typeName = property.type.split(':')[3];
          let path = 'status';
          let write = false;

          if (property.access.includes('write')) {
            path = 'remote';
            write = true;
          }

          const [type, role] = this.getRole(property.format, write, property['value-range']);
          this.log.debug(`Found remote for ${device.model} ${service.description} ${property.description}`);

          await this.extendObject(device.did + '.' + path, {
            type: 'channel',
            common: {
              name: path + ' extracted from Spec definition',
            },
            native: {},
          });
          if (path === 'remote') {
            await this.extendObject(device.did + '.' + path + '.customCommand', {
              type: 'state',
              common: {
                name: 'Send Custom command via Spec',
                type: 'string',
                role: 'json',
                def: `{
            "aiid": 9,
            "in": [
                {
                    "order": 4,
                    "region": [
                        1
                    ],
                    "type": "order"
                }
            ],
            "siid": 5
        }`,
                write: true,
                read: true,
              },
              native: {},
            });
          }
          const states = {};
          if (property['value-list']) {
            for (const value of property['value-list']) {
              states[value.value] = value.description;
            }
          }
          let unit;
          if (property.unit && property.unit !== 'none') {
            unit = property.unit;
          }

          // Override max constraint for fault properties
          const minValue = property['value-range'] ? property['value-range'][0] : undefined;
          let maxValue = property['value-range'] ? property['value-range'][1] : undefined;

          // Check if this is a fault property and remove max constraint
          if (
            typeName.toLowerCase().includes('fault') ||
            property.description.toLowerCase().includes('fault') ||
            service.description.toLowerCase().includes('fault')
          ) {
            this.log.debug(`Removing max constraint for fault property: ${typeName}`);
            maxValue = undefined; // Remove max constraint entirely for fault codes
          }

          await this.extendObject(device.did + '.' + path + '.' + typeName, {
            type: 'state',
            common: {
              name: remote.name || '',
              type: 'mixed',
              role: role,
              unit: unit,
              min: minValue,
              max: maxValue,
              states: property['value-list'] ? states : undefined,
              write: write,
              read: true,
            },
            native: {
              siid: siid,
              piid: piid,
              did: device.did,
              model: device.model,
              name: service.description + ' ' + property.description,
              type: property.type,
              access: property.access,
            },
          });
          if (property.access.includes('notify')) {
            this.specStatusDict[device.did].push({
              did: device.did,
              siid: remote.siid,
              code: 0,
              piid: remote.piid,
              updateTime: 0,
            });
          }
          this.specPropsToIdDict[device.did][remote.siid + '-' + remote.piid] =
            device.did + '.' + path + '.' + typeName;
        }
        //extract actions
        let aiid = 0;
        if (service.actions) {
          for (const action of service.actions) {
            if (action.iid) {
              aiid = action.iid;
            } else {
              aiid++;
            }
            const remote = {
              siid: siid,
              aiid: aiid,
              did: device.did,
              model: device.model,
              name: service.description + ' ' + action.description + ' ' + service.iid + '-' + action.iid,
              type: action.type,
              access: action.access,
            };
            const typeName = action.type.split(':')[3];
            const path = 'remote';
            const write = true;
            let [type, role] = this.getRole(action.format, write, action['value-range']);
            this.log.debug(`Found actions for ${device.model} ${service.description} ${action.description}`);
            await this.extendObject(device.did + '.' + path, {
              type: 'channel',
              common: {
                name: 'Remote Controls extracted from Spec definition',
              },
              native: {},
            });
            this.extendObject(device.did + '.' + path + '.fetchMap', {
              type: 'state',
              common: {
                name: 'Fetch Map from Device',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
                def: false,
              },
              native: {},
            });
            const states = {};
            if (action['value-list']) {
              for (const value of action['value-list']) {
                states[value.value] = value.description;
              }
            }
            let def = '[]';
            if (action.in.length) {
              remote.name = remote.name + ' in[';

              for (const inParam of action.in) {
                type = 'string';
                role = 'text';
                def = JSON.stringify(action.in);
                const prop = service.properties.filter((obj) => {
                  return obj.iid === inParam;
                });
                if (prop.length > 0) {
                  remote.name = remote.name + prop[0].description + '';
                }
                if (action.in.indexOf(inParam) !== action.in.length - 1) {
                  remote.name = remote.name + ',';
                }
              }

              remote.name = remote.name + ']';
            }

            if (action.out.length) {
              remote.name = remote.name + ' out[';

              for (const outParam of action.out) {
                const prop = service.properties.filter((obj) => {
                  return obj.iid === outParam;
                });
                if (prop.length > 0) {
                  remote.name = remote.name + prop[0].description;
                }
                if (action.out.indexOf(outParam) !== action.out.length - 1) {
                  remote.name = remote.name + ',';
                }
              }
              remote.name = remote.name + ']';
            }
            let unit;
            if (action.unit && action.unit !== 'none') {
              unit = action.unit;
            }

            // Override max constraint for fault actions
            const minActionValue = action['value-range'] ? action['value-range'][0] : undefined;
            let maxActionValue = action['value-range'] ? action['value-range'][1] : undefined;

            // Check if this is a fault action and remove max constraint
            if (
              typeName.toLowerCase().includes('fault') ||
              action.description.toLowerCase().includes('fault') ||
              service.description.toLowerCase().includes('fault')
            ) {
              this.log.debug(`Removing max constraint for fault action: ${typeName}`);
              maxActionValue = undefined; // Remove max constraint entirely for fault codes
            }

            await this.extendObject(device.did + '.' + path + '.' + typeName, {
              type: 'state',
              common: {
                name: remote.name || '',
                type: 'mixed',
                role: role,
                unit: unit,
                min: minActionValue,
                max: maxActionValue,
                states: action['value-list'] ? states : undefined,
                write: write,
                read: true,
                def: def != null ? def : undefined,
              },
              native: {
                siid: siid,
                aiid: aiid,
                did: device.did,
                model: device.model,
                in: action.in,
                out: action.out,
                name: service.description + ' ' + action.description,
                type: action.type,
                access: action.access,
              },
            });
            this.specActiosnToIdDict[device.did][service.iid + '-' + action.iid] =
              device.did + '.' + path + '.' + typeName;
          }
        }
      } catch (error) {
        this.log.error('Error while extracting spec for ' + device.model);
        this.log.error(error);
        this.log.error(error.stack);
        this.log.info(JSON.stringify(service));
      }
    }
  }
  async updateDevicesViaSpec() {
    for (const device of this.deviceArray) {
      if (this.config.getMap) {
        this.getMap(device);
      }
      if (this.specStatusDict[device.did]) {
        //split array in chunks of 50
        const chunkSize = 50;
        for (let i = 0; i < this.specStatusDict[device.did].length; i += chunkSize) {
          const chunk = this.specStatusDict[device.did].slice(i, i + chunkSize);

          const requestId = Math.floor(Math.random() * 9000) + 1000;
          const data = {
            did: device.did,
            id: requestId,
            data: {
              did: device.did,
              id: requestId,
              method: 'get_properties',
              params: chunk,
              from: 'XXXXXX',
            },
          };
          await this.requestClient({
            method: 'post',
            url: 'https://eu.iot.dreame.tech:13267/dreame-iot-com-10000/device/sendCommand',
            headers: {
              'user-agent': 'Dart/3.2 (dart:io)',
              'dreame-meta': 'cv=i_829',
              'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
              'tenant-id': '000000',
              host: 'eu.iot.dreame.tech:13267',
              authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
              'content-type': 'application/json',
              'dreame-auth': 'bearer ' + this.session.access_token,
            },
            data: data,
          })
            .then(async (res) => {
              if (res.data.code !== 0) {
                if (res.data.code === -8) {
                  this.log.debug(
                    `Error getting spec update for ${device.name} (${device.did}) with ${JSON.stringify(data)}`,
                  );

                  this.log.debug(JSON.stringify(res.data));
                  return;
                }
                this.log.info(
                  `Error getting spec update for ${device.name} (${device.did}) with ${JSON.stringify(data)}`,
                );
                this.log.debug(JSON.stringify(res.data));
                return;
              }
              this.log.debug(JSON.stringify(res.data));
              for (const element of res.data.data.result) {
                const path = this.specPropsToIdDict[device.did][element.siid + '-' + element.piid];
                if (path) {
                  this.log.debug(`Set ${path} to ${element.value}`);
                  if (element.value != null) {
                    this.setState(path, element.value, true);
                  }
                }
              }
            })
            .catch((error) => {
              if (error.response && error.response.status === 401) {
                this.log.debug(JSON.stringify(error.response.data));
                this.log.info('Receive 401 error. Refresh Token in 60 seconds');
                this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
                this.refreshTokenTimeout = setTimeout(() => {
                  this.refreshToken();
                }, 1000 * 60);
              }
              // Other errors already logged by axios-retry onMaxRetryTimesExceeded
            });
        }
      }
    }
  }
  getRole(element, write, valueRange) {
    if (!element) {
      return ['string', 'json'];
    }
    if (element === 'bool' && !write) {
      return ['boolean', 'indicator'];
    }
    if (element === 'bool' && write) {
      return ['boolean', 'switch'];
    }
    if ((element.indexOf('int') !== -1 || valueRange) && !write) {
      return ['number', 'value'];
    }
    if ((element.indexOf('int') !== -1 || valueRange) && write) {
      return ['number', 'level'];
    }
    return ['string', 'text'];
  }
  async connectMqtt() {
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    const url = this.deviceArray[0].bindDomain || 'app.mt.eu.iot.dreame.tech:19973';
    this.mqttClient = mqtt.connect('mqtts://' + url, {
      clientId: 'p_' + crypto.randomBytes(8).toString('hex'),
      username: this.session.uid,
      password: this.session.access_token,
      rejectUnauthorized: false,
      reconnectPeriod: 10000,
    });
    this.mqttClient.on('connect', () => {
      this.log.info('Connected to MQTT');
      for (const device of this.deviceArray) {
        this.mqttClient.subscribe(`/status/${device.did}/${this.session.uid}/${device.model}/eu/`);
      }
    });
    this.mqttClient.on('message', async (topic, message) => {
      // message is Buffer
      this.log.debug(topic.toString());
      this.log.debug(message.toString());
      /*
            {"id":92,"did":XXXXXX,"data":{"id":92,"method":"properties_changed","params":[{"did":"XXXXX","siid":2,"piid":6,"value":1},{"did":"XXXXX","siid":4,"piid":23,"value":5121}]}}
            */
      try {
        message = JSON.parse(message.toString());
        //this.log.info(' Get Message:' + JSON.stringify(message));
      } catch (error) {
        // Large status messages from Dreame MQTT broker are truncated at 4096 bytes server-side
        // This is a known limitation - log as info instead of error
        this.log.info(`MQTT message JSON parse failed (likely truncated by server): ${error.message}`);
        return;
      }
      if (message.data && message.data.method === 'properties_changed') {
        for (const element of message.data.params) {
          if (!this.specPropsToIdDict[element.did]) {
            this.log.debug(`No spec found for ${element.did}`);
            continue;
          }
          if (JSON.stringify(element.siid) === '6' && JSON.stringify(element.piid) === '1') {
            //this.log.info(' Map data:' + JSON.stringify(element.value));
            if (this.config.getMap || this.firstStart) {
              this.firstStart = false;
              const encode = JSON.stringify(element.value);
              const mappath = `${element.did}` + '.map.';
              this.setMapInfos(encode, mappath);
            }
          }
          //this.log.info(' Map data:' + JSON.stringify(element.siid) + ' => ' + JSON.stringify(element.piid));
          let path = this.specPropsToIdDict[element.did][element.siid + '-' + element.piid];
          if (!path) {
            this.log.debug(`No path found for ${element.did} ${element.siid}-${element.piid}`);
            path = `${element.did}.status.${element.siid}-${element.piid}`;
            await this.extendObject(path, {
              type: 'state',
              common: {
                name: path,
                type: 'mixed',
                role: 'state',
                write: false,
                read: true,
              },
              native: {},
            });
            this.setState(path, JSON.stringify(element.value), true);
            path = `${element.did}.remote.${element.siid}-${element.piid}`;
            await this.extendObject(path, {
              type: 'state',
              common: {
                name: path,
                type: 'mixed',
                role: 'state',
                write: true,
                read: true,
              },
              native: {
                siid: element.siid,
                piid: element.piid,
                aiid: element.aiid,
                did: element.did,
              },
            });
          }
          if (path) {
            this.log.debug(`Set ${path} to ${element.value}`);
            if (element.value != null) {
              this.setState(path, JSON.stringify(element.value), true);
              // this.json2iob.parse(path, JSON.stringify(element.value));
            }
          }
        }
      }
    });
    this.mqttClient.on('error', async (error) => {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('ECONNRESET')) {
        this.log.info('MQTT connection reset, reconnecting...');
      } else if (errorMessage.includes('Not authorized')) {
        this.log.error('Not authorized to connect to MQTT');
        this.setState('info.connection', false, true);
        await this.refreshToken();
      } else {
        this.log.error('MQTT error: ' + errorMessage);
      }
    });
    this.mqttClient.on('close', () => {
      this.log.info('MQTT Connection closed');
    });
  }
  uncompress(In_Compressed) {
    const input_Raw = In_Compressed.replace(/-/g, '+').replace(/_/g, '/');
    const encodedData = Buffer.from(input_Raw, 'base64');
    const decode = zlib.inflateSync(encodedData);
    //this.log.info(' Zlib inflate  : ' + decode);
    /*csvar mapHeader = decode.toString().split("{");
    let GetHeader = mapHeader[0];
	this.log.info(' decode Header 1: ' + GetHeader);
	try {
		var encodedDataH = Buffer.from(GetHeader, 'base64');
		this.log.info(' Base64 decode Header : ' + encodedDataH);
		var decodeHeader = zlib.inflateSync(encodedDataH);
		} catch (e) {
        this.log.info(' Error decode Header 2: ' + e);
        } finally {
        this.log.info(' decode Header 2: ' + decodeHeader);
        }
    */
    return decode.toString().match(/[{\[]{1}([,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]|".*?")+[}\]]{1}/gis);
  }
  async setMapInfos(In_Compressed, In_path) {
    const jsondecode = this.uncompress(In_Compressed);
    const jsonread = ((_) => {
      try {
        return JSON.parse(jsondecode);
      } catch (err) {
        this.log.info('Error:' + err);
        return undefined;
      }
    })();
    if (!jsonread) {
      return;
    }
    await this.extendObject(In_path + 'cleanset', {
      type: 'channel',
      common: {
        name: 'Cleaning Settings',
      },
      native: {},
    });
    await this.setObjectNotExists(In_path + 'cleanset.Update', {
      type: 'state',
      common: {
        name: 'Update cleanset Path',
        type: 'boolean',
        role: 'switch',
        write: true,
        read: true,
      },
      native: {},
    });

    const CheckUObjectOb = await this.getStateAsync(In_path + 'cleanset.Update');
    if (CheckUObjectOb == null) {
      this.setState(In_path + 'cleanset.Update', true, true);
      CheckUObject = true;
    } else {
      CheckUObject = CheckUObjectOb.val;
    }

    await this.setObjectNotExists(In_path + 'cleanset.Start-Clean', {
      type: 'state',
      common: {
        name: 'start cleaning for the selected rooms',
        type: 'boolean',
        role: 'switch',
        write: true,
        read: true,
      },
      native: {},
    });

    const CheckSCObjectOb = await this.getStateAsync(In_path + 'cleanset.Start-Clean');
    if (CheckSCObjectOb == null) {
      this.setState(In_path + 'cleanset.Start-Clean', false, true);
      CheckSCObject = false;
    } else {
      CheckSCObject = CheckSCObjectOb.val;
    }

    await this.setObjectNotExists(In_path + 'cleanset.Restart', {
      type: 'state',
      common: {
        name: 'stop ongoing cleaning and start new cleaning',
        type: 'boolean',
        role: 'switch',
        write: true,
        read: true,
      },
      native: {},
    });

    const CheckRCObjectOb = await this.getStateAsync(In_path + 'cleanset.Restart');
    if (CheckRCObjectOb == null) {
      this.setState(In_path + 'cleanset.Restart', false, true);
      CheckRCObject = false;
    } else {
      CheckRCObject = CheckRCObjectOb.val;
    }

    for (const [key, value] of Object.entries(jsonread)) {
      //this.log.info(' decode Map JSON:' + `${key}: ${value}`);
      if (Object.prototype.toString.call(value) !== '[object Object]') {
        if (value != null) {
          const pathMap = In_path + key;
          this.getType(value, pathMap);
          if (typeof value === 'object' && value !== null) {
            this.setState(pathMap, JSON.stringify(value), true);
          } else {
            this.setState(pathMap, value, true);
          }
        }
      }
      if (typeof value === 'object' && value !== null) {
        if (Object.prototype.toString.call(value) === '[object Object]') {
          for (const [Subkey, Subvalue] of Object.entries(value)) {
            //this.log.info(' decode subkey ' + key + ' ==> ' + `${Subkey}: ${Subvalue}`);
            if (value != null) {
              const pathMap = In_path + key + '.' + Subkey;
              if (pathMap.toString().indexOf('.cleanset') != -1) {
                await this.extendObject(pathMap, {
                  type: 'channel',
                  common: {
                    name: 'Cleaning Settings for Room: ' + Subkey,
                  },
                  native: {},
                });
                //this.log.info(' Long subkey ' + Subvalue.length + ' / ' + Subvalue[3]);
                if (Subvalue.length == 6) {
                  if (UpdateCleanset) {
                    for (let i = 0; i < Subvalue.length; i += 1) {
                      //1: DreameLevel, 2: DreameWaterVolume, 3: DreameRepeat, 4: DreameRoomNumber, 5: DreameCleaningMode, 6: Route
                      //map-req[{"piid": 2,"value": "{\"req_type\":1,\"frame_type\":I,\"force_type\":1}"}]
                      let pathMap = In_path + key + '.' + Subkey + '.RoomSettings';
                      this.getType(JSON.stringify(Subvalue), pathMap);
                      this.setState(pathMap, JSON.stringify(Subvalue), true);
                      pathMap = In_path + key + '.' + Subkey + '.RoomOrder';
                      this.getType(parseFloat(Subvalue[3]), pathMap);
                      this.setState(pathMap, parseFloat(Subvalue[3]), true);
                      pathMap = In_path + key + '.' + Subkey + '.Level';
                      this.setcleansetPath(pathMap, DreameLevel);
                      this.setState(pathMap, Subvalue[0], true);
                      pathMap = In_path + key + '.' + Subkey + '.CleaningMode';
                      this.setcleansetPath(pathMap, DreameCleaningMode);
                      this.setState(pathMap, Subvalue[4], true);
                      pathMap = In_path + key + '.' + Subkey + '.WaterVolume';
                      this.setcleansetPath(pathMap, DreameWaterVolume);
                      this.setState(pathMap, Subvalue[1], true);
                      pathMap = In_path + key + '.' + Subkey + '.Repeat';
                      this.setcleansetPath(pathMap, DreameRepeat);
                      this.setState(pathMap, Subvalue[2], true);
                      pathMap = In_path + key + '.' + Subkey + '.Route';
                      this.setcleansetPath(pathMap, DreameRoute);
                      this.setState(pathMap, Subvalue[5], true);
                      pathMap = In_path + key + '.' + Subkey + '.Cleaning';
                      await this.setcleansetPath(pathMap, DreameRoomClean);
                      const Cleanstates = await this.getStateAsync(pathMap);
                      if (Cleanstates == null) {
                        this.setStateAsync(pathMap, 0, true);
                      }
                    }
                  }
                }
              } else {
                this.getType(Subvalue, pathMap);
                this.setState(pathMap, JSON.stringify(Subvalue), true);
              }
            }
          }
        }
      }
    }
  }
  async setcleansetPath(createpath, CsetS) {
    //let jsonString = `{${Object.entries(CsetS).map(([key, value]) => `"${key}":"${value}"`).join(', ')}}`;
    await this.extendObject(createpath, {
      type: 'state',
      common: {
        name: createpath,
        type: 'number',
        role: 'level',
        states: CsetS,
        write: true,
        read: true,
      },
      native: {},
    });
  }

  async getMap(device, fetchAllMaps) {
    let mapFileName;
    const mapFileNameResponse = await this.sendCommand({
      did: device.did,
      method: 'get_properties',
      params: [
        {
          piid: fetchAllMaps ? 9 : 8,
          siid: 6,
          did: device.did,
        },
      ],
    });
    if (
      mapFileNameResponse &&
      mapFileNameResponse.result &&
      mapFileNameResponse.result[0] &&
      mapFileNameResponse.result[0].value
    ) {
      try {
        const json = JSON.parse(mapFileNameResponse.result[0].value);
        mapFileName = json.object_name;
      } catch (error) {
        this.log.error('Error getting map url: ' + JSON.stringify(mapFileNameResponse));
        this.log.error(error);
      }
    }

    if (!mapFileName) {
      return;
    }

    const fileUrl = await this.getFile(mapFileName, device);

    const mapsContent = await this.requestClient({
      method: 'get',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'de-de',
        Connection: 'keep-alive',
        'User-Agent': 'Dreame_Smarthome/1043 CFNetwork/1240.0.4 Darwin/20.6.0',
      },
      url: fileUrl,
    }).catch((error) => {
      this.log.error('Error getting map content: ' + JSON.stringify(error));
      this.log.error(error);
    });

    if (!fetchAllMaps) {
      mapsContent.data = [{ id: mapsContent.data.curr_id, info: mapsContent.data.mapstr }];
    }
    for (const mapsInfo of mapsContent.data) {
      const mapId = mapsInfo.id;
      //find first = 1
      let firstMap = mapsInfo.info[0];
      for (const map of mapsInfo.info) {
        if (map.first === 0 || map.id === 0) {
          firstMap = map;
        }
      }
      const multiMap = decodeMultiMapData(firstMap.thb || firstMap.map, 0);
      //convert mapInfo bitmap to image
      if (!createCanvas) {
        this.log.debug('Canvas not available, cannot create map image');
        return;
      }
      const canvas = createCanvas(multiMap.width, multiMap.height);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bitmapArray = new Uint8ClampedArray(multiMap.width * multiMap.height * 4);
      const colorPalette = [
        [0, 0, 0], // Black
        [255, 255, 255], // White
        [255, 0, 0], // Red
        [0, 200, 0], // Green
        [0, 0, 255], // Blue
        [255, 255, 0], // Yellow
        [255, 0, 255], // Magenta
        [0, 255, 255], // Cyan
        [128, 0, 0], // Maroon
        [0, 128, 0], // Dark Green
        [0, 0, 128], // Navy
        [128, 128, 0], // Olive
        [128, 0, 128], // Purple
        [0, 128, 128], // Teal
        [192, 192, 192], // Silver
        [128, 128, 128], // Gray
        [255, 192, 203], // Pink
        [255, 165, 0], // Orange
        [255, 105, 180], // Hot Pink
        [210, 105, 30], // Chocolate
        [34, 139, 34], // Forest Green
        [240, 230, 140], // Khaki
        [255, 228, 196], // Bisque
        [64, 224, 208], // Turquoise
        [221, 160, 221], // Plum
        [90, 90, 90], // Placeholder for transparency
      ];
      // Create an ImageData object
      for (let i = 0; i < multiMap.mapInfo.length; i++) {
        const colorIndex = multiMap.mapInfo[i];
        const [r, g, b] = colorPalette[colorIndex] || [0, 0, 0]; // Default to black
        let alpha = 255;
        if (colorIndex === 0) {
          alpha = 0;
        }
        bitmapArray[i * 4] = r; // Red
        bitmapArray[i * 4 + 1] = g; // Green
        bitmapArray[i * 4 + 2] = b; // Blue
        bitmapArray[i * 4 + 3] = alpha; // Alpha (fully opaque)
      }

      const imageData = new ImageData(bitmapArray, multiMap.width, multiMap.height);
      ctx.putImageData(imageData, 0, 0);

      // Save the image to a file
      const buffer = canvas.toBuffer('image/png');
      let stateMapId = multiMap.map_id;
      if (!fetchAllMaps) {
        stateMapId = 'current';
      }
      await this.extendObject(device.did + '.map.maps', {
        type: 'channel',
        common: {
          name: 'Maps extracted from Dreame',
        },
        native: {},
      });
      await this.extendObject(device.did + '.map.maps.' + stateMapId, {
        type: 'channel',
        common: {
          name: 'Map ' + stateMapId,
        },
        native: {},
      });
      delete multiMap.mapInfo;
      delete multiMap.floorMapInfo;
      this.json2iob.parse(device.did + '.map.maps.' + stateMapId + '.info', multiMap);
      await this.extendObject(device.did + '.map.maps.' + stateMapId + '.image', {
        type: 'state',
        common: {
          name: 'Map Image ' + stateMapId,
          type: 'string',
          role: 'state',
          read: true,
        },
        native: {},
      });
      await this.setState(
        device.did + '.map.maps.' + stateMapId + '.image',
        'data:image/png;base64,' + buffer.toString('base64'),
        true,
      );

      // const uncompressedMap = this.uncompress(firstMap.thb || firstMap.map);
    }
  }

  async getFile(url, device) {
    return await this.requestClient({
      method: 'post',
      url: 'https://eu.iot.dreame.tech:13267/dreame-user-iot/iotfile/getDownloadUrl',
      headers: {
        'user-agent': 'Dart/3.2 (dart:io)',
        'dreame-meta': 'cv=i_829',
        'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
        'tenant-id': '000000',
        authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
        'content-type': 'application/json',
        'dreame-auth': 'bearer ' + this.session.access_token,
      },
      data: {
        did: device.did,
        model: device.model,
        filename: url,
        region: 'eu',
      },
    })
      .then((res) => {
        if (res && res.data) {
          if (res.data.code !== 0) {
            this.log.error('Error getting file: ' + JSON.stringify(res));
            return;
          }
          return res.data.data;
        }
      })
      .catch((error) => {
        this.log.error('Error getting file: ' + JSON.stringify(error));
        this.log.error(error);
      });
  }

  async sendCommand(data) {
    const requestId = Math.floor(Math.random() * 9000) + 1000;
    const dataToSend = {
      did: data.did,
      id: requestId,
      data: {
        did: data.did,
        id: requestId,
        method: data.method,
        params: data.params,
        from: 'XXXXXX',
      },
    };
    return await this.requestClient({
      method: 'post',
      url: 'https://eu.iot.dreame.tech:13267/dreame-iot-com-10000/device/sendCommand',
      headers: {
        'user-agent': 'Dart/3.2 (dart:io)',
        'dreame-meta': 'cv=i_829',
        'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
        'tenant-id': '000000',
        authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
        'content-type': 'application/json',
        'dreame-auth': 'bearer ' + this.session.access_token,
      },
      data: dataToSend,
    })
      .then((res) => {
        this.log.debug('Command response: ' + JSON.stringify(res.data));

        if (res.data.code !== 0) {
          this.log.warn('Command failed: ' + JSON.stringify(res.data));
          return {};
        }
        if (!res.data.data) {
          this.log.warn('No response data');
          return {};
        }

        return res.data.data;
      })
      .catch(() => {
        // Error already logged by axios-retry onMaxRetryTimesExceeded
        return {};
      });
  }

  async getType(element, createpath) {
    let write = false;
    if (createpath.toString().indexOf('.cleanset') != -1) {
      write = true;
    }
    if (createpath.replace) {
      createpath = createpath.replace(this.FORBIDDEN_CHARS, '_');
    }
    const type = element !== null ? typeof element : 'mixed';

    await this.extendObject(createpath, {
      type: 'state',
      common: {
        name: createpath,
        type: type,
        role: this.getRoleCleanset(element, write),
        write: write,
        read: true,
      },
      native: {},
    });
  }
  getRoleCleanset(element, write) {
    if (typeof element === 'boolean' && !write) {
      return 'indicator';
    }
    if (typeof element === 'boolean' && write) {
      return 'switch';
    }
    if (typeof element === 'number' && !write) {
      if (element && element.toString().length === 13) {
        if (element > 1500000000000 && element < 2000000000000) {
          return 'value.time';
        }
      } else if (element && element.toFixed().toString().length === 10) {
        if (element > 1500000000 && element < 2000000000) {
          return 'value.time';
        }
      }
      return 'value';
    }
    if (typeof element === 'number' && write) {
      return 'level';
    }
    if (typeof element === 'string') {
      return 'text';
    }
    return 'state';
  }

  async jsonFromString(str) {
    const matches = str.match(/[{\[]{1}([,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]|".*?")+[}\]]{1}/gis);
    return Object.assign({}, ...matches.map((m) => m)); //JSON.parse(m)));
  }
  async UpdateRoomSettings(RoomInd, ChangeType, ChangeVal) {
    const RoomIdOb = await this.getStateAsync(RoomInd + '.RoomOrder');
    this.log.debug('Update Room Settings: ' + RoomInd + ' ' + ChangeType + ' ' + ChangeVal);
    let stateSuctionLevel, stateWaterVolume, stateRepeats, stateCleaningMode, stateRoute, RoomId;
    if (RoomIdOb) {
      RoomId = RoomIdOb.val;
    }

    const getStateValues = async () => {
      const stateSuctionLevelOb = await this.getStateAsync(RoomInd + '.Level');
      if (stateSuctionLevelOb) {
        stateSuctionLevel = stateSuctionLevelOb.val;
      }

      const stateWaterVolumeOb = await this.getStateAsync(RoomInd + '.WaterVolume');
      if (stateWaterVolumeOb) {
        stateWaterVolume = stateWaterVolumeOb.val;
      }

      const stateRepeatsOb = await this.getStateAsync(RoomInd + '.Repeat');
      if (stateRepeatsOb) {
        stateRepeats = stateRepeatsOb.val;
      }

      const stateCleaningModeOb = await this.getStateAsync(RoomInd + '.CleaningMode');
      if (stateCleaningModeOb) {
        stateCleaningMode = stateCleaningModeOb.val;
      }

      const stateRouteOb = await this.getStateAsync(RoomInd + '.Route');
      if (stateRouteOb) {
        stateRoute = stateRouteOb.val;
      }
    };

    await getStateValues();

    switch (ChangeType) {
      case 1:
        stateSuctionLevel = ChangeVal;
        break;
      case 2:
        stateWaterVolume = ChangeVal;
        break;
      case 3:
        stateRepeats = ChangeVal;
        break;
      case 4:
        stateCleaningMode = ChangeVal;
        break;
      case 5:
        stateRoute = ChangeVal;
        break;
    }

    const TosRetString = JSON.stringify({
      customeClean: [[RoomId, stateSuctionLevel, stateWaterVolume, stateRepeats, stateCleaningMode, stateRoute]],
    });

    return TosRetString;
  }
  async refreshToken() {
    await this.requestClient({
      method: 'post',
      url: 'https://eu.iot.dreame.tech:13267/dreame-auth/oauth/token',
      headers: {
        'user-agent': 'Dart/3.2 (dart:io)',
        'dreame-meta': 'cv=i_829',
        'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
        'tenant-id': '000000',
        host: 'eu.iot.dreame.tech:13267',
        authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
        'content-type': 'application/x-www-form-urlencoded',
      },
      data: {
        grant_type: 'refresh_token',
        refresh_token: this.session.refresh_token,
      },
    })
      .then((response) => {
        this.log.debug('Login response: ' + JSON.stringify(response.data));
        this.session = response.data;
        this.setState('info.connection', true, true);
        //reconnect mqtt
        this.connectMqtt();
      })
      .catch((error) => {
        this.log.error('Refresh Token  error: ' + error);
        error.response && this.log.error('Refresh Token error response: ' + JSON.stringify(error.response.data));
        this.setState('info.connection', false, true);
      });
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      this.updateInterval && clearInterval(this.updateInterval);
      this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);
      this.mqttClient && this.mqttClient.end();

      callback();
    } catch (e) {
      callback();
    }
  }
  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  async onStateChange(id, state) {
    if (state) {
      if (!state.ack) {
        const deviceId = id.split('.')[2];
        const folder = id.split('.')[3];
        let command = id.split('.')[4];
        this.log.debug(`Receive command ${command} for ${deviceId} in folder ${folder} with value ${state.val} `);
        // let type;
        if (command) {
          // type = command.split("-")[1];
          command = command.split('-')[0];
        }
        if (id.split('.')[4] === 'Refresh') {
          this.updateDevicesViaSpec();
          return;
        }
        if (id.split('.')[4] === 'fetchMap') {
          const device = this.deviceArray.filter((obj) => {
            return obj.did === deviceId;
          })[0];
          this.getMap(device, false);
          return;
        }
        //{"id":0,"method":"app_start","params":[{"clean_mop":0}]}

        const stateObject = await this.getObjectAsync(id);

        const requestId = Math.floor(Math.random() * 9000) + 1000;

        const data = {
          did: deviceId,
          id: requestId,
          data: {
            did: deviceId,
            id: requestId,
            method: 'action',
            params: {},
            from: 'XXXXXX',
          },
        };
        if (stateObject && stateObject.native.piid) {
          data.data.params = {
            did: deviceId,
            siid: stateObject.native.siid,
            piid: stateObject.native.piid,
            value: state.val,
          };
        }
        if (stateObject && stateObject.native.aiid) {
          data.data.params = {
            did: deviceId,
            siid: stateObject.native.siid,
            aiid: stateObject.native.aiid,
          };
          if (typeof state.val !== 'boolean') {
            try {
              data.data.params['in'] = JSON.parse(state.val);
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
          const device = this.deviceArray.filter((obj) => {
            return obj.did === deviceId;
          })[0];
          if (device && device.model.includes('mower')) {
            data.data.params.siid += 3;
          }
          // data.params.in = [];
        }
        if (command === 'customCommand') {
          try {
            data.data.params = JSON.parse(state.val);
            data.data.params.did = deviceId;
            if (state.val.includes && state.val.includes('piid')) {
              data.data.method = 'set_properties';
            }
          } catch (error) {
            this.log.error(error);
            return;
          }
        }
        if (id.toString().indexOf('.cleanset') != -1) {
          const RoomIdx = id.lastIndexOf('.');
          const RoomOjct = id.substring(0, RoomIdx);
          //this.log.info(' ======> Changed:' + id + ' to ' + state.val);
          let RetRoomSettings = '';
          if (id.split('.')[5] === 'Update') {
            UpdateCleanset = state.val === true ? true : false;
          }
          if (id.split('.')[5] === 'Start-Clean') {
            const GetCleanChange = state.val;
            if (GetCleanChange) {
              try {
                const GetCleanRoomState = await this.getStatesAsync('*.cleanset.*.Cleaning');
                let GetRoomIdOb,
                  GetRoomId,
                  GetRepeatsOb,
                  GetRepeats,
                  GetSuctionLevelOb,
                  GetSuctionLevel,
                  GetWaterVolumeOb,
                  GetWaterVolume;
                let GetMultiId = 0;
                let ToGetString = '{"selects":[';
                for (const idx in GetCleanRoomState) {
                  if (GetCleanRoomState[idx].val == 1) {
                    ToGetString += GetMultiId === 0 ? '[' : ',[';
                    GetMultiId += 1;
                    const RIdx = idx.lastIndexOf('.');
                    const RPath = idx.substring(0, RIdx);
                    //start-clean[{"piid": 1,"value": 18},{"piid": 10,"value": "{\"selects\": [[3,1,3,2,1]]}"}]
                    //Room ID, Repeats, Suction Level, Water Volume, Multi Room Id
                    GetRoomIdOb = await this.getStateAsync(RPath + '.RoomOrder');
                    GetRoomId = GetRoomIdOb.val;
                    GetRepeatsOb = await this.getStateAsync(RPath + '.Repeat');
                    GetRepeats = GetRepeatsOb.val;
                    GetSuctionLevelOb = await this.getStateAsync(RPath + '.Level');
                    GetSuctionLevel = GetSuctionLevelOb.val;
                    GetWaterVolumeOb = await this.getStateAsync(RPath + '.WaterVolume');
                    GetWaterVolume = GetWaterVolumeOb.val;
                    ToGetString +=
                      GetRoomId +
                      ',' +
                      GetRepeats +
                      ',' +
                      GetSuctionLevel +
                      ',' +
                      GetWaterVolume +
                      ',' +
                      GetMultiId +
                      ']';
                  }
                }
                ToGetString += ']}';
                this.log.info('start-clean ' + ToGetString);
                if (CheckRCObject) {
                  data.data.params = {
                    did: deviceId,
                    siid: 4,
                    aiid: 2,
                    in: [1],
                  };
                  await this.requestClient({
                    method: 'post',
                    url: 'https://eu.iot.dreame.tech:13267/dreame-iot-com-10000/device/sendCommand',
                    headers: {
                      'user-agent': 'Dart/3.2 (dart:io)',
                      'dreame-meta': 'cv=i_829',
                      'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
                      'tenant-id': '000000',
                      host: 'eu.iot.dreame.tech:13267',
                      authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
                      'content-type': 'application/json',
                      'dreame-auth': 'bearer ' + this.session.access_token,
                    },
                    data: data,
                  })
                    .then(async (res) => {
                      if (res.data.code !== 0) {
                        this.log.error('Error setting device state');
                        this.log.error(JSON.stringify(res.data));
                        this.setStateAsync(id, false, true);
                        CheckSCObject = false;
                        return;
                      }
                      if (res.data.result && res.data.result.length > 0) {
                        res.data = res.data.result[0];
                      }
                      this.log.info(JSON.stringify(res.data));
                      if (!res.data.result) {
                        this.setStateAsync(id, false, true);
                        CheckSCObject = false;
                        return;
                      }
                      const result = res.data.result;
                      if (result.out) {
                        this.log.info(JSON.stringify(result.out));
                      }
                    })
                    .catch(async (error) => {
                      this.log.error(error);
                      error.response && this.log.error(JSON.stringify(error.response.data));
                    });
                }
                if (GetMultiId > 0) {
                  data.data.params = {
                    did: deviceId,
                    siid: 4,
                    aiid: 1,
                    in: [
                      {
                        piid: 1,
                        value: 18,
                      },
                      {
                        piid: 10,
                        value: ToGetString,
                      },
                    ],
                  };
                } else {
                  this.setStateAsync(id, false, true);
                  CheckSCObject = false;
                  return;
                }
              } catch (error) {
                this.log.error(error);
                this.setStateAsync(id, false, true);
                CheckSCObject = false;
                return;
              }
            }
            this.setStateAsync(id, false, true);
            CheckSCObject = false;
          }
          /*
					[{"piid": 4,"value": "{\"customeClean\":[[5,2,27,2,2,2]]}"}]
					Room ID: [X,2,27,2,2,2]
					Suction Level: [5,X,27,2,2,2] 0: Quiet, 1: Standard, 2: Strong, 3: Turbo
                    Water Volume: [5,2,X,2,2,2] 2: Low, 3: Medium, 4:High
                    Repeats: [5,2,27,X,2,2] 1,2,3
                    Cleaning Mode: [5,2,27,2,X,2] 0: Sweeping, 1: Mopping, 2: Sweeping and Mopping
					Route: [5,2,27,2,2,X] 1: Standart 2: Intensive 3:Deep
                    */
          if (id.split('.')[6] === 'Level') {
            try {
              RetRoomSettings = await this.UpdateRoomSettings(RoomOjct, 1, state.val);
              data.data.params = {
                did: deviceId,
                siid: 6,
                aiid: 2,
                in: [
                  {
                    piid: 4,
                    value: RetRoomSettings,
                  },
                ],
              };
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
          if (id.split('.')[6] === 'WaterVolume') {
            try {
              RetRoomSettings = await this.UpdateRoomSettings(RoomOjct, 2, state.val);
              data.data.params = {
                did: deviceId,
                siid: 6,
                aiid: 2,
                in: [
                  {
                    piid: 4,
                    value: RetRoomSettings,
                  },
                ],
              };
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
          if (id.split('.')[6] === 'Repeat') {
            try {
              RetRoomSettings = await this.UpdateRoomSettings(RoomOjct, 3, state.val);
              data.data.params = {
                did: deviceId,
                siid: 6,
                aiid: 2,
                in: [
                  {
                    piid: 4,
                    value: RetRoomSettings,
                  },
                ],
              };
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
          if (id.split('.')[6] === 'CleaningMode') {
            try {
              RetRoomSettings = await this.UpdateRoomSettings(RoomOjct, 4, state.val);
              data.data.params = {
                did: deviceId,
                siid: 6,
                aiid: 2,
                in: [
                  {
                    piid: 4,
                    value: RetRoomSettings,
                  },
                ],
              };
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
          if (id.split('.')[6] === 'Route') {
            try {
              RetRoomSettings = await this.UpdateRoomSettings(RoomOjct, 5, state.val);
              data.data.params = {
                did: deviceId,
                siid: 6,
                aiid: 2,
                in: [
                  {
                    piid: 4,
                    value: RetRoomSettings,
                  },
                ],
              };
            } catch (error) {
              this.log.error(error);
              return;
            }
          }
        }

        this.log.info(`Send: ${JSON.stringify(data)} to ${deviceId}`);

        await this.requestClient({
          method: 'post',
          url: 'https://eu.iot.dreame.tech:13267/dreame-iot-com-10000/device/sendCommand',
          headers: {
            'user-agent': 'Dart/3.2 (dart:io)',
            'dreame-meta': 'cv=i_829',
            'dreame-rlc': '1a9bb36e6b22617cf465363ba7c232fb131899d593e8d1a1-1',
            'tenant-id': '000000',
            host: 'eu.iot.dreame.tech:13267',
            authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
            'content-type': 'application/json',
            'dreame-auth': 'bearer ' + this.session.access_token,
          },
          data: data,
        })
          .then(async (res) => {
            if (res.data.code !== 0) {
              this.log.error('Error setting device state');
              this.log.error(JSON.stringify(res.data));
              return;
            }
            if (res.data.result && res.data.result.length > 0) {
              res.data = res.data.result[0];
            }
            this.log.info(JSON.stringify(res.data));
            if (!res.data.result) {
              return;
            }
            const result = res.data.result;
            if (result.out) {
              const path = this.specActiosnToIdDict[result.did][result.siid + '-' + result.aiid];
              this.log.debug(path);
              const stateObject = await this.getObjectAsync(path);
              if (stateObject && stateObject.native.out) {
                const out = stateObject.native.out;
                for (const outItem of out) {
                  const index = out.indexOf(outItem);
                  const outPath = this.specPropsToIdDict[result.did][result.siid + '-' + outItem];
                  // await this.setState(outPath, result.out[index], true);
                  this.json2iob.parse(outPath, result.out[index]);
                  this.log.info('Set ' + outPath + ' to ' + result.out[index]);
                }
              } else {
                this.log.info(JSON.stringify(result.out));
              }
            }
          })
          .catch(async (error) => {
            this.log.error(error);
            error.response && this.log.error(JSON.stringify(error.response.data));
          });

        this.refreshTimeout = setTimeout(async () => {
          this.log.info('Update devices');
          await this.updateDevicesViaSpec();
        }, 10 * 1000);
      }
    }
  }
}
if (require.main !== module) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new Dreame(options);
} else {
  // otherwise start the instance directly
  new Dreame();
}
