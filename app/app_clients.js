
var _ = require("underscore");

function CommonClient() {
  var Shred = require('shred');
  this.client = new Shred();
}


CommonClient.prototype.defaultCallback = function (response) {
};

CommonClient.prototype.unexpectedResponse = function (response) {
  throw "unexpected response";
};

CommonClient.prototype.internalError = function(response) {
  throw "internal server error";
}

CommonClient.prototype.authError = function(response) {
  throw "authentication error";
}

CommonClient.prototype.ignoreOkResponse = {
  200:CommonClient.prototype.defaultCallback,
  202:CommonClient.prototype.defaultCallback,
  204:CommonClient.prototype.defaultCallback,
  304:CommonClient.prototype.defaultCallback,
  401:CommonClient.prototype.authError,
  500:CommonClient.prototype.internalError,
  response:CommonClient.prototype.unexpectedResponse
};

CommonClient.prototype.doReq = function (method, url, content, callback) {

  var on = null;
  if (_.isFunction(callback)) {
    on = {
      200:callback,
      202:callback,
      204:callback,
      304:callback
    }
  } else if (_.isObject(callback)) {
    on = callback;
  } else {
    on = this.ignoreOkResponse;
  }

  this.client[method]({
    url:url,
    content:content,
    on:on
  });

};

var BackendClient = module.exports.BackendClient = function() {
  this.backend_url = 'http://localhost:8000/api/1';
  this.APPLICATION_NAME = "___Test__Application___";

  return _.extend(new CommonClient(), this);
};

BackendClient.prototype.createApp = function (callback) {
  this.doReq('post', this.backend_url + '/app', {name:this.APPLICATION_NAME}, callback);
};

BackendClient.prototype.deleteApp = function (app_id, callback) {
  this.doReq('delete', this.backend_url + '/app/' + app_id, null, callback);
};

BackendClient.prototype.createUser = function (app_id, user, callback) {
  this.doReq('post', this.backend_url + '/app/' + app_id + '/user/', user, callback);
};

BackendClient.prototype.updateUser = function (app_id, user, callback) {
  this.doReq('put', this.backend_url + '/app/' + app_id + '/user/' + user.id, user, callback);
};

BackendClient.prototype.deleteUser = function (app_id, user_id, callback) {
  this.doReq('delete', this.backend_url + '/app/' + app_id + '/user/' + user_id, null, callback);
};

BackendClient.prototype.createObjectType = function (app_id, object_type, callback) {
  this.doReq('post', this.backend_url + '/app/' + app_id + '/object_type', object_type, callback);
};

BackendClient.prototype.deleteObjectType = function (app_id, object_type, callback) {
  this.doReq('delete', this.backend_url + '/app/' + app_id + '/object_type/' + object_type.name, null, callback);
};

BackendClient.prototype.createResource = function (app_id, object_type, instance, callback) {
  this.doReq('post', this.backend_url + '/app/' + app_id + '/object/' + object_type + '/', instance, callback);
};

BackendClient.prototype.updateResource = function (app_id, object_type, instance, callback) {
  this.doReq('put', this.backend_url + '/app/' + app_id + '/object/' + object_type + '/' + instance._id, instance, callback);
};

BackendClient.prototype.deleteResource = function (app_id, object_type, instance_id, callback) {
  this.doReq('delete', this.backend_url + '/app/' + app_id + '/object/' + object_type + '/' + instance_id, null, callback);
};


var AppApiClient = module.exports.AppApiClient = function () {
  this.api_url = 'http://localhost:8001/api/1';

  return _.extend(new CommonClient(), this);
};

AppApiClient.prototype.do_ugly_get_auth = function (api_key, user, callback) {
  var url = this.api_url + '/ugly_get_auth/?access_token=' + api_key + '&username=' + user.user_name +
  '&password=' + user.password;
  this.doReq('get', url, null, callback);
};