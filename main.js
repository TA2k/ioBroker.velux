'use strict';

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const request = require('request');
const traverse = require('traverse');

class Velux extends utils.Adapter {
  /**
   * @param {Partial<ioBroker.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: 'velux',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    // this.on("message", this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this));

    this.refreshTokenInterval = null;
    this.updateInterval = null;
    this.catchTimeout = null;
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    // Initialize your adapter here

    this.setState('info.connection', false, true);
    // Reset the connection indicator during startup
    this.login()
      .then(() => {
        this.log.debug('Login successful');
        this.setState('info.connection', true, true);
        this.getHomesData()
          .then(() => {
            this.getHomesStatus()
              .then(() => {})
              .catch((e) => {
                this.log.error('Get Home Status was not successful: ' + e);
              });
            this.updateInterval = setInterval(() => {
              this.getHomesStatus().catch((e) => {
                this.log.error('Get Home Status was not successful: ' + e);
              });
            }, this.config.interval * 60 * 1000);
          })
          .catch((e) => {
            this.log.error('Get Home Data was not successful: ' + e);
          });
      })
      .catch((e) => {
        this.log.error('Login was not successful: ' + e);
      });

    this.subscribeStates('*');
    //Delete old room states
    const pre = this.name + '.' + this.instance;
    this.getStates(pre + '.*', (err, states) => {
      const allIds = Object.keys(states);
      allIds.forEach((keyName) => {
        if (keyName.indexOf('home.rooms') !== -1 || keyName.indexOf('home.modules') !== -1) {
          this.delObject(keyName.split('.').slice(2).join('.'));
        }
      });
    });
  }

  login() {
    return new Promise((resolve, reject) => {
      request.post(
        {
          url: 'https://app.velux-active.com/oauth2/token',
          headers: {
            'Accept-Language': 'de-DE;q=1, en-DE;q=0.9',

            'User-Agent': 'NetatmoApp(VELUX ACTIVE/v791302006/791302006) Android(13/Google/Pixel 7 Pro)',
            Accept: 'application/json',
            Host: 'app.velux-active.com',
          },

          form: {
            app_version: '791302006',
            version: '791302006',
            client_secret: '6ae2d89d15e767ae5c56b456b452d319',
            client_id: '5931426da127d981e76bdd3f',
            grant_type: 'password',
            password: this.config.password,
            scope: 'velux_scopes',
            user_prefix: 'velux',
            username: this.config.user,
          },
          followAllRedirects: true,
        },
        (err, resp, body) => {
          if (err || (resp && resp.statusCode >= 400) || !body) {
            const reason = err || (resp && `HTTP ${resp.statusCode}`) || 'empty response';
            this.log.error('Login request failed: ' + reason);
            reject(reason);
            return;
          }
          this.log.debug(body);
          if (this.refreshTokenInterval) {
            clearInterval(this.refreshTokenInterval);
          }
          this.refreshTokenInterval = setInterval(() => {
            this.refreshToken().catch(() => {
              this.catchTimeout = setTimeout(() => {
                this.refreshToken();
              }, 5 * 60 * 1000);
            });
          }, 58  * 60 * 1000); //58
          try {
            const tokens = JSON.parse(body);
            this.config.atoken = tokens.access_token;
            this.config.rtoken = tokens.refresh_token;
            resolve();
          } catch (error) {
            this.log.error('Login parse error: ' + error);
            reject(error);
          }
        },
      );
    });
  }

  refreshToken() {
    return new Promise((resolve, reject) => {
      this.log.debug('refreshToken');

      request.post(
        {
          url: 'https://app.velux-active.com/oauth2/token',
          headers: {
            'Accept-Language': 'de-DE;q=1, en-DE;q=0.9',
            'User-Agent': 'NetatmoApp(VELUX ACTIVE/v791302006/791302006) Android(13/Google/Pixel 7 Pro)',
            Accept: 'application/json',
            Host: 'app.velux-active.com',
          },

          form: {
            app_version: '791302006',
            version: '791302006',
            client_secret: '6ae2d89d15e767ae5c56b456b452d319',
            client_id: '5931426da127d981e76bdd3f',
            scope: 'velux_scopes',
            user_prefix: 'velux',
            grant_type: 'refresh_token',
            refresh_token: this.config.rtoken,
          },
          followAllRedirects: true,
        },
        (err, resp, body) => {
          if (err || (resp && resp.statusCode >= 400) || !body) {
            const reason = err || (resp && `HTTP ${resp.statusCode}`) || 'empty response';
            this.log.error('Refresh token failed: ' + reason);
            reject(reason);
            return;
          }
          try {
            this.log.debug(body);
            const tokens = JSON.parse(body);
            this.config.atoken = tokens.access_token;
            this.config.rtoken = tokens.refresh_token;
            resolve();
          } catch (error) {
            this.log.error('Refresh token parse error: ' + error);
            reject(error);
          }
        },
      );
    });
  }

  getHomesData() {
    return new Promise((resolve, reject) => {
      this.log.debug('getHomesData');
      request.post(
        {
          url: 'https://app.velux-active.com/api/homesdata',
          headers: {
            Authorization: 'Bearer ' + this.config.atoken,
            'Accept-Language': 'de-DE;q=1, en-DE;q=0.9',
            'User-Agent': 'NetatmoApp(VELUX ACTIVE/v791302006/791302006) Android(13/Google/Pixel 7 Pro)',
            Accept: '*/*',
            'Content-Type': 'application/json',
            Host: 'app.velux-active.com',
          },

          body: {
            app_type: 'app_velux',
            app_version: '791302006',
          },
          json: true,
          followAllRedirects: true,
        },
        (err, resp, body) => {
          if (err || (resp && resp.statusCode >= 400) || !body) {
            const reason = err || (resp && `HTTP ${resp.statusCode}`) || 'empty response';
            this.log.error('getHomesData request failed: ' + reason);
            reject(reason);
            return;
          }
          try {
            if (body.error) {
              this.log.error('getHomesData API error: ' + JSON.stringify(body.error));
              reject(body.error);
              return;
            }
            const adapter = this;

            this.log.debug(JSON.stringify(body));
            if (body.body && body.body.homes) {
              this.config.homeId = body.body.homes[0].id;
              this.config.bridgeId = body.body.homes[0].modules[0].id;
              let currentId;
              traverse(body.body.homes).forEach(function (value) {
                if (this.path.length > 0 && this.isLeaf) {
                  const modPath = this.path;

                  this.path.forEach((pathElement, pathIndex) => {
                    if (!isNaN(parseInt(pathElement))) {
                      let stringPathIndex = parseInt(pathElement) + 1 + '';
                      while (stringPathIndex.length < 2) stringPathIndex = '0' + stringPathIndex;
                      const key = this.path[pathIndex - 1] + stringPathIndex;

                      const parentIndex = modPath.indexOf(pathElement) - 1;
                      //if (this.key === pathElement) {
                      modPath[parentIndex] = key;
                      //}
                      modPath.splice(parentIndex + 1, 1);
                    }
                  });
                  if (modPath[0] && (modPath[0].startsWith('rooms') || modPath[0].startsWith('modules'))) {
                    if (this.parent.node.id) {
                      modPath[0] = this.parent.node.id;
                      currentId = this.parent.node.id;
                    } else {
                      modPath[0] = currentId;
                    }
                  }
                  adapter.setObjectNotExists('home.' + modPath.join('.'), {
                    type: 'state',
                    common: {
                      name: this.key,
                      role: 'indicator',
                      type: 'mixed',
                      write: false,
                      read: true,
                    },
                    native: {},
                  });
                  adapter.setState('home.' + modPath.join('.'), value || this.node, true);
                } else if (this.path.length > 0 && !isNaN(this.path[this.path.length - 1])) {
                  const modPath = this.path;
                  let keyName;
                  this.path.forEach((pathElement, pathIndex) => {
                    if (!isNaN(parseInt(pathElement))) {
                      let stringPathIndex = parseInt(pathElement) + 1 + '';
                      while (stringPathIndex.length < 2) stringPathIndex = '0' + stringPathIndex;
                      const key = this.path[pathIndex - 1] + stringPathIndex;
                      keyName = this.path[pathIndex - 1];
                      const parentIndex = modPath.indexOf(pathElement) - 1;
                      modPath[parentIndex] = key;

                      modPath.splice(parentIndex + 1, 1);
                    }
                  });

                  const newPath = modPath.length ? 'home.' : 'home';
                  let name = this.node.name;

                  if (modPath[0] && (modPath[0].startsWith('rooms') || modPath[0].startsWith('modules'))) {
                    if (this.node.id) {
                      modPath[0] = this.node.id;
                      currentId = this.node.id;
                    } else {
                      modPath[0] = currentId;
                    }
                    if (modPath.length < 3) {
                      name = keyName + ' ' + this.node.name;
                    }
                  }

                  const newPostPath = modPath.join('.');
                  adapter.setObjectNotExists(newPath + newPostPath, {
                    type: modPath.length ? 'state' : 'device',
                    common: {
                      name: name,
                      role: 'indicator',
                      type: 'mixed',
                      write: false,
                      read: true,
                    },
                    native: {},
                  });
                }
              });
            }
            if (body.body && body.body.user) {
              Object.keys(body.body.user).forEach((key) => {
                this.setObjectNotExists('user.' + key, {
                  type: 'state',
                  common: {
                    name: key,
                    role: 'indicator',
                    type: 'mixed',
                    write: false,
                    read: true,
                  },
                  native: {},
                });
                this.setState('user.' + key, body.body.user[key], true);
              });
            }
            resolve();
          } catch (error) {
            this.log.error('getHomesData processing error: ' + error);
            reject(error);
          }
        },
      );
    });
  }

  getHomesStatus() {
    return new Promise((resolve, reject) => {
      this.log.debug('getHomesStatus');
      request.post(
        {
          url: 'https://app.velux-active.com/syncapi/v1/homestatus',
          headers: {
            Authorization: 'Bearer ' + this.config.atoken,
            'Accept-Language': 'de-DE;q=1, en-DE;q=0.9',
            'User-Agent': 'NetatmoApp(VELUX ACTIVE/v791302006/791302006) Android(13/Google/Pixel 7 Pro)',
            Accept: '*/*',
            'Content-Type': 'application/json',
            Host: 'app.velux-active.com',
          },
          body: {
            home_id: this.config.homeId,
            app_version: '791302006',
          },
          json: true,
          followAllRedirects: true,
        },
        (err, resp, body) => {
          if (err || (resp && resp.statusCode >= 400) || !body) {
            const reason = err || (resp && `HTTP ${resp.statusCode}`) || 'empty response';
            this.log.error('getHomesStatus request failed: ' + reason);
            reject(reason);
            return;
          }
          try {
            if (body.error) {
              this.log.error('getHomesStatus API error: ' + JSON.stringify(body.error));
              reject(body.error);
              return;
            }
            const adapter = this;
            this.log.debug(JSON.stringify(body));
            if (body.body && body.body.home) {
              let currentId;
              traverse(body.body.home).forEach(function (value) {
                if (this.path.length > 0 && this.isLeaf) {
                  const modPath = this.path;
                  this.path.forEach((pathElement, pathIndex) => {
                    if (!isNaN(parseInt(pathElement))) {
                      let stringPathIndex = parseInt(pathElement) + 1 + '';
                      while (stringPathIndex.length < 2) stringPathIndex = '0' + stringPathIndex;
                      const key = this.path[pathIndex - 1] + stringPathIndex;
                      const parentIndex = modPath.indexOf(pathElement) - 1;
                      //if (this.key === pathElement) {
                      modPath[parentIndex] = key;
                      //}
                      modPath.splice(parentIndex + 1, 1);
                    }
                  });

                  if (modPath[0] && (modPath[0].startsWith('rooms') || modPath[0].startsWith('modules'))) {
                    if (this.parent.node.id) {
                      modPath[0] = this.parent.node.id;
                      currentId = this.parent.node.id;
                    } else {
                      modPath[0] = currentId;
                    }
                  }

                  const newPostPath = modPath.join('.');
                  let role = 'indicator';
                  let unit = '';
                  if (this.key === 'temperature') {
                    role = 'level.temperature';
                    unit = '°c';
                  }
                  if (this.key === 'humidity') {
                    role = 'value.humidity';
                    unit = '%';
                  }
                  adapter.setObjectNotExists('home.' + newPostPath, {
                    type: 'state',
                    common: {
                      name: this.key,
                      role: role,
                      type: 'mixed',
                      write: true,
                      read: true,
                      unit: unit,
                    },
                    native: {},
                  });
                  if (this.key.indexOf('temperature') !== -1) {
                    adapter.setState('home.' + newPostPath, parseFloat(value) / 10, true);
                  } else {
                    adapter.setState('home.' + newPostPath, value || this.node, true);
                  }
                }
              });
            }

            resolve();
          } catch (error) {
            this.log.error('getHomesStatus processing error: ' + error);
            reject(error);
          }
        },
      );
    });
  }

  setVeluxState(moduleId, targetPosition) {
    return new Promise((resolve, reject) => {
      this.log.debug('setTargetpos ' + moduleId + ' ' + targetPosition);
      request.post(
        {
          url: 'https://app.velux-active.com/syncapi/v1/setstate',
          headers: {
            Authorization: 'Bearer ' + this.config.atoken,
            'Accept-Language': 'de-DE;q=1, en-DE;q=0.9',
            'User-Agent': 'NetatmoApp(VELUX ACTIVE/v791302006/791302006) Android(13/Google/Pixel 7 Pro)',
            Accept: '*/*',
            'Content-Type': 'application/json',
            Host: 'app.velux-active.com',
          },
          body: {
            home: {
              modules: [
                {
                  force: true,
                  bridge: this.config.bridgeId,
                  id: moduleId,
                  target_position: targetPosition,
                },
              ],
              id: this.config.homeId,
            },
            app_version: '791302006',
          },
          json: true,
          followAllRedirects: true,
        },
        (err, resp, body) => {
          if (err || (resp && resp.statusCode >= 400) || !body) {
            const reason = err || (resp && `HTTP ${resp.statusCode}`) || 'empty response';
            this.log.error('setVeluxState request failed: ' + reason);
            reject(reason);
            return;
          }
          if (body.error) {
            this.log.error('setVeluxState API error: ' + JSON.stringify(body));
            reject(body.error);
            return;
          }
          try {
            this.log.info(JSON.stringify(body));
            resolve();
          } catch (error) {
            this.log.error('setVeluxState processing error: ' + error);
            reject(error);
          }
        },
      );
    });
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      this.log.info('cleaned everything up...');

      clearInterval(this.refreshTokenInterval);
      clearInterval(this.updateInterval);
      clearTimeout(this.catchTimeout);
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
        if (id.indexOf('target_position') !== -1) {
          const modulePathArray = id.split('.');
          modulePathArray.pop();
          const modulePath = modulePathArray.join('.');
          const moduleId = await this.getStateAsync(modulePath + '.id');
          if (!isNaN(state.val) && moduleId) {
            this.setVeluxState(moduleId.val, parseInt(state.val)).catch(() => {
              this.log.error('Set Status Failed ' + moduleId.val + ' ' + parseFloat(state.val));
            });
          }
        }
      }
    } else {
      // The state was deleted
      //	this.log.info(`state ${id} deleted`);
    }
  }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<ioBroker.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new Velux(options);
} else {
  // otherwise start the instance directly
  new Velux();
}
