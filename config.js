/*

    Config.js - main configuration file for application backend
*/

var config = {};

/* mongodb settings */
config.mongo = {};
config.mongo.server = 'localhost';
config.mongo.port = 27017;
config.mongo.db = 'application_storage';
config.mongo.username = '';
config.mongo.password = '';
config.mongo.useNative = false;
config.mongo.poolSize = 2;
config.mongo.reconnect = true;

/* backend settings */
config.backend = {};
config.backend.port = 8000; // port of express-js server

/* application api settings */
config.app_api = {};
config.app_api.port = 8001; // port of app-api express-js server

// Export as module
module.exports = config;