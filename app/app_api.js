/**
 *  app_api.js
 *
 *  application API implementation
 *
 *  Author: Sergey Chernov (chernser@outlook.com)
 */


var AppApi = module.exports.AppApi = function (app_storage) {

    var express = require('express')
        , socket_io = require('socket.io')
        , config = require('../config')
        , api = this
        , app = null;

    this.app = app = express.createServer();
    this.app_storage = app_storage;
    this.config = config;

        // Configuration
    app.configure(function () {
        app.use(express.static(__dirname + '/public'));
    });

    app.configure('development', function () {
        app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
    });

    app.configure('production', function () {
        app.use(express.errorHandler());
    });



    // Socket.IO
    this.socket_io_port = 10100;
    this.io = socket_io.listen(this.socket_io_port);

    this.io.on('connection', function (socket) {
        api.socket = socket;
    });


    // Express.JS
    var ALLOWED_HEADERS = 'Content-Type, X-Parse-REST-API-Key, X-Parse-Application-Id, ' +
        'Access-Token';

    app.options('*', function (req, res) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELTE, OPTIONS');
        res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);

        // TODO: move custom fields to configuration

        res.send(200);
    });


    var API_PATTERN = /^\/api\/1\/+((\w+\/?)+)/;

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

    var getApplicationIdMiddleware = function (req, res, next) {
        var access_token = req.query.access_token;
        if (typeof access_token != 'string') {
            access_token = req.get('Access-Token');
        }

        if (typeof access_token != 'string' || access_token == '') {
            res.send(401);
            return;
        }

        console.log(">> access_token: ", access_token);

        api.app_storage.getAppIdByAccessToken(access_token, function(err, app_id) {
            if (err != null) {
                res.send(500, err);
                return;
            }

            console.log(">> application id: ", app_id);
            req.app_id = app_id;

            next();
        });
    };

    var addHeadersMiddleware = function(req, res, next) {

        res.header('Access-Control-Allow-Origin', '*');
        next();
    };

    var middlewares = [getApplicationIdMiddleware, addHeadersMiddleware];

    app.get('/api/1/', middlewares, function (req, res) {
        app_storage.getApplication(req.app_id, function (err, application) {

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
    if (typeof objectType.proxy_code != 'undefined') {
        var eval_result = eval(objectType.proxy_code);
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
        api.app_storage.getObjectInstances(app_id, objectType.name, id, function (resources) {
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
        api.app_storage.saveObjectInstance(app_id, objectType.name, id, instance, function (saved) {
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

        api.app_storage.addObjectInstace(app_id, objectType.name, instance, function (saved) {
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
            callback(null, null);
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

AppApi.prototype.send_event = function (app_id, eventName, eventData) {
    var api = this;

    if (typeof api.socket == 'undefined') {
        console.log("Socket is not yet initialized");
        return;
    }

    api.app_storage.getApplication(app_id, function (application) {
        var proxy = getNotifyProxy(application);
        var event = proxy({name:eventName, type:'event'}, eventData);

        if (typeof event.name != 'undefined' && event.name !== '') {
            eventName = event.name;
        }

        if (typeof event.data != 'undefined') {
            eventData = event.data;
        }
        api.socket.emit(eventName, eventData);
    });
};

AppApi.prototype.notifyResourceChanged = function (resource) {
    this.send_event('resource_updated', resource);
};

AppApi.prototype.notifyResourceCreated = function (resource) {
    this.send_event('resource_created', resource);
};

AppApi.prototype.notifyResourceDeleted = function (resource) {
    this.send_event('resource_deleted', resource);
};