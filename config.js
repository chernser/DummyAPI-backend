/*
  real cheap configuration.
  adjust to your needs
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

/* express settings for webui
*/
config.webui = {};
config.webui.port = 8000;

module.exports = config;