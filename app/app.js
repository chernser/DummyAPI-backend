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
var DEFAULT_CALLBACK = function (res) {
    return function (err, objects) {
        if (err != null) {
            console.log(err, ':', new Error().stack);
            res.send(500);
            return;
        }

        if (_.isArray(objects)) {
            res.json(objects[0]);
        } else {
            res.json(objects);
        }
    };
};

// Application management
app.get('/api/1/app/:app_id', function (req, res) {
    res.send([]);
});

app.post('/api/1/app/?', function (req, res) {
    var application = {
        name:req.body.name
    };

    console.log("creating application: ", application);
    app.app_storage.addApplication(application, DEFAULT_CALLBACK(res));
});

app.put('/api/1/app/:app_id', function (req, res) {
    var application = {

    };
    app.app_storage.saveApplication(application, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id', function (req, res) {
    console.log("Removing application: ", req.params.app_id);
    app.app_storage.deleteApplication(req.params.app_id, DEFAULT_CALLBACK(res));
});

app.post('/api/1/app/:app_id/new_access_token', function (req, res) {
    app.app_storage.renewAccessToken(req.params.app_id, DEFAULT_CALLBACK(res));
});

// Users and gorup management
app.post('/api/1/app/:app_id/user/?', function (req, res) {
    var user = {
        user_name: req.body.user_name,
        password: req.body.password
    };
    app.app_storage.addUser(req.params.app_id, user, DEFAULT_CALLBACK(res));
});

app.get('/api/1/app/:app_id/user/:id?', function(req, res) {
    app.app_storage.getUser(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

app.put('/api/1/app/:app_id/user/:id', function(req, res) {
    var user = {};

    if (typeof req.body.groups == 'array') {
        user.groups = req.body.groups;
    }

    app.app_storage.saveUser(req.params.app_id, user, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id/user/:id', function(req, res) {
    app.app_storage.deleteUser(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

app.get('/api/1/app/:app_id/user_group/:id?', function(req, res) {
    app.app_storage.getUserGroup(req.params.app_id, req.params.id, DEFAULT_CALLBACK(res));
});

// Object types
app.get('/api/1/app/:app_id/object_type/:name?', function (req, res) {
    app.app_storage.getObjectType(req.params.app_id, req.params.name != null? req.params.name : '*', DEFAULT_CALLBACK(res));
});

app.post('/api/1/app/:app_id/object_type/?', function (req, res) {
    var object_type = {
        name:req.body.name,
        route_pattern:req.body.route_pattern
    };
    app.app_storage.addObjectType(req.params.app_id, object_type, DEFAULT_CALLBACK(res));
});


app.put('/api/1/app/:app_id/object_type/:name', function (req, res) {
    var object_type = {
        name:req.params.name,
        route_pattern:req.body.route_pattern
    };
    app.app_storage.saveObjectType(req.params.app_id, object_type, DEFAULT_CALLBACK(res));
});

app.delete('/api/1/app/:app_id/object_type/:name', function (req, res) {
    app.app_storage.deleteObjectType(req.params.app_id, req.params.name, DEFAULT_CALLBACK(res));
});

// Object instance management

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

    require('process').exit();
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