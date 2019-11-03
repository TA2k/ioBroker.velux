"use strict";

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const request = require("request");
const traverse = require("traverse");

class Velux extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "velux",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));


		this.refreshTokenInterval = null;
		this.updateInterval = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.login().then(() => {
			this.log.debug("Login successful");
			this.setState("info.connection", true, true);
			this.getHomesData().then(() => {
				this.getHomesStatus().then(() => {});
				this.updateInterval = setInterval(() => {
					this.getHomesStatus();
				}, this.config.interval * 60 * 1000)
				// this.setVeluxState({
				// 	home: {
				// 		id: this.config.homeId,
				// 		modules: [{
				// 			retrieve_key: true,
				// 			id: this.config.bridgeId,
				// 			bridge: this.config.bridgeId
				// 		}]
				// 	},
				// 	app_version: "1.6.0"
				// });
			});
		});


		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		// await this.setObjectAsync("testVariable", {
		// 	type: "state",
		// 	common: {
		// 		name: "testVariable",
		// 		type: "boolean",
		// 		role: "indicator",
		// 		read: true,
		// 		write: true,
		// 	},
		// 	native: {},
		// });

		// in this template all states changes inside the adapters namespace are subscribed
		//this.subscribeStates("*");

		/*
		setState examples
		you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		// await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		// await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		// await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

	}

	login() {
		return new Promise((resolve, reject) => {

			request.post({
				url: "https://app.velux-active.com/oauth2/token",
				headers: {
					"Accept-Language": "de-DE;q=1, en-DE;q=0.9",
					"Authorization": "Basic NTkzMTU0ZGZhMTI3ZDk4MWU3NmJkZTM3OjRlZjg0MWVhMTAxNGYxNGJhMzFmZmFmOGY3ZGE2MTE2",
					"User-Agent": "Velux/1.6.0 (iPhone; iOS 13.2; Scale/3.00)",
					"Accept": "application/json",
					"Host": "app.velux-active.com"
				},
				form: {
					app_identifier: "com.velux.active",
					device_model: "iPhone11,2",
					device_name: "iPhone 5",
					grant_type: "password",
					password: this.config.password,
					scope: "velux_scopes",
					user_prefix: "velux",
					username: this.config.user
				},
				followAllRedirects: true
			}, (err, resp, body) => {
				if (err) {
					this.log.error(err);
					reject();
				}
				this.refreshTokenInterval = setInterval(() => {
					this.refreshToken().catch(() => {
						setTimeout(() => {
							this.refreshToken();
						}, 5 * 60 * 1000);
					});
				}, 2 * 60 * 60 * 1000); //2hours
				try {
					const tokens = JSON.parse(body);
					this.config.atoken = tokens.access_token;
					this.config.rtoken = tokens.refresh_token;
					resolve();

				} catch (error) {
					this.log.error(error);
					reject();
				}
			});
		});
	}

	refreshToken() {
		return new Promise((resolve, reject) => {
			this.log.debug("refreshToken");
			request.post({
				url: "https://app.velux-active.com/oauth2/token",
				headers: {
					"Accept-Language": "de-DE;q=1, en-DE;q=0.9",
					"Authorization": "Basic NTkzMTU0ZGZhMTI3ZDk4MWU3NmJkZTM3OjRlZjg0MWVhMTAxNGYxNGJhMzFmZmFmOGY3ZGE2MTE2",
					"User-Agent": "Velux/1.6.0 (iPhone; iOS 13.2; Scale/3.00)",
					"Accept": "application/json",
					"Host": "app.velux-active.com"
				},
				form: {
					grant_type: "refresh_token",
					refresh_token: this.config.rtoken
				},
				followAllRedirects: true
			}, (err, resp, body) => {
				if (err) {
					this.log.error(err);
					reject();
				}
				try {
					const tokens = JSON.parse(body);
					this.config.atoken = tokens.access_token;
					this.config.rtoken = tokens.refresh_token;

				} catch (error) {
					this.log.error(error);
					reject();
				}
			});
		});
	}

	getHomesData() {
		return new Promise((resolve, reject) => {
			this.log.debug("getHomesData");
			request.post({
				url: "https://app.velux-active.com/api/homesdata",
				headers: {
					"Authorization": "Bearer " + this.config.atoken,
					"Accept-Language": "de-DE;q=1, en-DE;q=0.9",
					"User-Agent": "Velux/1.6.0 (iPhone; iOS 13.2; Scale/3.00)",
					"Accept": "*/*",
					"Content-Type": "application/json",
					"Host": "app.velux-active.com"
				},
				body: {
					app_type: "app_velux",
					app_version: "1.6.0"
				},
				json: true,
				followAllRedirects: true
			}, (err, resp, body) => {
				if (err) {
					this.log.error(err);
					reject();
				}
				try {
					if (body.error) {
						this.log.error(JSON.stringify(body.error));
						reject();
					}
					const adapter = this;
					if (body.body && body.body.homes) {

						this.config.homeId = body.body.homes[0].id;
						this.config.bridgeId = body.body.homes[0].modules[0].id;
						traverse(body.body.homes).forEach(function (value) {
							if (this.path.length > 0 && this.isLeaf) {
								const modPath = this.path;
								this.path.forEach((pathElement, pathIndex) => {
									if (!isNaN(parseInt(pathElement))) {
										let stringPathIndex = parseInt(pathElement) + 1 + "";
										while (stringPathIndex.length < 2) stringPathIndex = "0" + stringPathIndex;
										const key = this.path[pathIndex - 1] + stringPathIndex;
										const parentIndex = modPath.indexOf(pathElement) - 1;
										//if (this.key === pathElement) {
										modPath[parentIndex] = key;
										//}
										modPath.splice(parentIndex + 1, 1);
									}
								});
								adapter.setObjectNotExists("home." + modPath.join("."), {
									type: "state",
									common: {
										name: this.key,
										role: "indicator",
										type: "mixed",
										write: false,
										read: true
									},
									native: {}
								});
								adapter.setState("home." + modPath.join("."), value || this.node, true);
							} else if (this.path.length > 0 && !isNaN(this.path[this.path.length - 1])) {
								const modPath = this.path;
								this.path.forEach((pathElement, pathIndex) => {
									if (!isNaN(parseInt(pathElement))) {
										let stringPathIndex = parseInt(pathElement) + 1 + "";
										while (stringPathIndex.length < 2) stringPathIndex = "0" + stringPathIndex;
										const key = this.path[pathIndex - 1] + stringPathIndex;
										const parentIndex = modPath.indexOf(pathElement) - 1;
										//if (this.key === pathElement) {
										modPath[parentIndex] = key;
										//}
										modPath.splice(parentIndex + 1, 1);
									}
								});
						
									const newPath = modPath.length ? "home.":"home";
									adapter.setObjectNotExists(newPath + modPath.join("."), {
										type: "state",
										common: {
											name: this.node.name || this.node.id,
											role: "indicator",
											type: "mixed",
											write: false,
											read: true
										},
										native: {}
									});
								
							}

						});
					}
					if (body.body && body.body.user) {
						Object.keys(body.body.user).forEach(key => {
							this.setObjectNotExists("user." + key, {
								type: "state",
								common: {
									name: key,
									role: "indicator",
									type: "mixed",
									write: false,
									read: true
								},
								native: {}
							});
							this.setState("user." + key, body.body.user[key], true);

						});
					}
					resolve();

				} catch (error) {
					this.log.error(error);
					reject();
				}
			});
		});
	}

	getHomesStatus() {
		return new Promise((resolve, reject) => {
			this.log.debug("getHomesStatus");
			request.post({
				url: "https://app.velux-active.com/syncapi/v1/homestatus",
				headers: {
					"Authorization": "Bearer " + this.config.atoken,
					"Accept-Language": "de-DE;q=1, en-DE;q=0.9",
					"User-Agent": "Velux/1.6.0 (iPhone; iOS 13.2; Scale/3.00)",
					"Accept": "*/*",
					"Content-Type": "application/json",
					"Host": "app.velux-active.com"
				},
				body: {
					home_id: this.config.homeId,
					app_version: "1.6.0"
				},
				json: true,
				followAllRedirects: true
			}, (err, resp, body) => {
				if (err) {
					this.log.error(err);
					reject();
				}
				try {
					if (body.error) {
						this.log.error(JSON.stringify(body.error));
						reject();
					}
					const adapter = this;
					if (body.body && body.body.home) {
						traverse(body.body.home).forEach(function (value) {
							if (this.path.length > 0 && this.isLeaf) {
								const modPath = this.path;
								this.path.forEach((pathElement, pathIndex) => {
									if (!isNaN(parseInt(pathElement))) {
										let stringPathIndex = parseInt(pathElement) + 1 + "";
										while (stringPathIndex.length < 2) stringPathIndex = "0" + stringPathIndex;
										const key = this.path[pathIndex - 1] + stringPathIndex;
										const parentIndex = modPath.indexOf(pathElement) - 1;
										//if (this.key === pathElement) {
										modPath[parentIndex] = key;
										//}
										modPath.splice(parentIndex + 1, 1);
									}
								});
								adapter.setObjectNotExists("home." + modPath.join("."), {
									type: "state",
									common: {
										name: this.key,
										role: "indicator",
										type: "mixed",
										write: false,
										read: true
									},
									native: {}
								});
								adapter.setState("home." + modPath.join("."), value || this.node, true);
							}

						});
					}

					resolve();
				} catch (error) {
					this.log.error(error);
					reject();
				}
			});
		});
	}

	setVeluxState(body) {
		return new Promise((resolve, reject) => {
			this.log.debug("getHomesData");
			request.post({
				url: "https://app.velux-active.com/syncapi/v1/setstate",
				headers: {
					"Authorization": "Bearer " + this.config.atoken,
					"Accept-Language": "de-DE;q=1, en-DE;q=0.9",
					"User-Agent": "Velux/1.6.0 (iPhone; iOS 13.2; Scale/3.00)",
					"Accept": "*/*",
					"Content-Type": "application/json",
					"Host": "app.velux-active.com"
				},
				body: body,
				json: true,
				followAllRedirects: true
			}, (err, resp, body) => {
				if (err) {
					this.log.error(err);
					reject();
				}
				try {
					this.log.info(body);
					resolve();

				} catch (error) {
					this.log.error(error);
					reject();
				}
			});
		});
	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");

			clearInterval(this.refreshTokenInterval);
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			//	this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			//	this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			//	this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			//	this.log.info(`state ${id} deleted`);
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

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