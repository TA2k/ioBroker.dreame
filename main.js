'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;
const Json2iob = require('json2iob');
const crypto = require('crypto');
const mqtt = require('mqtt');

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

    this.updateInterval = null;
    this.reLoginTimeout = null;
    this.refreshTokenTimeout = null;
    this.session = {};
    this.subscribeStates('*.remote.*');

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
          }
        } else {
          this.log.error('No Devices found: ' + JSON.stringify(response.data));
        }
      })
      .catch((error) => {
        this.log.error('Device list error: ' + error);
        error.response && this.log.error('Device list error response: ' + JSON.stringify(error.response.data));
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
        this.setObjectNotExists(device.did + '.remotePlugins.customCommand', {
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
          this.setObjectNotExists(device.did + '.remotePlugins.' + name, {
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
        let piid = 0;
        for (const property of service.properties) {
          if (property.iid) {
            piid = property.iid;
          } else {
            piid++;
          }
          const remote = {
            siid: siid,
            piid: piid,
            did: device.did,
            model: device.model,
            name: service.description + ' ' + property.description + ' ' + service.iid + '-' + property.iid,
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
          await this.extendObject(device.did + '.' + path + '.' + typeName, {
            type: 'state',
            common: {
              name: remote.name || '',
              type: type,
              role: role,
              unit: unit,
              min: property['value-range'] ? property['value-range'][0] : undefined,
              max: property['value-range'] ? property['value-range'][1] : undefined,
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
            await this.extendObject(device.did + '.' + path + '.' + typeName, {
              type: 'state',
              common: {
                name: remote.name || '',
                type: type,
                role: role,
                unit: unit,
                min: action['value-range'] ? action['value-range'][0] : undefined,
                max: action['value-range'] ? action['value-range'][1] : undefined,
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
              if (error.response) {
                if (error.response.status === 401) {
                  error.response && this.log.debug(JSON.stringify(error.response.data));
                  this.log.info(' receive 401 error. Refresh Token in 60 seconds');
                  this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
                  this.refreshTokenTimeout = setTimeout(() => {
                    this.refreshToken();
                  }, 1000 * 60);

                  return;
                }

                this.log.error(error);
                error.stack && this.log.error(error.stack);
                error.response && this.log.error(JSON.stringify(error.response.data));
                return;
              }

              this.log.debug(error);
              this.log.debug(JSON.stringify(error));
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
      } catch (error) {
        this.log.error(error);
        return;
      }
      if (message.data && message.data.method === 'properties_changed') {
        for (const element of message.data.params) {
          if (!this.specPropsToIdDict[element.did]) {
            this.log.debug(`No spec found for ${element.did}`);
            continue;
          }
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
              native: {},
            });
          }
          if (path) {
            this.log.debug(`Set ${path} to ${element.value}`);
            if (element.value != null) {
              // this.setState(path, JSON.stringify(element.value), true);
              this.json2iob.parse(path, JSON.stringify(element));
            }
          }
        }
      }
    });
    this.mqttClient.on('error', async (error) => {
      this.log.error(error);
      if (error.message && error.message.includes('Not authorized')) {
        this.log.error('Not authorized to connect to MQTT');
        this.setState('info.connection', false, true);
        await this.refreshToken();
      }
    });
    this.mqttClient.on('close', () => {
      this.log.info('MQTT Connection closed');
    });
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
          data.data.params = { did: deviceId, siid: stateObject.native.siid, aiid: stateObject.native.aiid };
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
          } catch (error) {
            this.log.error(error);
            return;
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
