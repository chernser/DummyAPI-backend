/**
 *  app.js
 *
 *  DummyAPI backend server implementation
 *
 *  Author: Sergey Chernov (chernser@outlook.com)
 */

var express = require('express'),
    config = require('../config'),
    mongo_db = require('mongodb'),
    _ = require('underscore');


var app = module.exports = express.createServer();

// Configuration

app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.set('view options', { pretty:true });
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.compiler({ src:__dirname + '/public', enable:['less']}));
    app.use(express.cookieParser());
    app.use(express.session({ secret:'your secret here' }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

// Now less files with @import 'whatever.less' will work(https://github.com/senchalabs/connect/pull/174)
var TWITTER_BOOTSTRAP_PATH = './node_modules/twitter-bootstrap-node/vendor/bootstrap/less';
express.compiler.compilers.less.compile = function (str, fn) {
    try {
        var less = require('less');
        var parser = new less.Parser({paths:[TWITTER_BOOTSTRAP_PATH]});
        parser.parse(str, function (err, root) {
            fn(err, root.toCSS());
        });
    } catch (err) {
        fn(err);
    }
};

app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});


// API
var DEFAULT_CALLBACK = function (res, single_result) {
    if (_.isUndefined(single_result)) {
        single_result = true;
    }

    return function (err, objects) {
        if (err == 'not_found') {
            res.send(404);
            return;
        } else if (err == 'invalid') {
            res.send(400);
            return;
        } else if (err == 'already_exists') {
            res.send(409);
            return;
        } else if (typeof err != 'undefined' && err !== null) {
            console.log(err, ':', new Error().stack);
            res.send(500);
            return;
        }

        if (single_result == true) {

            if (_.isArray(objects) && _.isEmpty(objects)) {
                res.send(404);
                return;
            } else if (_.isArray(objects)) {
                res.json(objects[0]);
                return;
            }
        }
        res.json(objects);


    };
};

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

var addHeadersMiddleware = function (req, res, next) {

    res.header('Access-Control-Allow-Origin', '*');
    next();
};

var middleware = [addHeadersMiddleware];

app.get('/api/1/app/:app_id?', middleware, function (req, res) {
    app.app_storage.getApplication(req.params.app_id, DEFAULT_CALLBACK(res, !_.isUndefined(req.params.app_id)));
});

app.post('/api/1/app/?', middleware, function (req, res) {
    var application = {
        name:req.body.name,
        description:req.body.description
    };
    app.app_storage.addApplication(application, DEFAULT_CALLBACK(res));
});

app.put('/api/1/app/:app_id', middleware, function (req, res) {
    var application = {
        id:req.params.app_id,
        notify_proxy_fun:req.body.notify_proxy_fun,
        description:req.body.description
    };
    app.app_storage.saveApplication(application, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id', middleware, function (req, res) {
    app.app_storage.deleteApplication(req.params.app_id, DEFAULT_CALLBACK(res));
});


// Application 'actions'

app.post('/api/1/app/:app_id/new_access_token', middleware, function (req, res) {
    app.app_storage.renewAccessToken(req.params.app_id, DEFAULT_CALLBACK(res));
});

app.post('/api/1/app/:app_id/send_event', middleware, function (req, res) {
    app.app_api.send_event(req.params.app_id, req.body.name, req.body.data, DEFAULT_CALLBACK(res));
});

// Users and group management
function getUserFromReq(req) {
    var user = {
        id:req.params.id,
        password:req.body.password,
        user_name:req.body.user_name,
        resource:req.body.resource,
        resource_id:req.body.resource_id
    };

    if (typeof req.body.groups == 'array' || typeof req.body.groups == 'object') {
        user.groups = req.body.groups;
    } else if (typeof req.body.groups == 'string') {
        user.groups = req.body.groups.split(',');
    }

    return user;
}
app.post('/api/1/app/:app_id/user/?', middleware, function (req, res) {
    var user = getUserFromReq(req);
    app.app_storage.addUser(req.params.app_id, user, DEFAULT_CALLBACK(res));
});

app.post('/api/1/app/:app_id/user/:id/new_access_token/?', middleware, function (req, res) {
    app.app_storage.renewUserAccessToken(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

app.get('/api/1/app/:app_id/user/:id?', middleware, function (req, res) {
    app.app_storage.getUser(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res, !_.isUndefined(req.params.id)));
});

app.put('/api/1/app/:app_id/user/:id', middleware, function (req, res) {
    var user = getUserFromReq(req);
    app.app_storage.saveUser(req.params.app_id, user, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id/user/:id', middleware, function (req, res) {
    app.app_storage.deleteUser(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

app.get('/api/1/app/:app_id/user_group/:id?', middleware, function (req, res) {
    app.app_storage.getUserGroup(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res, !_.isUndefined(req.params.id)));
});

app.post('/api/1/app/:app_id/user_group/', middleware, function (req, res) {
    var user_group = { name:req.body.name};
    app.app_storage.addUserGroup(req.params.app_id, user_group, DEFAULT_CALLBACK(res));
});

app.put('/api/1/app/:app_id/user_group/:id', middleware, function (req, res) {
    var user_group = { id:req.params.id, name:req.body.name};
    app.app_storage.saveUserGroup(req.params.app_id, user_group, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id/user_group/:id', middleware, function (req, res) {
    app.app_storage.deleteUserGroup(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

// Object types
app.get('/api/1/app/:app_id/object_type/:name?', middleware, function (req, res) {
    app.app_storage.getObjectType(req.params.app_id, req.params.name != null ? req.params.name : '*',
        DEFAULT_CALLBACK(res, !_.isUndefined(req.params.name)));
});

app.post('/api/1/app/:app_id/object_type/?', middleware, function (req, res) {
    var object_type = {
        name:req.body.name,
        route_pattern:req.body.route_pattern,
        id_field:req.body.id_field
    };
    console.log("params: ", req.params);
    app.app_storage.addObjectType(req.params.app_id, object_type, DEFAULT_CALLBACK(res));
});


app.put('/api/1/app/:app_id/object_type/:name', middleware, function (req, res) {
    var object_type = {
        name:req.params.name,
        route_pattern:req.body.route_pattern,
        id_field:req.body.id_field,
        proxy_fun_code:req.body.proxy_fun_code
    };
    app.app_storage.saveObjectType(req.params.app_id, object_type, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id/object_type/:name', middleware, function (req, res) {
    app.app_storage.deleteObjectType(req.params.app_id, req.params.name, DEFAULT_CALLBACK(res));
});

// Object instance management

//TODO: rework!!!
var CALLBACK_WITH_CALLBACK = function (res, callback) {
    return function (err, objects) {
        if (err != null) {
            console.log(err, ':', new Error().stack);
            res.send(500);
            return;
        }

        res.json(objects);
        callback(objects);
    };
};

app.post('/api/1/app/:app_id/object/:name/?', middleware, function (req, res) {
    delete req.body._id;
    app.app_storage.addObjectInstace(req.params.app_id, req.params.name, req.body,
        CALLBACK_WITH_CALLBACK(res, function (objects) {
            app.app_api.notifyResourceCreated(req.params.app_id, objects);
        }));
});

app.get('/api/1/app/:app_id/object/:name/:id?', middleware, function (req, res) {
    app.app_storage.getObjectInstances(req.params.app_id, req.params.name, req.params.id,
        DEFAULT_CALLBACK(res, !_.isUndefined(req.params.id)));
});

app.put('/api/1/app/:app_id/object/:name/:id', middleware, function (req, res) {
    app.app_storage.saveObjectInstance(req.params.app_id, req.params.name, req.params.id, req.body,
        CALLBACK_WITH_CALLBACK(res, function (objects) {
            app.app_api.notifyResourceChanged(req.params.app_id, objects);
        }));
});

app.delete('/api/1/app/:app_id/object/:name/:id?', middleware, function (req, res) {
    app.app_storage.deleteObjectInstance(req.params.app_id, req.params.name, req.params.id,
        CALLBACK_WITH_CALLBACK(res, function () {
            app.app_api.notifyResourceDeleted(req.params.app_id, {id:req.params.id, object_type:req.params.name});
        }));
});


// === Application Startup Logic ====
app.state = new (require('events')).EventEmitter();

app.state.on('start', function () {

    // Init db
    var db_server = new mongo_db.Server(
        config.mongo.server,
        config.mongo.port,
        {auto_reconnect:config.mongo.reconnect,
            poolSize:config.mongo.poolSize}
    );

    app.db = new mongo_db.Db(config.mongo.db, db_server, {native_parser:config.mongo.useNative});

    app.db.open(function (err, db) {

        if (err != null) {
            app.state.emit('db_init_error');
            return;
        }


        // authenticate
        if (config.mongo.username !== '' && config.mongo.password !== '') {
            app.db.authenticate(config.mongo.username, config.mongo.password, function (err) {
                if (err != null) {
                    app.state.emit('db_init_error');
                    return;
                }
                app.state.emit('db_ready');
            });
        } else {
            app.state.emit('db_ready');
        }
    });
});

app.state.on('stop', function () {
    process.exit(1);
});

app.state.on('db_init_error', function () {
    console.log("application:Failed to init database");

    app.state.emit('stop');
});

app.state.on('db_ready', function () {
    console.log("application:db_ready");

    // Init app_storage
    app.app_storage = new (require('./app_storage')).AppStorage(config, app.db);
    app.app_api = new (require('./app_api')).AppApi(app.app_storage);

    app.state.emit('every_thing_ready');
});

app.state.on('every_thing_ready', function () {
    console.log("application:go_go_go!");


    // start the servers
    app.app_api.start();

    app.listen(config.backend.port, function () {
        console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
    });
});


// Start application
app.state.emit("start");