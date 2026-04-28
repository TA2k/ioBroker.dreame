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

const BRAND_CONFIG = {
  dreame: {
    domain: 'eu.iot.dreame.tech:13267',
    tenantId: '000000',
    authorization: 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=',
    meta: 'cv=i_829',
    rlcKey: 'EETjszu*XI5znHsI',
    mqttFallback: 'app.mt.eu.iot.dreame.tech:19973',
    iotComPrefix: '10000',
  },
  mova: {
    domain: 'eu.iot.mova-tech.com:13267',
    tenantId: '000002',
    authorization: 'Basic bW92YV9hcHA6VjdLb0NoTFc4dkhBQ3FHYg==',
    meta: 'cv=i_829',
    rlcKey: 'gigxlmqwZ]7oWZUF',
    mqttFallback: 'app.mt.eu.iot.mova-tech.com:19974',
    iotComPrefix: '20000',
  },
};

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
const DEVICE_STATUS_STATES = Object.freeze({
  vacuum: {
    1: 'Cleaning', 2: 'Standby', 3: 'Paused', 4: 'Paused', 5: 'Returning to charge',
    6: 'Charging', 7: 'Mopping', 8: 'Mop Drying', 9: 'Mop Washing', 10: 'Returning to wash',
    11: 'Mapping', 12: 'Cleaning', 13: 'Charging Completed', 14: 'Upgrading',
    15: 'Summon to clean', 16: 'Self-Repairing', 17: 'Returning to install the mop pad',
    18: 'Returning to remove the mop pad', 19: 'Automatic water supply and drainage self testing',
    20: 'Cleaning Mop Pad and Adding Water', 21: 'Cleaning paused', 22: 'Auto-Emptying',
    23: 'Remote Controlled Cleaning', 24: 'Smart Charging', 25: 'Second cleaning underway',
    26: 'Following', 27: 'Spot cleaning', 28: 'Returning for dust collection',
    29: 'Waiting for tasks', 30: 'Cleaning the washboard base',
    31: 'Returning to drain', 32: 'Draining', 33: 'Water Supply and Drainage Emptying',
    34: 'Emptying', 35: 'Dust bag drying', 36: 'Dust bag drying paused',
    37: 'Heading to extra cleaning', 38: 'Extra cleaning',
    95: 'Finding pet paused', 96: 'Finding pet', 97: 'Shortcut running',
    98: 'Camera Monitoring', 99: 'Camera monitoring paused',
    101: 'Initial deep cleaning', 102: 'Initial deep cleaning paused',
    103: 'Sanitizing', 104: 'Sanitizing with dry',
    105: 'Changing mop', 106: 'Changing mop paused',
    107: 'Floor maintaining', 108: 'Floor maintaining paused',
  },
  mower: {
    1: 'Working', 2: 'Standby', 3: 'Working', 4: 'Paused', 5: 'Returning Charge',
    6: 'Charging', 7: 'Error', 8: 'Raining Pause', 9: 'Initializing',
    10: 'Leaving Station', 11: 'Mapping', 12: 'Border Mowing', 13: 'Charging Completed',
    14: 'Upgrading', 15: 'Relocating', 16: 'Task Navigating',
  },
  swbot: {
    0: 'Online', 1: 'Charging', 2: 'Charging complete', 3: 'Updating',
  },
  airp: {
    1: 'Working', 2: 'Standby',
  },
  hold: {
    1: 'Mopping', 2: 'Offline', 3: 'Standby', 4: 'Charging', 5: 'Self-Cleaning',
    6: 'Drying', 7: 'Sleeping Mode', 8: 'Vacuuming', 9: 'Adding clean water',
    10: 'Pausing', 11: 'Pausing', 12: 'Pausing', 13: 'OTA Upgrading',
    14: 'Voice Package Upgrading', 15: 'Charging Completed', 16: 'Mopping', 17: 'Mopping',
    18: 'Mopping', 19: 'Mopping', 20: 'Mopping', 21: 'Mopping', 22: 'Mopping',
    23: 'Drying', 24: 'Drying', 25: 'Drying', 26: 'Self-Cleaning', 27: 'Self-Cleaning',
    28: 'Self-Cleaning',
  },
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

const MOWER_PROPERTY_NAME_MAP = Object.freeze({
  '9-1': 'blades_time_left',
  '9-2': 'blades_left',
  '4-42': 'map_index',
  '4-43': 'map_name',
  '4-44': 'cruise_type',
  '4-50': 'lensbrush_left',
  '4-58': 'task_type',
  '4-59': 'pet_detective',
  '4-62': 'back_clean_mode',
  '4-63': 'cleaning_progress',
  '4-83': 'device_capability',
  '12-5': 'total_runtime',
  '12-6': 'total_cruise_time',
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
  isMower(device) {
    return device && device.model && device.model.includes('mower');
  }
  isVacuum(device) {
    return this.getDeviceType(device) === 'vacuum';
  }
  getDeviceType(device) {
    if (!device || !device.model) return 'vacuum';
    const model = device.model.toLowerCase();
    if (model.includes('mower')) return 'mower';
    if (model.includes('swbot')) return 'swbot';
    if (model.includes('airp')) return 'airp';
    if (model.includes('hold')) return 'hold';
    return 'vacuum';
  }
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
    this.brand = BRAND_CONFIG[this.config.cloudService || 'dreame'];
    this.rlcHeader = this.computeRlc();
    this.updateInterval = null;
    this.mowerMapInterval = null;
    this.reLoginTimeout = null;
    this.refreshTokenTimeout = null;
    this.session = {};
    this.firstStart = true;
    this.subscribeStates('*.remote.*');
    this.subscribeStates('*.shortcuts.*.start');
    this.subscribeStates('*.cleanset.*');
    this.log.info(`Login to ${(this.config.cloudService || 'dreame').toUpperCase()} Cloud...`);
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

  computeRlc() {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.brand.rlcKey, null);
    let encrypted = cipher.update('eu|en|DE', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  getHeaders() {
    return {
      'user-agent': 'Dart/3.2 (dart:io)',
      'dreame-meta': this.brand.meta,
      'dreame-rlc': this.rlcHeader,
      'tenant-id': this.brand.tenantId,
      host: this.brand.domain,
      authorization: this.brand.authorization,
      'content-type': 'application/json',
      ...(this.session.access_token ? { 'dreame-auth': 'bearer ' + this.session.access_token } : {}),
    };
  }

  async login() {
    await this.requestClient({
      method: 'post',
      url: `https://${this.brand.domain}/dreame-auth/oauth/token`,
      headers: {
        ...this.getHeaders(),
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
      url: `https://${this.brand.domain}/dreame-user-iot/iotuserbind/device/listV2`,
      headers: this.getHeaders(),
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
            const deviceType = this.getDeviceType(device);
            if (!this.states[device.did]) {
              this.states[device.did] = {};
            }
            if (!this.states[device.did]['2-1'] && DEVICE_STATUS_STATES[deviceType]) {
              this.states[device.did]['2-1'] = DEVICE_STATUS_STATES[deviceType];
              this.log.info(`Using local status states for ${device.model} (type: ${deviceType})`);
            }
            this.json2iob.parse(device.did + '.general', device, {
              states: { latestStatus: this.states[device.did] },
              channelName: 'General Updated at Start',
            });
            if (this.isMower(device)) {
              await this.getMowerMap(device);
              await this.loadMowerSettings(device);
              await this.loadMowerHistory(device);
              const dockState = await this.getStateAsync(device.did + '.status.dock-position');
              if (dockState && dockState.val) {
                try {
                  this.mowerDockPos = this.mowerDockPos || {};
                  this.mowerDockPos[String(device.did)] = JSON.parse(String(dockState.val));
                } catch (e) { /* ignore */ }
              }
            } else {
              await this.getMap(device, true);
            }
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
        if (this.isMower(device)) {
          this.log.info(`No mower spec found for ${device.model}, using vacuum spec as base`);
        } else {
          this.log.info(`No spec found for ${device.model}, using default vacuum spec`);
        }
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
  async createMowerRemotes(device) {
    const did = device.did;
    this.log.info(`Creating mower-specific states for ${device.model}`);

    const statusStates = [
      { id: 'status', name: 'Mower Status (2-1)', siid: 2, piid: 1, type: 'number', role: 'value', states: DEVICE_STATUS_STATES.mower },
      { id: 'fault', name: 'Error Code (2-2)', siid: 2, piid: 2, type: 'number', role: 'value' },
      { id: 'task-info', name: 'Task Execution Info (2-50)', siid: 2, piid: 50, type: 'string', role: 'json' },
      { id: 'settings-update', name: 'Settings Update (2-51)', siid: 2, piid: 51, type: 'string', role: 'json', desc: 'Generischer Settings-Trigger via MQTT. 2 Werte = Rain Protection (WRP), 1 Wert = Frost Protection (FDP), 3 Werte = Low Speed Nachts (LOW)' },
      { id: 'mowing-preference', name: 'Mowing Preference Update (2-52)', siid: 2, piid: 52, type: 'string', role: 'json' },
      { id: 'voice-download', name: 'Voice Download Progress (2-53)', siid: 2, piid: 53, type: 'number', role: 'value', unit: '%' },
      { id: 'ai-obstacles', name: 'AI Obstacle Detection (2-55)', siid: 2, piid: 55, type: 'string', role: 'json' },
      { id: 'zone-status', name: 'Zone Status (2-56)', siid: 2, piid: 56, type: 'string', role: 'json' },
      { id: 'self-check', name: 'Self-Check Result (2-58)', siid: 2, piid: 58, type: 'string', role: 'json' },
      { id: 'task-progress-flag', name: 'Task Progress Flag (2-62)', siid: 2, piid: 62, type: 'number', role: 'value' },
      { id: 'task-type', name: 'Task Type (2-65)', siid: 2, piid: 65, type: 'string', role: 'text' },
      { id: 'battery-level', name: 'Battery Level (3-1)', siid: 3, piid: 1, type: 'number', role: 'value.battery', unit: '%' },
      { id: 'charging-state', name: 'Charging State (3-2)', siid: 3, piid: 2, type: 'number', role: 'value' },
      { id: 'work-mode', name: 'Work Mode (4-1)', siid: 4, piid: 1, type: 'number', role: 'value' },
      { id: 'mowing-time', name: 'Mowing Time (4-2)', siid: 4, piid: 2, type: 'number', role: 'value', unit: 'min' },
      { id: 'mowing-area', name: 'Mowed Area (4-3)', siid: 4, piid: 3, type: 'number', role: 'value', unit: 'm²' },
      { id: 'task-status', name: 'Task Status (4-7)', siid: 4, piid: 7, type: 'number', role: 'value' },
      { id: 'serial-number', name: 'Serial Number (4-14)', siid: 4, piid: 14, type: 'string', role: 'text' },
      { id: 'faults', name: 'Faults (4-18)', siid: 4, piid: 18, type: 'string', role: 'text' },
      { id: 'warn-status', name: 'Warning Status (4-35)', siid: 4, piid: 35, type: 'number', role: 'value' },
      { id: 'mow-cancel', name: 'Mow Cancel (4-30)', siid: 4, piid: 30, type: 'number', role: 'value' },
      { id: 'map-index', name: 'Map Index (4-42)', siid: 4, piid: 42, type: 'number', role: 'value' },
      { id: 'map-name', name: 'Map Name (4-43)', siid: 4, piid: 43, type: 'string', role: 'text' },
      { id: 'device-capability', name: 'Device Capability (4-83)', siid: 4, piid: 83, type: 'string', role: 'json' },
      { id: 'rtk-status', name: 'RTK Status (5-100)', siid: 5, piid: 100, type: 'number', role: 'value' },
      { id: 'gps-satellites', name: 'GPS Satellites (5-106)', siid: 5, piid: 106, type: 'number', role: 'value' },
      { id: 'positioning-mode', name: 'Positioning Mode (5-107)', siid: 5, piid: 107, type: 'number', role: 'value' },
      { id: 'first-mow-time', name: 'First Mow Time (12-1)', siid: 12, piid: 1, type: 'number', role: 'value' },
      { id: 'total-mow-time', name: 'Total Mow Time (12-2)', siid: 12, piid: 2, type: 'number', role: 'value', unit: 'min' },
      { id: 'total-mow-count', name: 'Total Mow Count (12-3)', siid: 12, piid: 3, type: 'number', role: 'value' },
      { id: 'total-mow-area', name: 'Total Mowed Area (12-4)', siid: 12, piid: 4, type: 'number', role: 'value', unit: 'm²' },
      { id: 'total-runtime', name: 'Total Runtime (12-5)', siid: 12, piid: 5, type: 'number', role: 'value', unit: 'min' },
      { id: 'total-cruise-time', name: 'Total Cruise Time (12-6)', siid: 12, piid: 6, type: 'number', role: 'value', unit: 'min' },
      // getCFG Settings (kein siid/piid, befüllt via loadMowerSettings)
      { id: 'rain-protection', name: 'Rain Protection (WRP)', type: 'string', role: 'json', desc: '[enabled, wait_hours, sensitivity]' },
      { id: 'frost-protection', name: 'Frost Protection (FDP)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'low-speed', name: 'Low Speed Night (LOW)', type: 'string', role: 'json', desc: '[enabled, start_min, end_min]' },
      { id: 'dnd-settings', name: 'Do Not Disturb (DND)', type: 'string', role: 'json', desc: '[enabled, start_min, end_min]' },
      { id: 'child-lock-cfg', name: 'Child Lock (CLS)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'battery-config', name: 'Battery Config (BAT)', type: 'string', role: 'json', desc: '[return%, max%, charge_enabled, ?, start_min, end_min]' },
      { id: 'volume', name: 'Volume (VOL)', type: 'number', role: 'value', unit: '%' },
      { id: 'headlight', name: 'Headlight (LIT)', type: 'string', role: 'json', desc: '[enabled, start_min, end_min, l1, l2, l3, l4]' },
      { id: 'ai-obstacle-cfg', name: 'AI Obstacle Avoidance (AOP)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'camera-config', name: 'Camera/Recording (REC)', type: 'string', role: 'json', desc: '[enabled, sensitivity, mode, report, ...]' },
      { id: 'anti-theft', name: 'Anti-Theft (STUN)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'auto-task-adj', name: 'Auto Task Adjustment (ATA)', type: 'string', role: 'json', desc: '[0, 0, 0]' },
      { id: 'path-display', name: 'Path Display (PATH)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'weather-ref', name: 'Weather Forecast Ref (WRF)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'grass-protection', name: 'Grass Protection (PROT)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'blade-hours', name: 'Blade Hours (CMS)', type: 'number', role: 'value', unit: 'h', desc: 'Klingen-Betriebsstunden (max 100h)' },
      { id: 'blade-health', name: 'Blade Health (CMS)', type: 'number', role: 'value', unit: '%', desc: 'Klingen-Zustand 0-100%' },
      { id: 'brush-hours', name: 'Brush Hours (CMS)', type: 'number', role: 'value', unit: 'h', desc: 'Bürsten-Betriebsstunden (max 500h)' },
      { id: 'brush-health', name: 'Brush Health (CMS)', type: 'number', role: 'value', unit: '%', desc: 'Bürsten-Zustand 0-100%' },
      { id: 'robot-maintenance-hours', name: 'Robot Maintenance Hours (CMS)', type: 'number', role: 'value', unit: 'h', desc: 'Roboter-Wartungsstunden (max 60h)' },
      { id: 'robot-maintenance-health', name: 'Robot Maintenance Health (CMS)', type: 'number', role: 'value', unit: '%', desc: 'Roboter-Wartungs-Zustand 0-100%' },
      // AutoSwitch (4-50 JSON parsed, kein siid/piid)
      { id: 'collision-avoidance', name: 'Collision Avoidance (LessColl)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'fill-light', name: 'Fill Light (FillinLight)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'clean-genius', name: 'CleanGenius (SmartHost)', type: 'number', role: 'value', desc: '0=Off, 1=Routine, 2=Deep' },
      { id: 'cleaning-route', name: 'Cleaning Route (CleanRoute)', type: 'number', role: 'value', desc: '1=Standard, 2=Intensiv, 3=Deep, 4=Quick' },
      { id: 'wider-corner', name: 'Wider Corner Coverage (MeticulousTwist)', type: 'number', role: 'value', desc: '0=Off, 1=HighFreq, 7=LowFreq' },
      { id: 'floor-direction', name: 'Floor Direction Cleaning (MaterialDirectionClean)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'pet-focused', name: 'Pet Focused Cleaning (PetPartClean)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'auto-charging', name: 'Auto Charging (SmartCharge)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      // PRE Mähpräferenzen (getCFG, kein siid/piid)
      { id: 'cutting-height', name: 'Cutting Height (PRE)', type: 'number', role: 'value', unit: 'mm', desc: 'Schnitthöhe' },
      { id: 'obstacle-distance-cfg', name: 'Obstacle Distance (PRE)', type: 'number', role: 'value', unit: 'mm', desc: 'Hindernisabstand' },
      { id: 'mow-mode', name: 'Mow Mode (PRE)', type: 'number', role: 'value', desc: '0=Standard, 1=Effizient' },
      { id: 'direction-change', name: 'Direction Change (PRE)', type: 'number', role: 'value', desc: '0=auto, 1=aus' },
      { id: 'edge-mowing', name: 'Edge Mowing (PRE)', type: 'number', role: 'value', desc: '0=aus, 1=an' },
      { id: 'edge-detection', name: 'Edge Detection (PRE)', type: 'number', role: 'value', desc: '0=aus, 1=an' },
    ];

    const remoteStates = [
      { id: 'obstacle-avoidance', name: 'Obstacle Avoidance (4-21)', siid: 4, piid: 21, type: 'number', role: 'switch' },
      { id: 'ai-detection', name: 'AI Detection (4-22)', siid: 4, piid: 22, type: 'number', role: 'switch' },
      { id: 'mow-setting', name: 'Mow Setting (4-23)', siid: 4, piid: 23, type: 'number', role: 'value' },
      { id: 'custom-mowing', name: 'Custom Mowing (4-26)', siid: 4, piid: 26, type: 'number', role: 'switch' },
      { id: 'child-lock', name: 'Child Lock (4-27)', siid: 4, piid: 27, type: 'number', role: 'switch' },
      { id: 'dnd-enable', name: 'Do Not Disturb (5-1)', siid: 5, piid: 1, type: 'boolean', role: 'switch' },
      { id: 'dnd-start', name: 'DND Start Time (5-2)', siid: 5, piid: 2, type: 'string', role: 'text' },
      { id: 'dnd-end', name: 'DND End Time (5-3)', siid: 5, piid: 3, type: 'string', role: 'text' },
      { id: 'timezone', name: 'Timezone (8-1)', siid: 8, piid: 1, type: 'string', role: 'text' },
      { id: 'schedule', name: 'Mow Schedule (8-2)', siid: 8, piid: 2, type: 'string', role: 'text' },
    ];

    // Plugin SET commands via action channel (siid:2 aiid:50, m:'s')
    // Format: {m:'s', t:cfgKey, d:{value:X}} or d:{value:X, time:Y, ...}
    const cfgRemotes = [
      { id: 'set-rain-protection', name: 'Set Rain Protection (WRP)', cfgKey: 'WRP', type: 'string', role: 'json', desc: '{"value":1,"time":8,"sen":0} oder {"value":0}' },
      { id: 'set-frost-protection', name: 'Set Frost Protection (FDP)', cfgKey: 'FDP', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-low-speed', name: 'Set Low Speed Night (LOW)', cfgKey: 'LOW', type: 'string', role: 'json', desc: '{"value":1,"time":[1200,480]} oder {"value":0}' },
      { id: 'set-dnd', name: 'Set Do Not Disturb (DND)', cfgKey: 'DND', type: 'string', role: 'json', desc: '{"value":1,"time":[1200,480]} oder {"value":0}' },
      { id: 'set-child-lock', name: 'Set Child Lock (CLS)', cfgKey: 'CLS', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-volume', name: 'Set Volume (VOL)', cfgKey: 'VOL', type: 'number', role: 'level.volume', desc: '0-100' },
      { id: 'set-ai-obstacle', name: 'Set AI Obstacle (AOP)', cfgKey: 'AOP', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-anti-theft', name: 'Set Anti-Theft (STUN)', cfgKey: 'STUN', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-headlight', name: 'Set Headlight (LIT)', cfgKey: 'LIT', type: 'string', role: 'json', desc: '{"value":1,"time":[480,1200],"light":[1,1,1,1],"fill":0}' },
      { id: 'set-path-display', name: 'Set Path Display (PATH)', cfgKey: 'PATH', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-grass-protection', name: 'Set Grass Protection (PROT)', cfgKey: 'PROT', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'reset-consumables', name: 'Reset Consumables (CMS)', cfgKey: 'CMS', type: 'string', role: 'json', desc: '{"value":[0,brush,robot]} — auf 0 gesetzte Werte werden zurückgesetzt' },
      { id: 'reset-blade', name: 'Reset Blade Hours', cfgKey: 'CMS', resetIndex: 0, type: 'boolean', role: 'button', desc: 'Klingen-Betriebsstunden zurücksetzen (max 6000 min / 100h)' },
      { id: 'reset-brush', name: 'Reset Brush Hours', cfgKey: 'CMS', resetIndex: 1, type: 'boolean', role: 'button', desc: 'Bürsten-Betriebsstunden zurücksetzen (max 30000 min / 500h)' },
      { id: 'reset-robot-maintenance', name: 'Reset Robot Maintenance', cfgKey: 'CMS', resetIndex: 2, type: 'boolean', role: 'button', desc: 'Roboter-Wartungsstunden zurücksetzen (max 3600 min / 60h)' },
      { id: 'find-robot', name: 'Find Robot', cfgKey: null, actionOp: 9, type: 'boolean', role: 'button', desc: 'Roboter suchen (Ton abspielen)' },
      { id: 'lock-robot', name: 'Lock Robot', cfgKey: null, actionOp: 12, type: 'boolean', role: 'button', desc: 'Roboter sperren' },
      // AutoSwitch (set_properties siid:4 piid:50)
      { id: 'set-collision-avoidance', name: 'Set Collision Avoidance', autoSwitchKey: 'LessColl', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-fill-light', name: 'Set Fill Light', autoSwitchKey: 'FillinLight', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-clean-genius', name: 'Set CleanGenius', autoSwitchKey: 'SmartHost', type: 'number', role: 'value', desc: '0=Off, 1=Routine, 2=Deep' },
      { id: 'set-cleaning-route', name: 'Set Cleaning Route', autoSwitchKey: 'CleanRoute', type: 'number', role: 'value', desc: '1=Standard, 2=Intensiv, 3=Deep, 4=Quick' },
      { id: 'set-auto-charging', name: 'Set Auto Charging', autoSwitchKey: 'SmartCharge', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      // PRE (read-modify-write via getCFG)
      { id: 'set-cutting-height', name: 'Set Cutting Height (mm)', cfgKey: 'PRE', preIndex: 2, type: 'number', role: 'value', desc: 'Schnitthöhe in mm' },
      { id: 'set-mow-mode', name: 'Set Mow Mode', cfgKey: 'PRE', preIndex: 1, type: 'number', role: 'value', desc: '0=Standard, 1=Effizient' },
      { id: 'set-edge-mowing', name: 'Set Edge Mowing', cfgKey: 'PRE', preIndex: 9, type: 'number', role: 'switch', desc: '0=aus, 1=an' },
      { id: 'set-edge-detection', name: 'Set Edge Detection', cfgKey: 'PRE', preIndex: 8, type: 'number', role: 'switch', desc: '0=aus, 1=an' },
      { id: 'set-direction-change', name: 'Set Direction Change', cfgKey: 'PRE', preIndex: 5, type: 'number', role: 'switch', desc: '0=auto, 1=aus' },
    ];

    const actionStates = [
      { id: 'start-mow', name: 'Start Mowing (5-1)', siid: 2, aiid: 1, in: [] },
      { id: 'stop-mow', name: 'Stop Mowing (5-2)', siid: 2, aiid: 2, in: [] },
      { id: 'pause-mow', name: 'Pause Mowing (5-4)', siid: 2, aiid: 4, in: [] },
      { id: 'start-charge', name: 'Return to Dock (5-3)', siid: 5, aiid: 3, in: [] },
      { id: 'start-mow-ext', name: 'Start Custom Mow (4-1)', siid: 4, aiid: 1, in: [10, 1] },
      { id: 'clear-warning', name: 'Clear Warning (4-3)', siid: 4, aiid: 3, in: [] },
    ];

    await this.extendObject(did + '.status', { type: 'channel', common: { name: 'Mower Status' }, native: {} });
    await this.extendObject(did + '.remote', { type: 'channel', common: { name: 'Mower Remote' }, native: {} });

    for (const s of statusStates) {
      const path = `${did}.status.${s.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: s.name, type: s.type, role: s.role, read: true, write: false, unit: s.unit || '', ...(s.states ? { states: s.states } : {}), ...(s.desc ? { desc: s.desc } : {}) }),
        native: { siid: s.siid, piid: s.piid, did: did },
      });
      if (s.siid && s.piid) {
        this.specPropsToIdDict[did][`${s.siid}-${s.piid}`] = path;
        this.specStatusDict[did].push({ did: did, siid: s.siid, code: 0, piid: s.piid, updateTime: 0 });
      }
    }

    for (const r of remoteStates) {
      const path = `${did}.remote.${r.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: { name: r.name, type: r.type, role: r.role, read: true, write: true },
        native: { siid: r.siid, piid: r.piid, did: did },
      });
      this.specPropsToIdDict[did][`${r.siid}-${r.piid}`] = path;
    }

    for (const c of cfgRemotes) {
      const path = `${did}.remote.${c.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: c.name, type: c.type, role: c.role, read: true, write: true, ...(c.desc ? { desc: c.desc } : {}) }),
        native: { cfgKey: c.cfgKey, actionOp: c.actionOp, resetIndex: c.resetIndex, preIndex: c.preIndex, autoSwitchKey: c.autoSwitchKey, did: did },
      });
    }

    for (const a of actionStates) {
      const path = `${did}.remote.${a.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: { name: a.name, type: 'string', role: 'text', read: true, write: true, def: JSON.stringify(a.in) },
        native: { siid: a.siid, aiid: a.aiid, did: did },
      });
      this.specActiosnToIdDict[did][`${a.siid}-${a.aiid}`] = path;
    }

    await this.extendObject(`${did}.remote.fetchMap`, {
      type: 'state',
      common: { name: 'Fetch Mower Map', type: 'boolean', role: 'button', read: false, write: true },
      native: {},
    });
    await this.extendObject(`${did}.remote.customCommand`, {
      type: 'state',
      common: { name: 'Send Custom Command', type: 'string', role: 'text', read: true, write: true },
      native: {},
    });
    await this.extendObject(`${did}.remote.generate-3dmap`, {
      type: 'state',
      common: { name: 'Generate 3D LIDAR Map', type: 'boolean', role: 'button', read: false, write: true },
      native: {},
    });
    await this.extendObject(`${did}.status.3dmap-url`, {
      type: 'state',
      common: { name: '3D Map Download URL', type: 'string', role: 'text.url', read: true, write: false, def: '' },
      native: {},
    });
    await this.extendObject(`${did}.status.3dmap-progress`, {
      type: 'state',
      common: { name: '3D Map Generation Progress (2-54)', type: 'number', role: 'value', read: true, write: false, unit: '%', def: 0 },
      native: {},
    });
    this.specPropsToIdDict[did]['2-54'] = `${did}.status.3dmap-progress`;

    await this.extendObject(`${did}.remote.request-wifi-map`, {
      type: 'state',
      common: { name: 'Request WiFi Signal Map', type: 'boolean', role: 'button', read: false, write: true },
      native: {},
    });
    await this.extendObject(`${did}.map.wifiMapImage`, {
      type: 'state',
      common: { name: 'WiFi Heatmap Image', type: 'string', role: 'state', read: true, write: false },
      native: {},
    });

    this.log.info(`Mower states created: ${statusStates.length} status, ${remoteStates.length} remote, ${actionStates.length} actions`);
  }
  async createVacuumRemotes(device) {
    const did = device.did;
    this.log.info(`Creating vacuum-specific states for ${device.model}`);

    const statusStates = [
      // SIID 2 - Robot Cleaner
      { id: 'state', name: 'Robot State (2-1)', siid: 2, piid: 1, type: 'number', role: 'value', states: DEVICE_STATUS_STATES.vacuum },
      { id: 'error', name: 'Error Code (2-2)', siid: 2, piid: 2, type: 'number', role: 'value' },
      // SIID 3 - Battery
      { id: 'battery-level', name: 'Battery Level (3-1)', siid: 3, piid: 1, type: 'number', role: 'value.battery', unit: '%' },
      { id: 'charging-status', name: 'Charging Status (3-2)', siid: 3, piid: 2, type: 'number', role: 'value', states: { 1: 'Charging', 2: 'Not charging', 3: 'Charging completed', 5: 'Return to charge' } },
      { id: 'off-peak-charging', name: 'Off-Peak Charging (3-3)', siid: 3, piid: 3, type: 'string', role: 'json' },
      // SIID 4 - Vacuum Extend (core)
      { id: 'status', name: 'Cleaning Status (4-1)', siid: 4, piid: 1, type: 'number', role: 'value', states: { 0: 'Idle', 1: 'Paused', 2: 'Cleaning', 3: 'Back home', 4: 'Part cleaning', 5: 'Follow wall', 6: 'Charging', 7: 'OTA', 10: 'Power off', 12: 'Error', 13: 'Remote control', 14: 'Sleeping', 17: 'Standby', 18: 'Segment cleaning', 19: 'Zone cleaning', 20: 'Spot cleaning', 21: 'Fast mapping', 22: 'Cruising path', 23: 'Cruising point', 24: 'Summon clean', 25: 'Shortcut', 26: 'Person follow' } },
      { id: 'cleaning-time', name: 'Cleaning Time (4-2)', siid: 4, piid: 2, type: 'number', role: 'value', unit: 'min' },
      { id: 'cleaned-area', name: 'Cleaned Area (4-3)', siid: 4, piid: 3, type: 'number', role: 'value', unit: 'm²' },
      { id: 'water-tank', name: 'Water Tank (4-6)', siid: 4, piid: 6, type: 'number', role: 'value', states: { 0: 'Not installed', 1: 'Installed', 10: 'Mop installed' } },
      { id: 'task-status', name: 'Task Status (4-7)', siid: 4, piid: 7, type: 'number', role: 'value', states: { 0: 'Completed', 1: 'Auto cleaning', 2: 'Zone cleaning', 3: 'Segment cleaning', 4: 'Spot cleaning', 5: 'Fast mapping', 6: 'Auto paused', 7: 'Zone paused', 8: 'Segment paused', 9: 'Spot paused' } },
      { id: 'serial-number', name: 'Serial Number (4-14)', siid: 4, piid: 14, type: 'string', role: 'text' },
      { id: 'mop-cleaning-remainder', name: 'Mop Cleaning Remainder (4-16)', siid: 4, piid: 16, type: 'number', role: 'value' },
      { id: 'cleaning-paused', name: 'Cleaning Paused (4-17)', siid: 4, piid: 17, type: 'number', role: 'value' },
      { id: 'faults', name: 'Faults (4-18)', siid: 4, piid: 18, type: 'string', role: 'text' },
      { id: 'nation-matched', name: 'Nation Matched (4-19)', siid: 4, piid: 19, type: 'string', role: 'text' },
      { id: 'relocation-status', name: 'Relocation Status (4-20)', siid: 4, piid: 20, type: 'number', role: 'value' },
      { id: 'self-wash-base-status', name: 'Self-Wash Base Status (4-25)', siid: 4, piid: 25, type: 'number', role: 'value' },
      { id: 'upload-map', name: 'Upload Map (4-24)', siid: 4, piid: 24, type: 'number', role: 'value' },
      { id: 'warn-status', name: 'Warning Status (4-35)', siid: 4, piid: 35, type: 'number', role: 'value' },
      { id: 'low-water-warning', name: 'Low Water Warning (4-41)', siid: 4, piid: 41, type: 'number', role: 'value' },
      { id: 'scheduled-clean', name: 'Scheduled Clean (4-47)', siid: 4, piid: 47, type: 'number', role: 'value' },
      { id: 'shortcuts', name: 'Shortcuts (4-48)', siid: 4, piid: 48, type: 'string', role: 'json' },
      { id: 'intelligent-recognition', name: 'Intelligent Recognition (4-49)', siid: 4, piid: 49, type: 'number', role: 'value' },
      { id: 'auto-switch-settings', name: 'Auto Switch Settings (4-50)', siid: 4, piid: 50, type: 'string', role: 'json' },
      { id: 'mop-in-station', name: 'Mop In Station (4-52)', siid: 4, piid: 52, type: 'number', role: 'value' },
      { id: 'mop-pad-installed', name: 'Mop Pad Installed (4-53)', siid: 4, piid: 53, type: 'number', role: 'value' },
      { id: 'task-type', name: 'Task Type (4-58)', siid: 4, piid: 58, type: 'number', role: 'value' },
      { id: 'drainage-status', name: 'Drainage Status (4-60)', siid: 4, piid: 60, type: 'number', role: 'value' },
      { id: 'cleaning-progress', name: 'Cleaning Progress (4-63)', siid: 4, piid: 63, type: 'number', role: 'value', unit: '%' },
      { id: 'drying-progress', name: 'Drying Progress (4-64)', siid: 4, piid: 64, type: 'number', role: 'value', unit: '%' },
      { id: 'device-capability', name: 'Device Capability (4-83)', siid: 4, piid: 83, type: 'number', role: 'value' },
      // SIID 5 - DND
      { id: 'dnd-task', name: 'DND Task Config (5-4)', siid: 5, piid: 4, type: 'string', role: 'json' },
      // SIID 6 - Map
      { id: 'multi-floor-map', name: 'Multi Floor Map (6-7)', siid: 6, piid: 7, type: 'number', role: 'value' },
      { id: 'map-list', name: 'Map List (6-8)', siid: 6, piid: 8, type: 'string', role: 'json' },
      { id: 'recovery-map-list', name: 'Recovery Map List (6-9)', siid: 6, piid: 9, type: 'string', role: 'json' },
      { id: 'map-recovery-status', name: 'Map Recovery Status (6-11)', siid: 6, piid: 11, type: 'number', role: 'value' },
      { id: 'map-backup-status', name: 'Map Backup Status (6-14)', siid: 6, piid: 14, type: 'number', role: 'value' },
      { id: 'wifi-map', name: 'WiFi Map (6-15)', siid: 6, piid: 15, type: 'string', role: 'text' },
      // SIID 7 - Audio (read-only)
      { id: 'voice-packet-id', name: 'Voice Pack (7-2)', siid: 7, piid: 2, type: 'string', role: 'text' },
      { id: 'voice-assistant', name: 'Voice Assistant (7-5)', siid: 7, piid: 5, type: 'number', role: 'value' },
      { id: 'voice-assistant-language', name: 'Voice Language (7-10)', siid: 7, piid: 10, type: 'string', role: 'text' },
      // SIID 8 - Schedule
      { id: 'timezone', name: 'Timezone (8-1)', siid: 8, piid: 1, type: 'string', role: 'text' },
      { id: 'schedule', name: 'Schedule (8-2)', siid: 8, piid: 2, type: 'string', role: 'json' },
      { id: 'cruise-schedule', name: 'Cruise Schedule (8-5)', siid: 8, piid: 5, type: 'string', role: 'text' },
      // SIID 9 - Main Brush
      { id: 'main-brush-time-left', name: 'Main Brush Time Left (9-1)', siid: 9, piid: 1, type: 'number', role: 'value', unit: 'h' },
      { id: 'main-brush-left', name: 'Main Brush Life Left (9-2)', siid: 9, piid: 2, type: 'number', role: 'value', unit: '%' },
      // SIID 10 - Side Brush
      { id: 'side-brush-time-left', name: 'Side Brush Time Left (10-1)', siid: 10, piid: 1, type: 'number', role: 'value', unit: 'h' },
      { id: 'side-brush-left', name: 'Side Brush Life Left (10-2)', siid: 10, piid: 2, type: 'number', role: 'value', unit: '%' },
      // SIID 11 - Filter
      { id: 'filter-left', name: 'Filter Life Left (11-1)', siid: 11, piid: 1, type: 'number', role: 'value', unit: '%' },
      { id: 'filter-time-left', name: 'Filter Time Left (11-2)', siid: 11, piid: 2, type: 'number', role: 'value', unit: 'h' },
      // SIID 12 - Statistics
      { id: 'first-cleaning-date', name: 'First Cleaning Date (12-1)', siid: 12, piid: 1, type: 'number', role: 'date' },
      { id: 'total-cleaning-time', name: 'Total Cleaning Time (12-2)', siid: 12, piid: 2, type: 'number', role: 'value', unit: 'min' },
      { id: 'cleaning-count', name: 'Cleaning Count (12-3)', siid: 12, piid: 3, type: 'number', role: 'value' },
      { id: 'total-cleaned-area', name: 'Total Cleaned Area (12-4)', siid: 12, piid: 4, type: 'number', role: 'value', unit: 'm²' },
      { id: 'total-runtime', name: 'Total Runtime (12-5)', siid: 12, piid: 5, type: 'number', role: 'value', unit: 'min' },
      { id: 'total-cruise-time', name: 'Total Cruise Time (12-6)', siid: 12, piid: 6, type: 'number', role: 'value', unit: 'min' },
      // SIID 15 - Auto Empty
      { id: 'dust-collection', name: 'Dust Collection Available (15-3)', siid: 15, piid: 3, type: 'number', role: 'value' },
      { id: 'auto-empty-status', name: 'Auto Empty Status (15-5)', siid: 15, piid: 5, type: 'number', role: 'value' },
      // SIID 16 - Sensor
      { id: 'sensor-dirty-left', name: 'Sensor Life Left (16-1)', siid: 16, piid: 1, type: 'number', role: 'value', unit: '%' },
      { id: 'sensor-dirty-time-left', name: 'Sensor Time Left (16-2)', siid: 16, piid: 2, type: 'number', role: 'value', unit: 'h' },
      // SIID 27 - Station Status
      { id: 'clean-water-tank-status', name: 'Clean Water Tank (27-1)', siid: 27, piid: 1, type: 'number', role: 'value', states: { 0: 'Installed', 1: 'Not installed', 2: 'Low water', 3: 'Not installed' } },
      { id: 'dirty-water-tank-status', name: 'Dirty Water Tank (27-2)', siid: 27, piid: 2, type: 'number', role: 'value', states: { 0: 'Installed', 1: 'Not installed or full' } },
      { id: 'dust-bag-status', name: 'Dust Bag (27-3)', siid: 27, piid: 3, type: 'number', role: 'value', states: { 0: 'Installed', 1: 'Not installed', 2: 'Check' } },
      { id: 'detergent-status', name: 'Detergent Status (27-4)', siid: 27, piid: 4, type: 'number', role: 'value' },
      { id: 'station-drainage-status', name: 'Station Drainage (27-5)', siid: 27, piid: 5, type: 'number', role: 'value' },
      { id: 'hot-water-status', name: 'Hot Water Status (27-15)', siid: 27, piid: 15, type: 'number', role: 'value' },
      // SIID 28 - Extended Settings (read-only)
      { id: 'lds-state', name: 'LDS State (28-4)', siid: 28, piid: 4, type: 'number', role: 'value' },
      { id: 'dnd-disable-resume', name: 'DND Disable Resume (28-14)', siid: 28, piid: 14, type: 'number', role: 'value' },
      { id: 'dnd-disable-auto-empty', name: 'DND Disable Auto Empty (28-15)', siid: 28, piid: 15, type: 'number', role: 'value' },
      { id: 'dnd-reduce-volume', name: 'DND Reduce Volume (28-16)', siid: 28, piid: 16, type: 'number', role: 'value' },
      { id: 'dynamic-obstacle-cleaning', name: 'Dynamic Obstacle Cleaning (28-18)', siid: 28, piid: 18, type: 'number', role: 'value' },
      { id: 'smart-mop-washing', name: 'Smart Mop Washing (28-22)', siid: 28, piid: 22, type: 'number', role: 'value' },
      { id: 'side-brush-carpet-rotate', name: 'Side Brush Carpet Rotate (28-29)', siid: 28, piid: 29, type: 'number', role: 'value' },
      // SIID 30 - Wheel
      { id: 'wheel-dirty-time-left', name: 'Wheel Time Left (30-1)', siid: 30, piid: 1, type: 'number', role: 'value', unit: 'h' },
      { id: 'wheel-dirty-left', name: 'Wheel Life Left (30-2)', siid: 30, piid: 2, type: 'number', role: 'value', unit: '%' },
      // SIID 10001 - Camera
      { id: 'camera-light-brightness', name: 'Camera Light Brightness (10001-9)', siid: 10001, piid: 9, type: 'string', role: 'text' },
      // AutoSwitch parsed values (no siid/piid, populated via parseVacuumAutoSwitch)
      { id: 'auto-drying', name: 'Auto Drying (AutoDry)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'collision-avoidance', name: 'Collision Avoidance (LessColl)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'fill-light', name: 'Fill Light (FillinLight)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'stain-avoidance', name: 'Stain Avoidance (StainIdentify)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'mopping-type', name: 'Mopping Type (CleanType)', type: 'number', role: 'value', desc: '0=Daily, 1=Accurate, 2=Deep' },
      { id: 'clean-genius', name: 'CleanGenius (SmartHost)', type: 'number', role: 'value', desc: '0=Off, 1=Routine, 2=Deep' },
      { id: 'cleaning-route', name: 'Cleaning Route (CleanRoute)', type: 'number', role: 'value', desc: '1=Standard, 2=Intensive, 3=Deep, 4=Quick' },
      { id: 'wider-corner', name: 'Wider Corner Coverage (MeticulousTwist)', type: 'number', role: 'value', desc: '0=Off, 1=HighFreq, -7=LowFreq' },
      { id: 'floor-direction', name: 'Floor Direction Cleaning (MaterialDirectionClean)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'pet-focused', name: 'Pet Focused Cleaning (PetPartClean)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'auto-recleaning', name: 'Auto Re-Cleaning (SmartAutoMop)', type: 'number', role: 'value', desc: '-1=disabled, 0=off, 1=on' },
      { id: 'auto-rewashing', name: 'Auto Re-Washing (SmartAutoWash)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'max-suction', name: 'Max Suction Power (SuctionMax)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'smart-drying', name: 'Smart Drying (SmartDrying)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'hot-washing', name: 'Hot Washing (HotWash)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'uv-sterilization', name: 'UV Sterilization (UVLight)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'custom-mopping-mode', name: 'Custom Mopping Mode (MopEffectSwitch)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'self-clean-frequency', name: 'Self-Clean Frequency (BackWashType)', type: 'number', role: 'value', desc: '0=Per room, 1=Standard, 2=High' },
      { id: 'intensive-carpet', name: 'Intensive Carpet Cleaning (CarpetFineClean)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'gap-cleaning-extension', name: 'Gap Cleaning Extension (LacuneMopScalable)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'mopping-under-furniture', name: 'Mopping Under Furniture (MopScalable2)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'ultra-clean-mode', name: 'Ultra Clean Mode (SuperWash)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'mop-extend', name: 'Mop Extend (MopExtrSwitch)', type: 'number', role: 'value', desc: '0=off, 1=on' },
      { id: 'mop-extend-frequency', name: 'Mop Extend Frequency (ExtrFreq)', type: 'number', role: 'value', desc: '1=Low, 2=High' },
      { id: 'smart-charging', name: 'Smart Charging (SmartCharge)', type: 'number', role: 'value', desc: '0=off, 1=on' },
    ];

    const remoteStates = [
      // SIID 4 - Vacuum settings
      { id: 'suction-level', name: 'Suction Level (4-4)', siid: 4, piid: 4, type: 'number', role: 'level', states: { 0: 'Quiet', 1: 'Standard', 2: 'Strong', 3: 'Turbo' } },
      { id: 'water-volume', name: 'Water Volume (4-5)', siid: 4, piid: 5, type: 'number', role: 'level', states: { 1: 'Low', 2: 'Medium', 3: 'High' } },
      { id: 'cleaning-mode', name: 'Cleaning Mode (4-23)', siid: 4, piid: 23, type: 'number', role: 'level', states: { 0: 'Sweeping', 1: 'Mopping', 2: 'Sweep+Mop', 3: 'Mop after sweep' } },
      { id: 'resume-cleaning', name: 'Resume Cleaning (4-11)', siid: 4, piid: 11, type: 'number', role: 'switch' },
      { id: 'carpet-boost', name: 'Carpet Boost (4-12)', siid: 4, piid: 12, type: 'number', role: 'switch' },
      { id: 'obstacle-avoidance', name: 'Obstacle Avoidance (4-21)', siid: 4, piid: 21, type: 'number', role: 'switch' },
      { id: 'ai-detection', name: 'AI Detection (4-22)', siid: 4, piid: 22, type: 'number', role: 'value' },
      { id: 'customized-cleaning', name: 'Customized Cleaning (4-26)', siid: 4, piid: 26, type: 'number', role: 'switch' },
      { id: 'child-lock', name: 'Child Lock (4-27)', siid: 4, piid: 27, type: 'number', role: 'switch' },
      { id: 'carpet-sensitivity', name: 'Carpet Sensitivity (4-28)', siid: 4, piid: 28, type: 'number', role: 'level', states: { 1: 'Low', 2: 'Medium', 3: 'High' } },
      { id: 'tight-mopping', name: 'Tight Mopping (4-29)', siid: 4, piid: 29, type: 'number', role: 'switch' },
      { id: 'carpet-recognition', name: 'Carpet Recognition (4-33)', siid: 4, piid: 33, type: 'number', role: 'switch' },
      { id: 'self-clean', name: 'Self Clean (4-34)', siid: 4, piid: 34, type: 'number', role: 'switch' },
      { id: 'carpet-cleaning', name: 'Carpet Cleaning Mode (4-36)', siid: 4, piid: 36, type: 'number', role: 'level', states: { 0: 'Avoid', 1: 'Adapt', 2: 'Ignore' } },
      { id: 'auto-add-detergent', name: 'Auto Add Detergent (4-37)', siid: 4, piid: 37, type: 'number', role: 'switch' },
      { id: 'drying-time', name: 'Drying Time (4-40)', siid: 4, piid: 40, type: 'number', role: 'level', states: { 2: '2h', 3: '3h', 4: '4h' } },
      { id: 'auto-mount-mop', name: 'Auto Mount Mop (4-45)', siid: 4, piid: 45, type: 'number', role: 'switch' },
      { id: 'mop-wash-level', name: 'Mop Wash Level (4-46)', siid: 4, piid: 46, type: 'number', role: 'level' },
      { id: 'auto-water-refilling', name: 'Auto Water Refilling (4-51)', siid: 4, piid: 51, type: 'number', role: 'switch' },
      // SIID 5 - DND
      { id: 'dnd-enable', name: 'Do Not Disturb (5-1)', siid: 5, piid: 1, type: 'boolean', role: 'switch' },
      { id: 'dnd-start', name: 'DND Start Time (5-2)', siid: 5, piid: 2, type: 'string', role: 'text' },
      { id: 'dnd-end', name: 'DND End Time (5-3)', siid: 5, piid: 3, type: 'string', role: 'text' },
      // SIID 7 - Volume
      { id: 'volume', name: 'Volume (7-1)', siid: 7, piid: 1, type: 'number', role: 'level.volume' },
      // SIID 15 - Auto Empty
      { id: 'auto-dust-collecting', name: 'Auto Dust Collecting (15-1)', siid: 15, piid: 1, type: 'number', role: 'switch' },
      { id: 'auto-empty-frequency', name: 'Auto Empty Frequency (15-2)', siid: 15, piid: 2, type: 'number', role: 'level' },
      // SIID 28 - Extended Settings (writable)
      { id: 'wetness-level', name: 'Wetness Level (28-1)', siid: 28, piid: 1, type: 'number', role: 'level' },
      { id: 'clean-carpets-first', name: 'Clean Carpets First (28-2)', siid: 28, piid: 2, type: 'number', role: 'switch' },
      { id: 'auto-lds-coverage', name: 'Auto LDS Coverage (28-3)', siid: 28, piid: 3, type: 'number', role: 'switch' },
      { id: 'cleangenius-mode', name: 'CleanGenius Mode (28-5)', siid: 28, piid: 5, type: 'number', role: 'level', states: { 0: 'Off', 1: 'Routine', 2: 'Deep' } },
      { id: 'water-temperature', name: 'Water Temperature (28-8)', siid: 28, piid: 8, type: 'number', role: 'level', states: { 0: 'Cold', 1: 'Warm', 2: 'Hot', 3: 'Boiling' } },
      { id: 'silent-drying', name: 'Silent Drying (28-27)', siid: 28, piid: 27, type: 'number', role: 'switch' },
      { id: 'hair-compression', name: 'Hair Compression (28-28)', siid: 28, piid: 28, type: 'number', role: 'switch' },
      { id: 'mopping-with-detergent', name: 'Mopping With Detergent (28-52)', siid: 28, piid: 52, type: 'number', role: 'switch' },
    ];

    // AutoSwitch SET commands (set_properties siid:4 piid:50)
    const autoSwitchRemotes = [
      { id: 'set-auto-drying', name: 'Set Auto Drying', autoSwitchKey: 'AutoDry', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-collision-avoidance', name: 'Set Collision Avoidance', autoSwitchKey: 'LessColl', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-fill-light', name: 'Set Fill Light', autoSwitchKey: 'FillinLight', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-stain-avoidance', name: 'Set Stain Avoidance', autoSwitchKey: 'StainIdentify', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-mopping-type', name: 'Set Mopping Type', autoSwitchKey: 'CleanType', type: 'number', role: 'value', desc: '0=Daily, 1=Accurate, 2=Deep' },
      { id: 'set-clean-genius', name: 'Set CleanGenius', autoSwitchKey: 'SmartHost', type: 'number', role: 'value', desc: '0=Off, 1=Routine, 2=Deep' },
      { id: 'set-cleaning-route', name: 'Set Cleaning Route', autoSwitchKey: 'CleanRoute', type: 'number', role: 'value', desc: '1=Standard, 2=Intensive, 3=Deep, 4=Quick' },
      { id: 'set-wider-corner', name: 'Set Wider Corner Coverage', autoSwitchKey: 'MeticulousTwist', type: 'number', role: 'value', desc: '0=Off, 1=HighFreq, -7=LowFreq' },
      { id: 'set-floor-direction', name: 'Set Floor Direction Cleaning', autoSwitchKey: 'MaterialDirectionClean', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-pet-focused', name: 'Set Pet Focused Cleaning', autoSwitchKey: 'PetPartClean', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-smart-charging', name: 'Set Smart Charging', autoSwitchKey: 'SmartCharge', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-hot-washing', name: 'Set Hot Washing', autoSwitchKey: 'HotWash', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-uv-sterilization', name: 'Set UV Sterilization', autoSwitchKey: 'UVLight', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-max-suction', name: 'Set Max Suction Power', autoSwitchKey: 'SuctionMax', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-ultra-clean', name: 'Set Ultra Clean Mode', autoSwitchKey: 'SuperWash', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-mop-extend', name: 'Set Mop Extend', autoSwitchKey: 'MopExtrSwitch', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-self-clean-frequency', name: 'Set Self-Clean Frequency', autoSwitchKey: 'BackWashType', type: 'number', role: 'value', desc: '0=Per room, 1=Standard, 2=High' },
      { id: 'set-intensive-carpet', name: 'Set Intensive Carpet Cleaning', autoSwitchKey: 'CarpetFineClean', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-gap-cleaning', name: 'Set Gap Cleaning Extension', autoSwitchKey: 'LacuneMopScalable', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-mopping-under-furniture', name: 'Set Mopping Under Furniture', autoSwitchKey: 'MopScalable2', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-smart-drying', name: 'Set Smart Drying', autoSwitchKey: 'SmartDrying', type: 'number', role: 'switch', desc: '0=off, 1=on' },
      { id: 'set-custom-mopping', name: 'Set Custom Mopping Mode', autoSwitchKey: 'MopEffectSwitch', type: 'number', role: 'switch', desc: '0=off, 1=on' },
    ];

    const actionStates = [
      { id: 'start-clean', name: 'Start Cleaning (2-1)', siid: 2, aiid: 1, in: [] },
      { id: 'pause', name: 'Pause Cleaning (2-2)', siid: 2, aiid: 2, in: [] },
      { id: 'return-to-dock', name: 'Return to Dock (3-1)', siid: 3, aiid: 1, in: [] },
      { id: 'start-custom-clean', name: 'Start Custom Clean (4-1)', siid: 4, aiid: 1, in: [{ piid: 1, value: 18 }], desc: 'Default: segment clean. Override "in" for zone/spot cleaning' },
      { id: 'stop', name: 'Stop Cleaning (4-2)', siid: 4, aiid: 2, in: [] },
      { id: 'clear-warning', name: 'Clear Warning (4-3)', siid: 4, aiid: 3, in: [] },
      { id: 'start-washing', name: 'Start Mop Washing (4-4)', siid: 4, aiid: 4, in: [] },
      { id: 'locate', name: 'Locate Robot (7-1)', siid: 7, aiid: 1, in: [] },
      { id: 'start-auto-empty', name: 'Start Auto Empty (15-1)', siid: 15, aiid: 1, in: [] },
      // Consumable resets
      { id: 'reset-main-brush', name: 'Reset Main Brush (9-1)', siid: 9, aiid: 1, in: [] },
      { id: 'reset-side-brush', name: 'Reset Side Brush (10-1)', siid: 10, aiid: 1, in: [] },
      { id: 'reset-filter', name: 'Reset Filter (11-1)', siid: 11, aiid: 1, in: [] },
      { id: 'reset-sensor', name: 'Reset Sensor (16-1)', siid: 16, aiid: 1, in: [] },
    ];

    await this.extendObject(did + '.status', { type: 'channel', common: { name: 'Vacuum Status' }, native: {} });
    await this.extendObject(did + '.remote', { type: 'channel', common: { name: 'Vacuum Remote' }, native: {} });

    for (const s of statusStates) {
      const path = `${did}.status.${s.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: s.name, type: s.type, role: s.role, read: true, write: false, unit: s.unit || '', ...(s.states ? { states: s.states } : {}), ...(s.desc ? { desc: s.desc } : {}) }),
        native: { siid: s.siid, piid: s.piid, did: did },
      });
      if (s.siid && s.piid) {
        this.specPropsToIdDict[did][`${s.siid}-${s.piid}`] = path;
        this.specStatusDict[did].push({ did: did, siid: s.siid, code: 0, piid: s.piid, updateTime: 0 });
      }
    }

    for (const r of remoteStates) {
      const path = `${did}.remote.${r.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: r.name, type: r.type, role: r.role, read: true, write: true, ...(r.states ? { states: r.states } : {}) }),
        native: { siid: r.siid, piid: r.piid, did: did },
      });
      this.specPropsToIdDict[did][`${r.siid}-${r.piid}`] = path;
    }

    for (const c of autoSwitchRemotes) {
      const path = `${did}.remote.${c.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: c.name, type: c.type, role: c.role, read: true, write: true, ...(c.desc ? { desc: c.desc } : {}) }),
        native: { autoSwitchKey: c.autoSwitchKey, did: did },
      });
    }

    for (const a of actionStates) {
      const path = `${did}.remote.${a.id}`;
      await this.extendObject(path, {
        type: 'state',
        common: /** @type {any} */ ({ name: a.name, type: 'string', role: 'text', read: true, write: true, def: JSON.stringify(a.in), ...(a.desc ? { desc: a.desc } : {}) }),
        native: { siid: a.siid, aiid: a.aiid, did: did },
      });
      this.specActiosnToIdDict[did][`${a.siid}-${a.aiid}`] = path;
    }

    await this.extendObject(`${did}.remote.fetchMap`, {
      type: 'state',
      common: { name: 'Fetch Vacuum Map', type: 'boolean', role: 'button', read: false, write: true },
      native: {},
    });
    await this.extendObject(`${did}.remote.customCommand`, {
      type: 'state',
      common: { name: 'Send Custom Command', type: 'string', role: 'text', read: true, write: true },
      native: {},
    });

    this.log.info(`Vacuum states created: ${statusStates.length} status, ${remoteStates.length} remote, ${autoSwitchRemotes.length} autoSwitch, ${actionStates.length} actions`);
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
    if (this.isMower(device)) {
      await this.createMowerRemotes(device);
      return;
    }
    if (this.isVacuum(device)) {
      await this.createVacuumRemotes(device);
      return;
    }
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
        const propertyNameMap = this.isMower(device)
          ? { ...PROPERTY_NAME_MAP, ...MOWER_PROPERTY_NAME_MAP }
          : PROPERTY_NAME_MAP;
        let piid = 0;
        for (const property of service.properties) {
          if (property.iid) {
            piid = property.iid;
          } else {
            piid++;
          }
          const siidPiid = `${siid}-${piid}`;
          if (this.isMower(device)) {
            const mowerAllowProps = [
              '2-1', '2-2', '2-3',
              '3-1', '3-2',
              '4-1', '4-2', '4-3', '4-7', '4-14', '4-18', '4-21', '4-22', '4-23', '4-26', '4-27', '4-30', '4-35',
              '5-1', '5-2', '5-3',
              '8-1', '8-2', '8-3', '8-4',
              '12-1', '12-2', '12-3', '12-4',
            ];
            if (!mowerAllowProps.includes(siidPiid)) {
              this.log.debug(`Skipping property ${siidPiid} for mower (not in whitelist)`);
              continue;
            }
          }
          const remote = {
            siid: siid,
            piid: piid,
            did: device.did,
            model: device.model,
            name: propertyNameMap[siidPiid] ? propertyNameMap[siidPiid] + ' ' + siidPiid : service.description + ' - ' + property.description + ' ' + siidPiid,
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
            if (!this.isMower(device) || remote.siid <= 3) {
              this.specStatusDict[device.did].push({
                did: device.did,
                siid: remote.siid,
                code: 0,
                piid: remote.piid,
                updateTime: 0,
              });
            }
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
      if (this.config.getMap && !this.isMower(device)) {
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
            url: `https://${this.brand.domain}/dreame-iot-com-${this.brand.iotComPrefix}/device/sendCommand`,
            headers: this.getHeaders(),
            data: data,
          })
            .then(async (res) => {
              if (res.data.code !== 0) {
                if (res.data.code === -8 || res.data.code === 80001) {
                  this.log.debug(
                    `Error getting spec update for ${device.name || device.model} (${device.did}) with ${JSON.stringify(data)}`,
                  );

                  this.log.debug(JSON.stringify(res.data));
                  return;
                }
                this.log.info(
                  `Error getting spec update for ${device.name || device.model} (${device.did}) with ${JSON.stringify(data)}`,
                );
                this.log.debug(JSON.stringify(res.data));
                return;
              }
              this.log.debug(JSON.stringify(res.data));
              for (const element of res.data.data.result) {
                const path = this.specPropsToIdDict[device.did][element.siid + '-' + element.piid];
                if (path) {
                  this.log.debug(`Set ${path} to ${typeof element.value === 'object' ? JSON.stringify(element.value) : element.value}`);
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
    const url = (this.deviceArray[0] && this.deviceArray[0].bindDomain) || this.brand.mqttFallback;
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
        const messageDid = String(message.did || message.data.did || '');
        for (const element of message.data.params) {
          const did = String(element.did || messageDid);
          if (!this.specPropsToIdDict[did]) {
            this.log.debug(`No spec found for ${did}`);
            continue;
          }
          if (JSON.stringify(element.siid) === '6' && JSON.stringify(element.piid) === '1') {
            //this.log.info(' Map data:' + JSON.stringify(element.value));
            if (this.config.getMap || this.firstStart) {
              this.firstStart = false;
              const encode = JSON.stringify(element.value);
              const mappath = `${did}` + '.map.';
              this.setMapInfos(encode, mappath);
            }
          }
          const device = this.deviceArray.find((d) => String(d.did) === did);
          if (this.isMower(device) && element.siid === 1 && element.piid === 4) {
            if (Array.isArray(element.value) && element.value.length >= 7) {
              const buf = Buffer.from(element.value);
              if (buf[0] !== 0xce) continue;
              const x = (buf[3] << 28 | buf[2] << 20 | buf[1] << 12) >> 12;
              const y = (buf[5] << 24 | buf[4] << 16 | buf[3] << 8) >> 12;
              const angle = buf.length > 6 ? Number((buf[6] / 255 * 360).toFixed(2)) : 0;
              this.mowerRobotPos = this.mowerRobotPos || {};
              this.mowerRobotPos[did] = { x: x * 10, y: y * 10, angle };
              const basePath = `${did}.status`;
              await this.extendObject(basePath + '.robot-position', {
                type: 'state',
                common: { name: 'Robot Position (1-4 B1-6)', type: 'string', role: 'json', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.robot-position', JSON.stringify({ x: x * 10, y: y * 10, angle }), true);
              if (buf.length >= 32) {
                const task = buf.slice(22, 32);
                const regionId = task[0];
                const taskId = task[1];
                const percent = (task[3] << 8 | task[2]) / 100;
                const total = (task[6] << 16 | task[5] << 8 | task[4]) / 100;
                const finish = (task[9] << 16 | task[8] << 8 | task[7]) / 100;
                await this.extendObject(basePath + '.mowing-progress', {
                  type: 'state',
                  common: { name: 'Mowing Progress (1-4 B22-31)', type: 'number', role: 'value', unit: '%', read: true, write: false },
                  native: {},
                });
                this.setState(basePath + '.mowing-progress', percent, true);
                await this.extendObject(basePath + '.mowed-area', {
                  type: 'state',
                  common: { name: 'Mowed Area (1-4 B29-31)', type: 'number', role: 'value', unit: 'm²', read: true, write: false },
                  native: {},
                });
                this.setState(basePath + '.mowed-area', finish, true);
                await this.extendObject(basePath + '.total-mow-area-task', {
                  type: 'state',
                  common: { name: 'Total Area to Mow (1-4 B26-28)', type: 'number', role: 'value', unit: 'm²', read: true, write: false },
                  native: {},
                });
                this.setState(basePath + '.total-mow-area-task', total, true);
                await this.extendObject(basePath + '.mowing-task', {
                  type: 'state',
                  common: { name: 'Mowing Task Info (1-4 B22-31)', type: 'string', role: 'json', read: true, write: false },
                  native: {},
                });
                this.setState(basePath + '.mowing-task', JSON.stringify({ regionId, taskId, percent, total, finish }), true);
              }
            }
            continue;
          }
          if (this.isMower(device) && element.siid === 1 && element.piid === 1) {
            if (Array.isArray(element.value) && element.value.length >= 20) {
              const buf = Buffer.from(element.value);
              if (buf[0] !== 0xce || buf[19] !== 0xce) continue;
              const errorCode = buf.readUInt32LE(1);
              const battery = buf[11] & 0x7f;
              const chargingLive = (buf[11] & 0x80) >> 7;
              const robotState = buf[14];
              const locationState = robotState & 3;
              const dockingState = (robotState & 28) >> 2;
              const pinState = (robotState & 32) >> 5;
              const unDocking = (robotState & 64) >> 6;
              const cameraState = (robotState & 128) >> 7;
              const wifiRssi = buf[17] > 127 ? buf[17] - 256 : buf[17];
              const lteRssi = buf[18] > 127 ? buf[18] - 256 : buf[18];
              const bleRssi = buf[16] > 127 ? buf[16] - 256 : buf[16];
              const DockingNames = ['IN_STATION', 'OUT_OF_STATION', 'PAUSE_DOCKING', 'FINISH_DOCKING', 'DOCKING_FAILED', 'DOCKING_IN_BASE'];
              const basePath = `${did}.status`;
              if (dockingState === 0 && this.mowerRobotPos && this.mowerRobotPos[did]) {
                this.mowerDockPos = this.mowerDockPos || {};
                this.mowerDockPos[did] = { ...this.mowerRobotPos[did] };
                await this.extendObject(basePath + '.dock-position', {
                  type: 'state',
                  common: { name: 'Dock Position (1-1 inferred)', type: 'string', role: 'json', read: true, write: false },
                  native: {},
                });
                this.setState(basePath + '.dock-position', JSON.stringify(this.mowerDockPos[did]), true);
              }
              await this.extendObject(basePath + '.docking-state', {
                type: 'state',
                common: { name: 'Docking State (1-1 B14.2-4)', type: 'string', role: 'text', read: true, write: false, states: { 0: 'IN_STATION', 1: 'OUT_OF_STATION', 2: 'PAUSE_DOCKING', 3: 'FINISH_DOCKING', 4: 'DOCKING_FAILED', 5: 'DOCKING_IN_BASE' } },
                native: {},
              });
              this.setState(basePath + '.docking-state', DockingNames[dockingState] || String(dockingState), true);
              await this.extendObject(basePath + '.location-state', {
                type: 'state',
                common: { name: 'Location State (1-1 B14.0-1)', type: 'number', role: 'value', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.location-state', locationState, true);
              await this.extendObject(basePath + '.pin-state', {
                type: 'state',
                common: { name: 'Pin State (1-1 B14.5)', type: 'number', role: 'value', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.pin-state', pinState, true);
              await this.extendObject(basePath + '.undocking', {
                type: 'state',
                common: { name: 'Undocking (1-1 B14.6)', type: 'number', role: 'value', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.undocking', unDocking, true);
              await this.extendObject(basePath + '.camera-state', {
                type: 'state',
                common: { name: 'Camera State (1-1 B14.7)', type: 'number', role: 'value', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.camera-state', cameraState, true);
              await this.extendObject(basePath + '.error-code-binary', {
                type: 'state',
                common: { name: 'Error Code Binary (1-1 B1-4)', type: 'number', role: 'value', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.error-code-binary', errorCode, true);
              await this.extendObject(basePath + '.battery-level-live', {
                type: 'state',
                common: { name: 'Battery Level Live (1-1 B13)', type: 'number', role: 'value.battery', unit: '%', read: true, write: false },
                native: {},
              });
              if (battery <= 100) {
                this.setState(basePath + '.battery-level-live', battery, true);
              }
              await this.extendObject(basePath + '.charging-live', {
                type: 'state',
                common: { name: 'Charging Live (1-1 B13.7)', type: 'number', role: 'value', read: true, write: false, states: { 0: 'Not Charging', 1: 'Charging' } },
                native: {},
              });
              this.setState(basePath + '.charging-live', chargingLive, true);
              await this.extendObject(basePath + '.wifi-rssi', {
                type: 'state',
                common: { name: 'WiFi RSSI (1-1 B17)', type: 'number', role: 'value', unit: 'dBm', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.wifi-rssi', wifiRssi, true);
              await this.extendObject(basePath + '.lte-rssi', {
                type: 'state',
                common: { name: 'LTE RSSI (1-1 B18)', type: 'number', role: 'value', unit: 'dBm', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.lte-rssi', lteRssi, true);
              await this.extendObject(basePath + '.ble-rssi', {
                type: 'state',
                common: { name: 'BLE RSSI (1-1 B16)', type: 'number', role: 'value', unit: 'dBm', read: true, write: false },
                native: {},
              });
              this.setState(basePath + '.ble-rssi', bleRssi, true);
            }
            continue;
          }
          if (this.isMower(device) && element.siid === 1) {
            continue;
          }
          if (this.isMower(device) && element.siid === 99 && element.piid === 20) {
            this.log.info('3D map upload complete for ' + did);
            await this.setState(did + '.status.3dmap-progress', 100, true);
            this.fetch3DMapUrl(device);
            continue;
          }
          if (this.isMower(device) && element.siid === 2 && element.piid === 1) {
            const mowingStates = [1, 3, 5, 11];
            const isMowing = mowingStates.includes(element.value);
            if (isMowing && !this.mowerMapInterval) {
              this.log.info(`Mower ${did} started mowing (status=${element.value}), starting map polling`);
              this.getMowerMap(device);
              this.mowerMapInterval = setInterval(() => {
                this.getMowerMap(device);
              }, 30 * 1000);
            } else if (!isMowing && this.mowerMapInterval) {
              this.log.info(`Mower ${did} stopped mowing (status=${element.value}), stopping map polling`);
              clearInterval(this.mowerMapInterval);
              this.mowerMapInterval = null;
              this.getMowerMap(device);
              setTimeout(() => this.loadMowerHistory(device), 5000);
            }
          }
          // Plugin: prop.2.51 triggers loadSettingData() → getCFG() (L181455-181457)
          if (this.isMower(device) && element.siid === 2 && element.piid === 51) {
            this.loadMowerSettings(device);
          }
          // AutoSwitch (4-50): parse JSON flags into individual states
          if (this.isMower(device) && element.siid === 4 && element.piid === 50) {
            this.parseAutoSwitch(did, element.value);
          }
          if (this.isVacuum(device) && element.siid === 4 && element.piid === 50) {
            this.parseVacuumAutoSwitch(did, element.value);
          }
          // Shortcuts (4-48): parse base64 names and running state
          if (this.isMower(device) && element.siid === 4 && element.piid === 48) {
            this.parseShortcuts(did, element.value);
          }
          let path = this.specPropsToIdDict[did][element.siid + '-' + element.piid];
          if (!path) {
            this.log.debug(`No path found for ${did} ${element.siid}-${element.piid}`);
            path = `${did}.status.${element.siid}-${element.piid}`;
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
            path = `${did}.remote.${element.siid}-${element.piid}`;
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
                did: did,
              },
            });
          }
          if (path) {
            this.log.debug(`Set ${path} to ${typeof element.value === 'object' ? JSON.stringify(element.value) : element.value}`);
            if (element.value != null) {
              const val = typeof element.value === 'object' ? JSON.stringify(element.value) : element.value;
              this.setState(path, val, true);
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
                    const did = In_path.split('.')[0];
                    const cleansetDevice = this.deviceArray.find((d) => String(d.did) === String(did));
                    const isMowerDevice = this.isMower(cleansetDevice);
                    for (let i = 0; i < Subvalue.length; i += 1) {
                      //1: DreameLevel, 2: DreameWaterVolume, 3: DreameRepeat, 4: DreameRoomNumber, 5: DreameCleaningMode, 6: Route
                      //map-req[{"piid": 2,"value": "{\"req_type\":1,\"frame_type\":I,\"force_type\":1}"}]
                      let pathMap = In_path + key + '.' + Subkey + '.RoomSettings';
                      this.getType(JSON.stringify(Subvalue), pathMap);
                      this.setState(pathMap, JSON.stringify(Subvalue), true);
                      pathMap = In_path + key + '.' + Subkey + '.RoomOrder';
                      this.getType(parseFloat(Subvalue[3]), pathMap);
                      this.setState(pathMap, parseFloat(Subvalue[3]), true);
                      if (!isMowerDevice) {
                        pathMap = In_path + key + '.' + Subkey + '.Level';
                        this.setcleansetPath(pathMap, DreameLevel);
                        this.setState(pathMap, Subvalue[0], true);
                        pathMap = In_path + key + '.' + Subkey + '.CleaningMode';
                        this.setcleansetPath(pathMap, DreameCleaningMode);
                        this.setState(pathMap, Subvalue[4], true);
                        pathMap = In_path + key + '.' + Subkey + '.WaterVolume';
                        this.setcleansetPath(pathMap, DreameWaterVolume);
                        this.setState(pathMap, Subvalue[1], true);
                      }
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

      const toPixelX = (wx) => (wx - multiMap.x) / multiMap.gridWidth;
      const toPixelY = (wy) => (wy - multiMap.y) / multiMap.gridWidth;

      // Draw virtual walls (vw.line) as red lines
      if (multiMap.vw) {
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        for (const key in multiMap.vw) {
          const items = multiMap.vw[key];
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (!Array.isArray(item) || item.length < 4) continue;
            if (key === 'line' || key === 'cliff') {
              ctx.beginPath();
              ctx.moveTo(toPixelX(item[0]), toPixelY(item[1]));
              ctx.lineTo(toPixelX(item[2]), toPixelY(item[3]));
              ctx.stroke();
            } else {
              const x1 = toPixelX(Math.min(item[0], item[2]));
              const y1 = toPixelY(Math.min(item[1], item[3]));
              const x2 = toPixelX(Math.max(item[0], item[2]));
              const y2 = toPixelY(Math.max(item[1], item[3]));
              ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            }
          }
        }
      }

      // Draw no-go zones (vws) as red dashed rectangles
      if (multiMap.vws) {
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const key in multiMap.vws) {
          const items = multiMap.vws[key];
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (!Array.isArray(item) || item.length < 4) continue;
            const x1 = toPixelX(Math.min(item[0], item[2]));
            const y1 = toPixelY(Math.min(item[1], item[3]));
            const x2 = toPixelX(Math.max(item[0], item[2]));
            const y2 = toPixelY(Math.max(item[1], item[3]));
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          }
        }
        ctx.setLineDash([]);
      }

      // Draw zone names
      if (multiMap.areaInfo) {
        const fontSize = Math.max(8, Math.min(multiMap.width, multiMap.height) * 0.03);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const key in multiMap.areaInfo) {
          const area = multiMap.areaInfo[key];
          if (!area || area.centerX == null || area.centerY == null) continue;
          const label = (area.areaName) || ('Zone' + key);
          const px = toPixelX(area.centerX);
          const py = toPixelY(area.centerY);
          ctx.fillText(label, px, py);
        }
      }

      // Draw charger position (green)
      if (multiMap.chargerPos) {
        const cx = toPixelX(multiMap.chargerPos.x);
        const cy = toPixelY(multiMap.chargerPos.y);
        const r = Math.max(3, Math.min(multiMap.width, multiMap.height) * 0.015);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#00FF00';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      }

      // Draw robot position (blue)
      if (multiMap.robotPos) {
        const rx = toPixelX(multiMap.robotPos.x);
        const ry = toPixelY(multiMap.robotPos.y);
        const r = Math.max(3, Math.min(multiMap.width, multiMap.height) * 0.015);
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.fillStyle = '#00AAFF';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      }

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

  reassembleChunks(data, prefix) {
    const totalSize = parseInt(data[`${prefix}.info`] || '0', 10);
    if (!totalSize) return '';
    let result = '';
    for (let i = 0; ; i++) {
      const key = `${prefix}.${i}`;
      if (data[key] === undefined) break;
      result += data[key];
      if (result.length >= totalSize) break;
    }
    return result.substring(0, totalSize);
  }

  async getMowerMap(device) {
    try {
      const response = await this.requestClient({
        method: 'post',
        url: `https://${this.brand.domain}/dreame-user-iot/iotuserdata/getDeviceData`,
        headers: this.getHeaders(),
        data: { did: device.did },
      });

      if (!response.data || response.data.code !== 0 || !response.data.data) {
        this.log.debug('No mower userdata: ' + JSON.stringify(response.data));
        return;
      }
      const userData = response.data.data;
      this.log.debug('Mower userData keys: ' + JSON.stringify(Object.keys(userData)));

      const basePath = device.did + '.map';
      await this.extendObject(basePath, {
        type: 'channel',
        common: { name: 'Mower Map Data' },
        native: {},
      });

      // Canvas rendering
      let parsedMapData = null;
      let parsedPathData = null;

      // MAP data
      const mapRaw = this.reassembleChunks(userData, 'MAP');
      if (mapRaw) {
        try {
          parsedMapData = JSON.parse(mapRaw);
          const mapData = parsedMapData;
          for (let slotIdx = 0; slotIdx < mapData.length; slotIdx++) {
            const entry = typeof mapData[slotIdx] === 'string' ? JSON.parse(mapData[slotIdx]) : mapData[slotIdx];
            this.log.debug('Mower MAP entry keys: ' + JSON.stringify(Object.keys(entry)));
            const slotPath = basePath + '.slot' + slotIdx;
            await this.extendObject(slotPath, {
              type: 'channel',
              common: { name: 'Map Slot ' + slotIdx },
              native: {},
            });

            if (entry.totalArea != null) {
              await this.setObjectAndState(slotPath + '.totalArea', 'Total Area', 'number', 'value', entry.totalArea);
            }
            if (entry.boundary) {
              await this.setObjectAndState(slotPath + '.boundary', 'Boundary', 'string', 'json', JSON.stringify(entry.boundary));
            }
            await this.setObjectAndState(slotPath + '.mapIndex', 'Map Index', 'number', 'value', entry.mapIndex);
            await this.setObjectAndState(slotPath + '.hasBack', 'Has Back', 'number', 'value', entry.hasBack);
            if (entry.md5sum) {
              await this.setObjectAndState(slotPath + '.md5sum', 'MD5 Checksum', 'string', 'value', entry.md5sum);
            }

            if (entry.mowingAreas && entry.mowingAreas.value) {
              for (const [zoneId, zone] of entry.mowingAreas.value) {
                const zonePath = slotPath + '.zone' + zoneId;
                await this.extendObject(zonePath, {
                  type: 'channel',
                  common: { name: zone.name || 'Zone ' + zoneId },
                  native: {},
                });
                await this.setObjectAndState(zonePath + '.name', 'Zone Name', 'string', 'value', zone.name || '');
                await this.setObjectAndState(zonePath + '.area', 'Area m²', 'number', 'value', zone.area || 0);
                await this.setObjectAndState(zonePath + '.time', 'Total Mowing Time', 'number', 'value.interval', zone.time || 0);
                await this.setObjectAndState(zonePath + '.etime', 'Effective Mowing Time', 'number', 'value.interval', zone.etime || 0);
                await this.setObjectAndState(zonePath + '.path', 'Zone Boundary Polygon', 'string', 'json', JSON.stringify(zone.path));
              }
            }

            if (entry.contours && entry.contours.value) {
              for (const [contourId, contour] of entry.contours.value) {
                const cId = Array.isArray(contourId) ? contourId.join('_') : contourId;
                const contourPath = slotPath + '.contour' + cId;
                await this.extendObject(contourPath, {
                  type: 'channel',
                  common: { name: 'Contour ' + cId },
                  native: {},
                });
                await this.setObjectAndState(contourPath + '.type', 'Contour Type', 'number', 'value', contour.type);
                await this.setObjectAndState(contourPath + '.path', 'Contour Polygon', 'string', 'json', JSON.stringify(contour.path));
              }
            }

            if (entry.forbiddenAreas && entry.forbiddenAreas.value.length > 0) {
              await this.setObjectAndState(slotPath + '.forbiddenAreas', 'Forbidden Areas', 'string', 'json', JSON.stringify(entry.forbiddenAreas.value));
            }
            if (entry.obstacles && entry.obstacles.value.length > 0) {
              await this.setObjectAndState(slotPath + '.obstacles', 'Obstacles', 'string', 'json', JSON.stringify(entry.obstacles.value));
            }
            if (entry.paths) {
              this.log.debug('Mower paths: ' + JSON.stringify(entry.paths));
              await this.setObjectAndState(slotPath + '.paths', 'Paths', 'string', 'json', JSON.stringify(entry.paths));
            }
            if (entry.cleanPoints) {
              this.log.debug('Mower cleanPoints: ' + JSON.stringify(entry.cleanPoints));
              await this.setObjectAndState(slotPath + '.cleanPoints', 'Clean Points', 'string', 'json', JSON.stringify(entry.cleanPoints));
            }
            if (entry.cruisePoints) {
              this.log.debug('Mower cruisePoints: ' + JSON.stringify(entry.cruisePoints));
              await this.setObjectAndState(slotPath + '.cruisePoints', 'Cruise Points', 'string', 'json', JSON.stringify(entry.cruisePoints));
            }
            if (entry.spotAreas) {
              this.log.debug('Mower spotAreas: ' + JSON.stringify(entry.spotAreas));
            }
          }
        } catch (e) {
          this.log.warn('Error parsing mower MAP data: ' + e.message);
        }
      }

      // M_PATH data
      const pathRaw = this.reassembleChunks(userData, 'M_PATH');
      if (pathRaw) {
        try {
          parsedPathData = JSON.parse(pathRaw);
          const pathData = parsedPathData;
          let segments = 0;
          let points = 0;
          for (const entry of pathData) {
            if (entry === null) continue;
            if (entry[0] === 32767 && entry[1] === -32768) { segments++; continue; }
            points++;
          }
          await this.setObjectAndState(basePath + '.mowingPath', 'Mowing Path Coordinates', 'string', 'json', pathRaw);
          await this.setObjectAndState(basePath + '.pathSegments', 'Path Segments', 'number', 'value', segments + 1);
          await this.setObjectAndState(basePath + '.pathPoints', 'Path Points', 'number', 'value', points);
        } catch (e) {
          this.log.warn('Error parsing mower M_PATH data: ' + e.message);
        }
      }

      // SETTINGS data (chunked like MAP/M_PATH)
      const settingsRaw = this.reassembleChunks(userData, 'SETTINGS');
      if (settingsRaw) {
        try {
          const settings = JSON.parse(settingsRaw);
          const settingsPath = basePath + '.settings';
          await this.extendObject(settingsPath, {
            type: 'channel',
            common: { name: 'Mower Settings' },
            native: {},
          });
          await this.setObjectAndState(settingsPath + '.raw', 'Raw Settings', 'string', 'json', settingsRaw);
          if (settings[0] && settings[0].settings) {
            for (const [zoneId, s] of Object.entries(settings[0].settings)) {
              const zPath = settingsPath + '.zone' + zoneId;
              await this.extendObject(zPath, {
                type: 'channel',
                common: { name: 'Zone ' + zoneId + ' Settings' },
                native: {},
              });
              await this.setObjectAndState(zPath + '.mowingHeight', 'Mowing Height', 'number', 'value', s.mowingHeight || 0);
              await this.setObjectAndState(zPath + '.edgeMowingWalkMode', 'Edge Mowing Walk Mode', 'number', 'value', s.edgeMowingWalkMode || 0);
              await this.setObjectAndState(zPath + '.edgeMowingAuto', 'Auto Edge Mowing', 'number', 'value', s.edgeMowingAuto || 0);
              await this.setObjectAndState(zPath + '.cutterPosition', 'Cutter Position', 'number', 'value', s.cutterPosition || 0);
              await this.setObjectAndState(zPath + '.obstacleAvoidanceEnabled', 'Obstacle Avoidance', 'number', 'value', s.obstacleAvoidanceEnabled || 0);
              await this.setObjectAndState(zPath + '.mowingDirection', 'Mowing Direction', 'number', 'value', s.mowingDirection || 0);
            }
          }
        } catch (e) {
          this.log.warn('Error parsing mower SETTINGS: ' + e.message);
        }
      }

      // SCHEDULE data (chunked like MAP/M_PATH)
      const scheduleRaw = this.reassembleChunks(userData, 'SCHEDULE');
      if (scheduleRaw) {
        await this.setObjectAndState(basePath + '.schedule', 'Mowing Schedule', 'string', 'json', scheduleRaw);
      }

      // Canvas rendering
      if (parsedMapData) {
        const robotPos = this.mowerRobotPos && this.mowerRobotPos[String(device.did)];
        const dockPos = this.mowerDockPos && this.mowerDockPos[String(device.did)];
        await this.renderMowerMap(device, parsedMapData, parsedPathData, robotPos, dockPos);
      }

      this.log.debug('Mower map data updated for ' + device.did);
    } catch (error) {
      this.log.warn('Error fetching mower map data: ' + error.message);
      this.log.debug(error.stack);
    }
  }

  async setObjectAndState(id, name, type, role, value) {
    await this.extendObject(id, {
      type: 'state',
      common: { name: name, type: type, role: role, read: true, write: false },
      native: {},
    });
    await this.setState(id, value, true);
  }

  async renderMowerMap(device, mapData, pathData, robotPos, dockPos) {
    if (!createCanvas) {
      this.log.debug('Canvas not available, cannot render mower map');
      return;
    }
    try {
      const entry = typeof mapData[0] === 'string' ? JSON.parse(mapData[0]) : mapData[0];
      if (!entry || !entry.boundary) return;

      const b = entry.boundary;
      const mapW = b.x2 - b.x1;
      const mapH = b.y2 - b.y1;
      if (mapW <= 0 || mapH <= 0) return;

      const maxPx = 800;
      const scale = Math.min(maxPx / mapW, maxPx / mapH);
      const cW = Math.ceil(mapW * scale);
      const cH = Math.ceil(mapH * scale);

      const canvas = createCanvas(cW, cH);
      const ctx = canvas.getContext('2d');

      const toX = (x) => (x - b.x1) * scale;
      const toY = (y) => (b.y2 - y) * scale;

      // Background
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(0, 0, cW, cH);

      // Mowing zones (filled)
      if (entry.mowingAreas && entry.mowingAreas.value) {
        const zoneColors = ['rgba(76, 175, 80, 0.4)', 'rgba(33, 150, 243, 0.4)', 'rgba(255, 193, 7, 0.4)', 'rgba(156, 39, 176, 0.4)'];
        for (let zi = 0; zi < entry.mowingAreas.value.length; zi++) {
          const zone = entry.mowingAreas.value[zi][1];
          if (!zone.path || zone.path.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(toX(zone.path[0].x), toY(zone.path[0].y));
          for (let i = 1; i < zone.path.length; i++) {
            ctx.lineTo(toX(zone.path[i].x), toY(zone.path[i].y));
          }
          ctx.closePath();
          ctx.fillStyle = zoneColors[zi % zoneColors.length];
          ctx.fill();
          ctx.strokeStyle = '#4CAF50';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Forbidden areas (red)
      if (entry.forbiddenAreas && entry.forbiddenAreas.value.length > 0) {
        for (const [, area] of entry.forbiddenAreas.value) {
          if (!area.path || area.path.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(toX(area.path[0].x), toY(area.path[0].y));
          for (let i = 1; i < area.path.length; i++) {
            ctx.lineTo(toX(area.path[i].x), toY(area.path[i].y));
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(244, 67, 54, 0.5)';
          ctx.fill();
          ctx.strokeStyle = '#F44336';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Contours (outline)
      if (entry.contours && entry.contours.value) {
        for (const [, contour] of entry.contours.value) {
          if (!contour.path || contour.path.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(toX(contour.path[0].x), toY(contour.path[0].y));
          for (let i = 1; i < contour.path.length; i++) {
            ctx.lineTo(toX(contour.path[i].x), toY(contour.path[i].y));
          }
          ctx.closePath();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Mowing path (M_PATH coordinates are ~10x smaller than MAP coordinates)
      if (pathData && pathData.length > 0) {
        ctx.strokeStyle = 'rgba(255, 235, 59, 0.6)';
        ctx.lineWidth = 0.8;
        let penDown = false;
        for (const pt of pathData) {
          if (pt === null) { penDown = false; continue; }
          const [px, py] = pt;
          if (px === 32767 && py === -32768) {
            if (penDown) ctx.stroke();
            penDown = false;
            continue;
          }
          const cx = toX(px * 10);
          const cy = toY(py * 10);
          if (!penDown) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            penDown = true;
          } else {
            ctx.lineTo(cx, cy);
          }
        }
        if (penDown) ctx.stroke();
      }

      // Obstacles (red circles)
      if (entry.obstacles && entry.obstacles.value.length > 0) {
        ctx.fillStyle = '#FF5722';
        for (const [, obs] of entry.obstacles.value) {
          if (obs.x != null && obs.y != null) {
            ctx.beginPath();
            ctx.arc(toX(obs.x), toY(obs.y), 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Zone labels
      if (entry.mowingAreas && entry.mowingAreas.value) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        for (const [, zone] of entry.mowingAreas.value) {
          if (!zone.name || !zone.path || zone.path.length === 0) continue;
          let cx = 0, cy = 0;
          for (const p of zone.path) { cx += p.x; cy += p.y; }
          cx /= zone.path.length;
          cy /= zone.path.length;
          ctx.fillText(zone.name, toX(cx), toY(cy));
        }
      }

      // Robot position from MQTT (siid:1 piid:4) or fallback to last M_PATH point
      let robotDrawn = false;
      if (robotPos && robotPos.x != null && robotPos.y != null) {
        const rx = toX(robotPos.x);
        const ry = toY(robotPos.y);
        ctx.beginPath();
        ctx.arc(rx, ry, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00AAFF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
        robotDrawn = true;
      }
      if (!robotDrawn && pathData && pathData.length > 0) {
        let lastPt = null;
        for (let i = pathData.length - 1; i >= 0; i--) {
          const pt = pathData[i];
          if (pt && pt[0] !== 32767 && pt[1] !== -32768) {
            lastPt = pt;
            break;
          }
        }
        if (lastPt) {
          const rx = toX(lastPt[0] * 10);
          const ry = toY(lastPt[1] * 10);
          ctx.beginPath();
          ctx.arc(rx, ry, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#00AAFF';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
        }
      }

      // Charge station / dock position (green)
      if (dockPos && dockPos.x != null && dockPos.y != null) {
        const cpx = toX(dockPos.x);
        const cpy = toY(dockPos.y);
        ctx.beginPath();
        ctx.arc(cpx, cpy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00FF00';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      }

      const buffer = canvas.toBuffer('image/png');
      const basePath = device.did + '.map';
      await this.extendObject(basePath + '.mapImage', {
        type: 'state',
        common: { name: 'Mower Map Image', type: 'string', role: 'state', read: true, write: false },
        native: {},
      });
      await this.setState(basePath + '.mapImage', 'data:image/png;base64,' + buffer.toString('base64'), true);
      this.log.debug('Mower map image rendered: ' + cW + 'x' + cH + 'px');
    } catch (e) {
      this.log.warn('Error rendering mower map: ' + e.message);
    }
  }

  async fetchWifiMap(device) {
    try {
      const objResult = await this.sendMowerCommand(device, { m: 'g', t: 'OBJ', d: { type: 'wifimap' } });
      if (!objResult || !objResult.d || !objResult.d.name) {
        this.log.warn('No WiFi map object name received: ' + JSON.stringify(objResult));
        return;
      }
      const objectName = objResult.d.name['0'] || objResult.d.name[0] || Object.values(objResult.d.name)[0];
      if (!objectName) {
        this.log.warn('WiFi map object name empty');
        return;
      }
      this.log.info('WiFi map object: ' + objectName);

      const downloadUrl = await this.getFile(objectName, device);
      if (!downloadUrl) {
        this.log.warn('No WiFi map download URL');
        return;
      }
      this.log.debug('WiFi map download URL: ' + downloadUrl);

      const response = await this.requestClient({ method: 'get', url: downloadUrl });
      const wifiData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      this.log.info('WiFi map data: ' + wifiData.width + 'x' + wifiData.height + ', ' + (wifiData.data ? wifiData.data.length : 0) + ' pixels');

      await this.renderWifiHeatmap(device, wifiData);
    } catch (e) {
      this.log.warn('Error fetching WiFi map: ' + e.message);
      this.log.debug(e.stack);
    }
  }

  async renderWifiHeatmap(device, wifiData) {
    try {
      if (!createCanvas) {
        this.log.warn('canvas not available, cannot render WiFi heatmap');
        return;
      }
      const { height, width, data } = wifiData;
      if (!data || !width || !height) {
        this.log.warn('WiFi map data incomplete');
        return;
      }

      const colors = ['#EEEEEE', '#E1F9E1', '#BDF1BD', '#9AE89A', '#5BD05B', '#46B946'];
      const scale = Math.max(1, Math.min(4, Math.ceil(800 / Math.max(width, height))));
      const canvas = createCanvas(width * scale, height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a3a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const val = data[y * width + x];
          if (val === undefined || val === 0) continue;
          if (val === 1) {
            ctx.fillStyle = '#A0A0A0';
          } else {
            const v = val + 100;
            if (v > 80) ctx.fillStyle = colors[5];
            else if (v > 60) ctx.fillStyle = colors[4];
            else if (v > 40) ctx.fillStyle = colors[3];
            else if (v > 20) ctx.fillStyle = colors[2];
            else if (v > 0) ctx.fillStyle = colors[1];
            else ctx.fillStyle = colors[0];
          }
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }

      const buffer = canvas.toBuffer('image/png');
      const basePath = device.did + '.map';
      await this.extendObject(basePath + '.wifiMapImage', {
        type: 'state',
        common: { name: 'WiFi Heatmap Image', type: 'string', role: 'state', read: true, write: false },
        native: {},
      });
      await this.setState(basePath + '.wifiMapImage', 'data:image/png;base64,' + buffer.toString('base64'), true);
      this.log.info('WiFi heatmap rendered: ' + width + 'x' + height + ' (scale ' + scale + ')');
    } catch (e) {
      this.log.warn('Error rendering WiFi heatmap: ' + e.message);
    }
  }

  async getFile(url, device) {
    return await this.requestClient({
      method: 'post',
      url: `https://${this.brand.domain}/dreame-user-iot/iotfile/getDownloadUrl`,
      headers: this.getHeaders(),
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
      url: `https://${this.brand.domain}/dreame-iot-com-${this.brand.iotComPrefix}/device/sendCommand`,
      headers: this.getHeaders(),
      data: dataToSend,
    })
      .then((res) => {
        this.log.debug('Command response: ' + JSON.stringify(res.data));

        if (res.data.code !== 0) {
          if (res.data.code === 80001) {
            this.log.debug('Command timeout: ' + JSON.stringify(res.data));
          } else {
            this.log.warn('Command failed: ' + JSON.stringify(res.data));
          }
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

  async sendMowerCommand(device, payload) {
    const result = await this.sendCommand({
      did: device.did,
      method: 'action',
      params: {
        did: device.did,
        siid: 2,
        aiid: 50,
        in: [payload],
      },
    });
    if (result && result.result && result.result.out) {
      return result.result.out[0];
    }
    return result;
  }

  // Plugin: loadSettingData() calls getCFG() (L183167-183191), parses result.d into individual settings
  async loadMowerSettings(device) {
    try {
      const result = await this.sendMowerCommand(device, { m: 'g', t: 'CFG' });
      if (!result || !result.d) {
        this.log.debug('getCFG returned no data for ' + device.model);
        return;
      }
      const cfg = result.d;
      const did = device.did;
      // Plugin: if WRP has only 2 elements, append sensitivity=0 (L183179-183180)
      if (Array.isArray(cfg.WRP) && cfg.WRP.length === 2) {
        cfg.WRP.push(0);
      }
      const mapping = {
        WRP: 'rain-protection', FDP: 'frost-protection', LOW: 'low-speed',
        DND: 'dnd-settings', CLS: 'child-lock-cfg', BAT: 'battery-config',
        VOL: 'volume', LIT: 'headlight', AOP: 'ai-obstacle-cfg',
        REC: 'camera-config', STUN: 'anti-theft', ATA: 'auto-task-adj',
        PATH: 'path-display', WRF: 'weather-ref', PROT: 'grass-protection',
      };
      for (const [key, stateId] of Object.entries(mapping)) {
        if (cfg[key] !== undefined) {
          const val = typeof cfg[key] === 'object' ? JSON.stringify(cfg[key]) : cfg[key];
          this.setState(`${did}.status.${stateId}`, val, true);
        }
      }
      // CMS: [blade_min, brush_min, robot_min] → individual states with hours + health %
      if (Array.isArray(cfg.CMS)) {
        const maxMinutes = [6000, 30000, 3600];
        const ids = ['blade', 'brush', 'robot-maintenance'];
        for (let i = 0; i < ids.length && i < cfg.CMS.length; i++) {
          const minutes = cfg.CMS[i];
          const hours = Math.round((minutes / 60) * 10) / 10;
          const health = Math.max(0, Math.round((1 - minutes / maxMinutes[i]) * 100));
          this.setState(`${did}.status.${ids[i]}-hours`, hours, true);
          this.setState(`${did}.status.${ids[i]}-health`, health, true);
        }
      }
      // PRE: [zone, mode, height_mm, obstacle_mm, coverage%, direction_change, adaptive, ?, edge_detection, auto_edge]
      if (Array.isArray(cfg.PRE) && cfg.PRE.length >= 10) {
        this.setState(`${did}.status.cutting-height`, cfg.PRE[2], true);
        this.setState(`${did}.status.obstacle-distance-cfg`, cfg.PRE[3], true);
        this.setState(`${did}.status.mow-mode`, cfg.PRE[1], true);
        this.setState(`${did}.status.direction-change`, cfg.PRE[5], true);
        this.setState(`${did}.status.edge-mowing`, cfg.PRE[9], true);
        this.setState(`${did}.status.edge-detection`, cfg.PRE[8], true);
      }
      this.log.debug(`Loaded ${Object.keys(mapping).filter((k) => cfg[k] !== undefined).length} settings for ${device.model}`);
    } catch (error) {
      this.log.warn(`Failed to load mower settings: ${error.message}`);
    }
  }

  parseAutoSwitch(did, value) {
    try {
      const settings = typeof value === 'string' ? JSON.parse(value) : value;
      const dict = {};
      if (Array.isArray(settings)) {
        for (const s of settings) dict[s.k] = s.v;
      } else if (settings && settings.k) {
        dict[settings.k] = settings.v;
      }
      const mapping = {
        LessColl: 'collision-avoidance',
        FillinLight: 'fill-light',
        SmartHost: 'clean-genius',
        CleanRoute: 'cleaning-route',
        MeticulousTwist: 'wider-corner',
        MaterialDirectionClean: 'floor-direction',
        PetPartClean: 'pet-focused',
        SmartCharge: 'auto-charging',
      };
      for (const [key, stateId] of Object.entries(mapping)) {
        if (dict[key] !== undefined) {
          this.setState(`${did}.status.${stateId}`, Number(dict[key]), true);
        }
      }
    } catch (e) {
      this.log.debug(`parseAutoSwitch error: ${e.message}`);
    }
  }

  parseVacuumAutoSwitch(did, value) {
    try {
      const settings = typeof value === 'string' ? JSON.parse(value) : value;
      const dict = {};
      if (Array.isArray(settings)) {
        for (const s of settings) dict[s.k] = s.v;
      } else if (settings && settings.k) {
        dict[settings.k] = settings.v;
      }
      const mapping = {
        AutoDry: 'auto-drying',
        LessColl: 'collision-avoidance',
        FillinLight: 'fill-light',
        StainIdentify: 'stain-avoidance',
        CleanType: 'mopping-type',
        SmartHost: 'clean-genius',
        CleanRoute: 'cleaning-route',
        MeticulousTwist: 'wider-corner',
        MaterialDirectionClean: 'floor-direction',
        PetPartClean: 'pet-focused',
        SmartAutoMop: 'auto-recleaning',
        SmartAutoWash: 'auto-rewashing',
        SuctionMax: 'max-suction',
        SmartDrying: 'smart-drying',
        HotWash: 'hot-washing',
        UVLight: 'uv-sterilization',
        MopEffectSwitch: 'custom-mopping-mode',
        BackWashType: 'self-clean-frequency',
        CarpetFineClean: 'intensive-carpet',
        LacuneMopScalable: 'gap-cleaning-extension',
        MopScalable2: 'mopping-under-furniture',
        SuperWash: 'ultra-clean-mode',
        MopExtrSwitch: 'mop-extend',
        ExtrFreq: 'mop-extend-frequency',
        SmartCharge: 'smart-charging',
      };
      for (const [key, stateId] of Object.entries(mapping)) {
        if (dict[key] !== undefined) {
          this.setState(`${did}.status.${stateId}`, Number(dict[key]), true);
        }
      }
    } catch (e) {
      this.log.debug(`parseVacuumAutoSwitch error: ${e.message}`);
    }
  }

  parseShortcuts(did, value) {
    try {
      const shortcuts = typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(shortcuts)) return;
      for (const sc of shortcuts) {
        const name = Buffer.from(sc.name, 'base64').toString('utf-8');
        const running = sc.state === '0' || sc.state === '1';
        const path = `${did}.shortcuts.${sc.id}`;
        this.extendObject(path, { type: 'channel', common: { name: name }, native: {} });
        this.extendObject(path + '.name', {
          type: 'state',
          common: { name: 'Shortcut Name', type: 'string', role: 'text', read: true, write: false },
          native: {},
        });
        this.setState(path + '.name', name, true);
        this.extendObject(path + '.running', {
          type: 'state',
          common: { name: 'Running', type: 'boolean', role: 'indicator', read: true, write: false },
          native: {},
        });
        this.setState(path + '.running', running, true);
        this.extendObject(path + '.start', {
          type: 'state',
          common: { name: `Start "${name}"`, type: 'boolean', role: 'button', read: false, write: true },
          native: { shortcutId: sc.id, did: did },
        });
      }
    } catch (e) {
      this.log.debug(`parseShortcuts error: ${e.message}`);
    }
  }

  async loadMowerHistory(device) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
      const response = await this.requestClient({
        method: 'post',
        url: `https://${this.brand.domain}/dreame-user-iot/iotstatus/history`,
        headers: this.getHeaders(),
        data: {
          did: String(device.did),
          siid: '4',
          key: '4.1',
          eiid: '1',
          limit: 20,
          region: 'eu',
          uid: String(this.session.uid),
          time_start: thirtyDaysAgo,
          time_end: now,
          from: thirtyDaysAgo,
          type: 3,
        },
      });
      if (!response.data || response.data.code !== 0) {
        this.log.debug('No mower history: ' + JSON.stringify(response.data));
        return;
      }
      const records = response.data.data;
      if (!Array.isArray(records) || records.length === 0) {
        this.log.debug('Empty mower history');
        return;
      }
      const did = device.did;
      const basePath = `${did}.history`;
      await this.extendObject(basePath, { type: 'channel', common: { name: 'Mowing History' }, native: {} });

      const historyList = [];
      for (const record of records) {
        const props = {};
        if (Array.isArray(record.value)) {
          for (const p of record.value) {
            props[`${p.siid}-${p.piid}`] = p.value;
          }
        }
        const entry = {
          date: props['4-8'] ? new Date(props['4-8'] * 1000).toISOString() : record.updateTime ? new Date(record.updateTime * 1000).toISOString() : null,
          duration: props['4-2'] || 0,
          area: props['4-3'] || 0,
          status: props['4-1'] || 0,
          completed: props['4-13'] === 1,
        };
        historyList.push(entry);
      }

      const statesDef = [
        { id: 'last-mow-date', name: 'Last Mow Date', type: 'string', role: 'date' },
        { id: 'last-mow-duration', name: 'Last Mow Duration', type: 'number', role: 'value', unit: 'min' },
        { id: 'last-mow-area', name: 'Last Mow Area', type: 'number', role: 'value', unit: 'm²' },
        { id: 'last-mow-completed', name: 'Last Mow Completed', type: 'boolean', role: 'indicator' },
        { id: 'history-json', name: 'History (JSON)', type: 'string', role: 'json' },
      ];
      for (const s of statesDef) {
        await this.extendObject(`${basePath}.${s.id}`, {
          type: 'state',
          common: { name: s.name, type: s.type, role: s.role, unit: s.unit, read: true, write: false },
          native: {},
        });
      }

      if (historyList.length > 0) {
        const last = historyList[0];
        this.setState(`${basePath}.last-mow-date`, last.date || '', true);
        this.setState(`${basePath}.last-mow-duration`, last.duration, true);
        this.setState(`${basePath}.last-mow-area`, last.area, true);
        this.setState(`${basePath}.last-mow-completed`, last.completed, true);
      }
      this.setState(`${basePath}.history-json`, JSON.stringify(historyList), true);
      this.log.debug(`Loaded ${historyList.length} history records for ${device.model}`);
    } catch (error) {
      this.log.info(`Failed to load mower history: ${error.message}`);
    }
  }

  async fetch3DMapUrl(device) {
    try {
      const result = await this.sendMowerCommand(device, { m: 'g', t: 'OBJ', d: { type: '3dmap' } });
      if (!result || !result.d || !result.d.name) {
        this.log.info('No 3D map available for ' + device.model);
        return;
      }
      const filename = result.d.name[0] || Object.values(result.d.name)[0];
      if (!filename) {
        this.log.info('No 3D map filename found');
        return;
      }
      this.log.info('3D map object: ' + filename);
      const downloadUrl = await this.getFile(filename, device);
      if (downloadUrl) {
        await this.setState(device.did + '.status.3dmap-url', downloadUrl, true);
        this.log.info('3D map URL updated for ' + device.model);
      }
    } catch (e) {
      this.log.error('Error fetching 3D map URL: ' + e.message);
    }
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
      url: `https://${this.brand.domain}/dreame-auth/oauth/token`,
      headers: {
        ...this.getHeaders(),
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
      this.mowerMapInterval && clearInterval(this.mowerMapInterval);
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
          if (this.isMower(device)) {
            this.getMowerMap(device);
            return;
          }
          this.getMap(device, false);
          return;
        }
        if (id.split('.')[4] === 'generate-3dmap') {
          const device = this.deviceArray.find((obj) => obj.did === deviceId);
          if (!this.isMower(device)) return;
          this.log.info('Generating 3D LIDAR map for ' + device.model);
          await this.setState(device.did + '.status.3dmap-progress', 0, true);
          await this.setState(device.did + '.status.3dmap-url', '', true);
          await this.sendMowerCommand(device, { m: 'a', p: 0, o: 10, d: { idx: 0 } });
          this.log.info('3D map generation triggered, waiting for MQTT progress updates');
          return;
        }
        if (id.split('.')[4] === 'request-wifi-map') {
          const device = this.deviceArray.find((obj) => obj.did === deviceId);
          if (!this.isMower(device)) return;
          this.log.info('Requesting WiFi signal map for ' + device.model);
          await this.sendCommand({
            did: device.did,
            method: 'action',
            params: { did: device.did, siid: 6, aiid: 4, in: [] },
          });
          setTimeout(() => this.fetchWifiMap(device), 30000);
          return;
        }
        // Shortcut start button (native.shortcutId)
        if (id.includes('.shortcuts.') && id.endsWith('.start')) {
          const stateObjSc = await this.getObjectAsync(id);
          if (stateObjSc && stateObjSc.native && stateObjSc.native.shortcutId !== undefined) {
            const device = this.deviceArray.find((obj) => obj.did === deviceId);
            if (!device || !this.isMower(device)) return;
            const scId = String(stateObjSc.native.shortcutId);
            this.log.info(`Starting shortcut ${scId} for ${device.model}`);
            await this.sendCommand({
              did: device.did,
              method: 'action',
              params: { did: device.did, siid: 4, aiid: 1, in: [{ piid: 1, value: 25 }, { piid: 10, value: scId }] },
            });
            return;
          }
        }
        // Plugin CFG SET/ACTION remotes (cfgKey or actionOp or autoSwitchKey in native)
        const stateObjCfg = await this.getObjectAsync(id);
        if (stateObjCfg && stateObjCfg.native && (stateObjCfg.native.cfgKey || stateObjCfg.native.actionOp !== undefined || stateObjCfg.native.autoSwitchKey)) {
          const device = this.deviceArray.find((obj) => obj.did === deviceId);
          if (stateObjCfg.native.autoSwitchKey) {
            if (!device || (!this.isMower(device) && !this.isVacuum(device))) return;
            const key = stateObjCfg.native.autoSwitchKey;
            const payload = JSON.stringify({ k: key, v: Number(state.val) });
            this.log.info(`Set AutoSwitch ${key}=${state.val}`);
            await this.sendCommand({ did: device.did, method: 'set_properties', params: [{ did: device.did, siid: 4, piid: 50, value: payload }] });
            return;
          }
          if (!device || !this.isMower(device)) return;
          if (stateObjCfg.native.actionOp !== undefined) {
            // Action command: {m:'a', p:0, o:actionOp}
            this.log.info(`Mower action o=${stateObjCfg.native.actionOp} for ${device.model}`);
            await this.sendMowerCommand(device, { m: 'a', p: 0, o: stateObjCfg.native.actionOp });
          } else if (stateObjCfg.native.resetIndex !== undefined) {
            // Reset single consumable: read current CMS, set target index to 0, write back
            const cfgResult = await this.sendMowerCommand(device, { m: 'g', t: 'CFG' });
            if (cfgResult && cfgResult.d && Array.isArray(cfgResult.d.CMS)) {
              const cms = [...cfgResult.d.CMS];
              cms[stateObjCfg.native.resetIndex] = 0;
              this.log.info(`Reset consumable index ${stateObjCfg.native.resetIndex}: ${JSON.stringify(cms)}`);
              await this.sendMowerCommand(device, { m: 's', t: 'CMS', d: { value: cms } });
            } else {
              this.log.warn('Could not read current CMS values for reset');
            }
          } else if (stateObjCfg.native.preIndex !== undefined) {
            // PRE read-modify-write: read current PRE array, replace index, send back
            const cfgResult = await this.sendMowerCommand(device, { m: 'g', t: 'CFG' });
            if (cfgResult && cfgResult.d && Array.isArray(cfgResult.d.PRE)) {
              const pre = [...cfgResult.d.PRE];
              pre[stateObjCfg.native.preIndex] = Number(state.val);
              this.log.info(`Set PRE[${stateObjCfg.native.preIndex}]=${state.val}: ${JSON.stringify(pre)}`);
              await this.sendMowerCommand(device, { m: 's', t: 'PRE', d: { value: pre } });
            } else {
              this.log.warn('Could not read current PRE values');
            }
          } else {
            // CFG SET command: {m:'s', t:cfgKey, d:{value:X}} or d:parsed JSON
            const cfgKey = stateObjCfg.native.cfgKey;
            let payload;
            if (typeof state.val === 'string') {
              try {
                payload = JSON.parse(state.val);
              } catch (e) {
                this.log.error(`Invalid JSON for ${cfgKey}: ${state.val}`);
                return;
              }
            } else {
              payload = { value: state.val };
            }
            this.log.info(`Set mower CFG ${cfgKey}: ${JSON.stringify(payload)}`);
            await this.sendMowerCommand(device, { m: 's', t: cfgKey, d: payload });
          }
          // Reload settings after change
          setTimeout(() => this.loadMowerSettings(device), 2000);
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
          data.data.method = 'set_properties';
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
          if (typeof state.val === 'boolean') {
            data.data.params['in'] = [];
          } else {
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
          if (this.isMower(device) && data.data.params.siid === 2) {
            data.data.params.siid = 5;
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
          let RetRoomSettings;
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
                    GetSuctionLevel = GetSuctionLevelOb ? GetSuctionLevelOb.val : 0;
                    GetWaterVolumeOb = await this.getStateAsync(RPath + '.WaterVolume');
                    GetWaterVolume = GetWaterVolumeOb ? GetWaterVolumeOb.val : 0;
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
                    url: `https://${this.brand.domain}/dreame-iot-com-${this.brand.iotComPrefix}/device/sendCommand`,
                    headers: this.getHeaders(),
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
          url: `https://${this.brand.domain}/dreame-iot-com-${this.brand.iotComPrefix}/device/sendCommand`,
          headers: this.getHeaders(),
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
