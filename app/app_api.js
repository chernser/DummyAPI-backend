/**
 *  app_api.js
 *
 *  application API implementation
 *
 *  Author: Sergey Chernov (chernser@outlook.com)
 */

var _ = require('underscore');


var AppApi = module.exports.AppApi = function (app_storage) {

  var express = require('express')
    , socket_io = require('socket.io')
    , config = require('../config')
    , api_auth = require('./app_api_auth')
    , api = this
    , app = null;

  api.app = app = express.createServer();
  api.app_storage = app_storage;
  api.config = config;

  // Configuration
  app.configure(function () {
    app.use(express.bodyParser());
    app.use(express.static(__dirname + '/../public/'));
  });

  app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
  });

  app.configure('production', function () {
    app.use(express.errorHandler());
  });


  // Socket.IO

  api.io = socket_io.listen(app);
  api.all_events = this.io.of('/all_events');

  api.io.configure(function () {
    api.io.set('authorization', function (handshakeData, callback) {
      handshakeData.client_id = handshakeData.query.client_id;
      api.getApplicationIdFromReq(handshakeData.headers, handshakeData.query, function (err, app_id) {
        if (err != null) {
          callback(null, false);
        } else {
          handshakeData.app_id = app_id;
          callback(null, true); // error first callback style
        }
      });
    });
  });

  api.io.on('connection', function (socket) {
    if (_.isUndefined(socket.handshake.client_id)) {
      socket.handshake.client_id = socket.id;
    }
    api.addClientSocket(socket);
    (function (socket) {
      var emit = socket.emit;
      socket.emit = function () {
        var args = Array.prototype.slice.call(arguments);
        emit.apply(socket, arguments);
      };
      var $emit = socket.$emit;
      socket.$emit = function () {
        var args = Array.prototype.slice.call(arguments);
        api.all_events.emit("vent", args);
        $emit.apply(socket, arguments);

        // execute callback
        api.callEventCallback(socket.handshake.app_id, args[0], args);
      };
    })(socket);

    socket.on('disconnect', function () {
      api.delClientSocket(socket);
    });
  });


  // Express.JS
  var ALLOWED_HEADERS = 'Content-Type, X-Parse-REST-API-Key, X-Parse-Application-Id, ' +
    'Access-Token';

  app.options('*', function (req, res) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);

    // TODO: move custom fields to configuration

    res.send(200);
  });


  var getDefaultCallback = function (res) {
    return function (err, object) {
      if (err !== null) {
        res.send(err);
      } else {
        if (object !== null) {
          res.json(object);
        } else {
          res.send(404);
        }
      }
    };
  };

  var getApplicationIdMiddleware = api.getApplicationIdMiddleware = function (req, res, next) {
    api.getApplicationIdFromReq(req.headers, req.query, function (err, app_id) {
      if (err == 'not_found') {
        res.send(400);
      } else if (err != null) {
        res.send(500, err);
      } else {

        req.app_id = app_id;
        next();
      }
    });
  };

  var getUserMiddleware = function (req, res, next) {
    var user_token = req.query.user_token;
    if (typeof user_token != 'string') {
      user_token = req.get('User-Access-Token');
    }


    if (typeof user_token == 'string' && user_token != '') {
      console.log("user token: ", user_token);
      api.app_storage.getUserByAccessToken(user_token, function (err, user) {
        if (err != null) {
          res.send(500, err);
          return;
        }
        req.user_groups = user.hasOwnProperty('groups') ? user.groups : [];

        next();
      });

    } else {
      req.user_groups = [];
      next();
    }
  };

  var addHeadersMiddleware = api.addHeadersMiddleware = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  };

  var middlewares = [getApplicationIdMiddleware, getUserMiddleware, addHeadersMiddleware];

  app.get('/api/1/', middlewares, function (req, res) {
    app_storage.getApplication(req.app_id, function (err, applications) {
      if (err !== null) {
        res.send(500);
        return;
      }

      var application = applications[0];
      var api_def = {
        app_id:application.id,
        app_name:application.name,

        resources:[]
      };

      for (var i in application.objtypes) {
        var objType = application.objtypes[i];
        var baseUrl = '/api/' + objType.name;

        api_def._resources.push({
          ref:objType.name,
          url:baseUrl
        });

        api_def['create_' + objType.name] = {rel:"create", url:baseUrl};
      }

      res.json(api_def);
    });
  });

  // Authentication
  api_auth.addAuthEndpoints(api);


  // Sockte.IO notifications
  app.post('/api/1/socket/event', middlewares, function (req, res) {
    var event = req.body;
    var client_id = _.isUndefined(req.query.client_id) ? req.body.client_id : req.query.client_id;
    var notified = api.notifyApplicationClients(req.app_id, event, client_id);
    res.json({notified_clients:notified});
  });

  app.get('/api/1/socket/clients', middlewares, function (req, res) {
    var clients = api.getSocketIoClients(req.app_id);

    res.json({clients:clients});
  });


  // Resource manipulations (keep them last)
  var API_PATTERN = /^\/api\/1\/+((\w+\/?)+)/;

  app.get(API_PATTERN, middlewares, function (req, res) {
    api.handleGet(req.app_id, req.params[0], getDefaultCallback(res));
  });

  app.post(API_PATTERN, middlewares, function (req, res) {
    api.handlePost(req.app_id, req.params[0], req.body, getDefaultCallback(res));
  });

  app.put(API_PATTERN, middlewares, function (req, res) {
    api.handlePut(req.app_id, req.params[0], req.body, getDefaultCallback(res));
  });

  app.delete(API_PATTERN, middlewares, function (req, res) {
    api.handleDelete(req.app_id, req.params[0], getDefaultCallback(res));
  });

  return this;
};

AppApi.prototype.DEFAULT_RESOURCE_PROXY = function (resource) {
  return resource;
};


AppApi.prototype.start = function () {
  var app = this.app;
  app.listen(this.config.app_api.port, function () {
    console.log("AppAPI listening on port %d in %s mode", app.address().port, app.settings.env);
  });
};

AppApi.prototype.stop = function () {
  var app = this.app;
  app.close();
};


AppApi.prototype.getApplicationIdFromReq = function (headers, query, callback) {
  var api = this;
  var access_token = query.access_token;
  if (typeof access_token != 'string') {
    // TODO: improve
    access_token = headers['access-token'];
  }

  if (typeof access_token != 'string' || access_token == '') {
    callback('not_found', null);
  } else {
    api.app_storage.getAppIdByAccessToken(access_token, function (err, app_id) {
      console.log("application client: ", app_id)
      if (err != null) {
        callback(err, null);
        return;
      } else if (app_id == null) {
        callback('not_found', null);
        return;
      }

      callback(null, app_id);
    });
  }
}


AppApi.prototype.getObjectTypeByRoute = function (app_id, route_pattern, callback) {
  this.app_storage.getObjectTypeByRoute(app_id, route_pattern, function (err, objectType) {
    if (err == 'not_found') {
      callback(404, null);
      return;
    }

    callback(null, objectType);
  });
};

function getProxy(objectType, defaultProxy) {
  if (typeof objectType.proxy_fun_code != 'undefined') {
    var eval_result = eval(objectType.proxy_fun_code);
    if (typeof proxy == 'undefined') {
      return defaultProxy;
    }
    return proxy;
  } else {
    return defaultProxy;
  }
}

function getObjectId(id, objectType) {
  if (typeof id !== 'undefined' && id !== null && id !== '') {
    return typeof objectType.id_field != 'undefined' ? {id_field:objectType.id_field, id:id} : id;
  } else {
    return null;
  }
}

function getRouteInfoFromUrl(url) {
  var parts = url.split('/');
  var routePattern = "/";
  var part_index = 0;
  var no_of_parts = parts.length;
  var id = null;

  while (part_index < no_of_parts && parts[part_index] !== '') {
    // Resource name
    routePattern += parts[part_index] + "/";

    // Resource id
    part_index += 1;
    if (part_index < no_of_parts && parts[part_index] !== '') {
      id = parts[part_index];
    } else {
      id = null;
    }
    routePattern += "{id}/";

    // Next pair
    part_index += 1;
  }

  return {route_pattern:routePattern, id:id};
}

AppApi.prototype.handleGet = function (app_id, url, callback) {
  var api = this;
  var route_info = getRouteInfoFromUrl(url);
  var route_pattern = route_info.route_pattern;
  var id = route_info.id;
  api.getObjectTypeByRoute(app_id, route_pattern, function (err, objectType) {
    if (err !== null) {
      callback(err, null);
      return;
    }
    var proxy = getProxy(objectType, api.DEFAULT_RESOURCE_PROXY);
    id = getObjectId(id, objectType);
    api.app_storage.getObjectInstances(app_id, objectType.name, id, function (err, resources) {
      if (typeof resources != 'undefined' && resources !== null && resources.length >= 0) {
        if (id === null) {
          var response = [];
          for (var index in resources) {
            response.push(proxy(resources[index]));
          }
          callback(null, response);
        } else {
          callback(null, proxy(resources[0]));
        }
      } else {
        callback(null, null);
      }
    });
  });
};

AppApi.prototype.handlePut = function (app_id, url, instance, callback) {
  var api = this;
  var route_info = getRouteInfoFromUrl(url);
  var route_pattern = route_info.route_pattern;
  var id = route_info.id;

  api.getObjectTypeByRoute(app_id, route_pattern, function (err, objectType) {
    if (err !== null) {
      callback(err, null);
      return;
    }

    var proxy = getProxy(objectType, api.DEFAULT_RESOURCE_PROXY);
    id = getObjectId(id, objectType);
    api.app_storage.saveObjectInstance(app_id, objectType.name, id, instance, function (err, saved) {
      var resource = proxy(saved);
      api.notifyResourceChanged(app_id, saved);
      callback(null, resource);
    });
  });
};

AppApi.prototype.handlePost = function (app_id, url, instance, callback) {
  var api = this;
  var route_info = getRouteInfoFromUrl(url);
  var route_pattern = route_info.route_pattern;

  api.getObjectTypeByRoute(app_id, route_pattern, function (err, objectType) {
    if (err !== null) {
      callback(err, null);
      return;
    }

    var proxy = getProxy(objectType, api.DEFAULT_RESOURCE_PROXY);

    api.app_storage.addObjectInstace(app_id, objectType.name, instance, function (err, saved) {
      api.notifyResourceCreated(app_id, saved);
      callback(err, proxy(saved));
    });
  });
};

AppApi.prototype.handleDelete = function (app_id, url, callback) {
  var api = this;
  var route_info = getRouteInfoFromUrl(url);
  var route_pattern = route_info.route_pattern;
  var id = route_info.id;

  api.getObjectTypeByRoute(app_id, route_pattern, function (err, objectType) {
    if (err !== null) {
      callback(err, null);
      return;
    }
    id = getObjectId(id, objectType);
    api.app_storage.deleteObjectInstance(app_id, objectType.name, id, function () {
      api.notifyResourceDeleted({id:id, object_type:objectType.name});
      callback(null, {removed: true});
    });
  });
};


function DEFAULT_NOTIFY_PROXY(event, resource) {
  event.data = resource;
  return event;
}

function getNotifyProxy(application) {
  if (typeof application.notify_proxy_fun != 'undefined') {
    try {
      eval(application.notify_proxy_fun);
      return proxy;
    } catch (e) {
      console.log("Error: failed to eval notify proxy function: ", e.toString(), e);
    }
  }

  return DEFAULT_NOTIFY_PROXY;
}


// Notifications
AppApi.prototype.app_client_sockets = {};

AppApi.prototype.addClientSocket = function (socket) {

  // register client
  var app_id = socket.handshake.app_id;
  var sockets = this.app_client_sockets[app_id];
  if (typeof sockets == 'undefined' || sockets == null) {
    this.app_client_sockets[app_id] = sockets = [];
  }

  sockets.push(socket);

  console.log('application ', app_id, ' client registered socket');
};

AppApi.prototype.delClientSocket = function (socket) {
  // un-register client
  var app_id = socket.handshake.app_id;
  var sockets = this.app_client_sockets[app_id];
  if (typeof sockets != 'undefined' || sockets != null) {
    for (var index in sockets) {
      if (sockets[index] == socket) {
        console.log("Disconnected client found. Remove");
        delete this.app_client_sockets[app_id][index];
        break;
      }
    }
  }
};

AppApi.prototype.notifyApplicationClients = function (app_id, event, client_id) {

  var sockets = this.app_client_sockets[app_id];
  if (typeof sockets == 'undefined') {
    sockets = [];
  }

  var notified = 0;
  var socket = null;
  for (var index in sockets) {
    socket = sockets[index];
    if (_.isUndefined(client_id) || client_id == socket.handshake.client_id) {
      socket.emit(event.name, event.data);
      ++notified;
    }
  }

  return notified;
};

AppApi.prototype.send_event = function (app_id, eventName, eventData, client_id, callback) {
  var api = this;

  api.app_storage.getApplication(app_id, function (err, application) {
    var proxy = getNotifyProxy(application);
    var event = proxy({name:eventName, type:'event'}, eventData);

    api.all_events.emit('vent', event);
    var result = api.notifyApplicationClients(app_id, event, !_.isFunction(client_id) ? client_id : null);
    if (typeof callback == 'function') {
      callback(null, {notified:result});
    } else if (typeof client_id == 'function') {
      client_id(null, {notified:result});
    }
  });
};

AppApi.prototype.notifyResourceChanged = function (app_id, resource) {
  this.send_event(app_id, 'resource_updated', resource);
};

AppApi.prototype.notifyResourceCreated = function (app_id, resource) {
  this.send_event(app_id, 'resource_created', resource);
};

AppApi.prototype.notifyResourceDeleted = function (app_id, resource) {
  this.send_event(app_id, 'resource_deleted', resource);
};

AppApi.prototype.getSocketIoClients = function (app_id) {
  var sockets = this.app_client_sockets[app_id];

  var clients = [];
  for (var index in sockets) {

    clients.push(sockets[index].handshake.client_id);
  }

  return clients;
};


AppApi.prototype.event_callbacks = {};

// Load application event callbacks if not are not loaded yet
AppApi.prototype.loadEventCallbacks = function (app_id, done) {
  console.log("Loading application ", app_id, " callbacks");
  if (!_.isUndefined(this.event_callbacks[app_id])) {
    return;
  }

  var api = this;

  var event_callbacks = api.event_callbacks[app_id] = {};

  api.app_storage.getEventCallbacks(app_id, null, function (err, callbacks) {
    if (err !== null) {
      callback(err, null);
      return;
    }

    console.log("application ", app_id, " callbacks loaded: ", callbacks.length);
    for (var index in callbacks) {
      if (callbacks[index].is_enabled === false) {
        continue;
      }

      var event_name = callbacks[index].event_name;
      var code = callbacks[index].code;
      try {
        eval(code);

        event_callbacks[event_name] = event_callback;
      } catch (E) {
        console.log("Failed to load callback for event: ", event_name, " code: ", code, ": ", E);
      }
    }

    if (_.isFunction(done)) {
      done();
    }

  });
};

AppApi.prototype.updateEventCallback = function (app_id, event_callback) {
  var event_name = event_callback.event_name;
  var code = event_callback.code;
  var api = this;

  if (event_callback.is_enabled === false) {
    this.removeEventCallback(app_id, event_name);
    return;
  }

  var event_callbacks = null;
  if (_.isUndefined(this.event_callbacks[app_id])) {
    event_callbacks = api.event_callbacks[app_id] = {};
  } else {
    event_callbacks = api.event_callbacks[app_id];
  }

  try {
    var fun = new Function(code);
    event_callbacks[event_name] = fun;
  } catch (E) {
    console.log("Failed to update callback for event: ", event_name, " code: ", code);
  }
};

AppApi.prototype.removeEventCallback = function (app_id, event_name) {
  if (_.isUndefined(this.event_callbacks[app_id])) {
    return;
  }

  var event_callbacks = this.event_callbacks[app_id];
  delete event_callbacks[event_name];
};

AppApi.prototype.callEventCallback = function (app_id, event_name, context) {

  var api = this;

  var done = function () {
    var event_callback_fun = api.event_callbacks[app_id][event_name];
    if (_.isFunction(event_callback_fun)) {
      console.log("Callback for event: ", event_name, " triggered");
      var result = event_callback_fun(context);

      // TODO: make response API more complex
      if (!_.isUndefined(result) && result !== null) {
        if (!_.isEmpty(result.event_name)) {
          api.send_event(app_id, result.event_name, result.event_data);
        }
      }
    }
  };


  if (_.isUndefined(this.event_callbacks[app_id])) {
    this.loadEventCallbacks(app_id, done);
  } else {
    done();
  }
}