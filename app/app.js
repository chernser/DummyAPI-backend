/**
 * Main applications
 * Manges rest
 */

var express = require('express'),
  routes = require('./routes'),
  config = require('./config'),
  app_storage = require('./app_storage.js')(function () {
    ApplicationController.startApplications();
  });

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

// Routes
app.get('/', routes.index);
app.get('/about', routes.about);
app.get('/app/:id/:subject?', routes.application);


// API
function createResourceGetter(res, notify, app_id) {
  return function (resource) {
    if (typeof app_id != 'undefined') {
      if (notify == 'updated') {
        ApplicationController.notifyResourceChanged(app_id, resource);
      }

      if (notify == 'created') {
        ApplicationController.notifyResourceCreated(app_id, resource);
      }
    }

    res.json(resource);
  };
}

var app_api = require("./app_api.js");

// Application controller logic
var ApplicationController = {

  running:{},

  /**
   * [startApplications description]
   * @return {[type]} [description]
   */
  startApplications:function () {
    var that = this;
    app_storage.getApplicationList(function (applications) {
      for (var app_i in applications) {
        if (applications[app_i].state != 'started') {
          applications[app_i].state = 'stopped';
          applications[app_i].api_port = 0;
          app_storage.saveApplication(applications[app_i]);

          continue;
        }

        that.startAppApi(applications[app_i], applications[app_i].api_port);
      }
    });
  },

  /**
   * [startAppApi description]
   * @param  {[type]} application [description]
   * @param  {[type]} port        [description]
   * @return {[type]}             [description]
   */
  startAppApi:function (application, port) {
    if (typeof this.running[application.id] != 'undefined') {
      return;
    }
    console.log(app_api);
    var api = this.running[application.id] = app_api.createApi(application.id);
    api.start();
    if (application.routes_are_published) {
      api.publish_routes();
    }
    application.state = 'started';
    application.api_port = api.port;
    console.log("api started for application: ", application.id);
  },

  changeState:function (application, state) {
    if (state != 'starting' && state != 'stopping') {
      return null;
    }

    if (state == 'starting') {
      this.startAppApi(application);
    } else {
      if (typeof this.running[application.id] != 'undefined') {
        this.running[application.id].stop();
        delete this.running[application.id];
        application.state = 'stopped';
        application.api_port = 0;
        console.log("api stopped");
      }
    }

    return application;
  },

  /**
   * [getApi description]
   * @param  {[type]} app_id [description]
   * @return {[type]}        [description]
   */
  getApi:function (app_id) {
    if (typeof this.running[app_id] == 'undefined') {
      return null;
    }

    return this.running[app_id];
  },

  /**
   * [publishRoutes description]
   * @param  {[type]} application [description]
   * @param  {[type]} newState    [description]
   * @return {[type]}             [description]
   */
  publishRoutes:function (application, newState) {
    var api = this.getApi(application.id);
    if (api !== null) {
      if (newState === true) {
        api.publish_routes();
      } else {
        api.unpublish_routes();
      }
    }
    application.routes_are_published = newState;
    return application;
  },

  /**
   * [notifyResourceChanged description]
   * @param  {[type]} app_id   [description]
   * @param  {[type]} resource [description]
   * @return {[type]}          [description]
   */
  notifyResourceChanged:function (app_id, resource) {
    var api = this.getApi(app_id);
    if (api !== null) {
      api.notifyResourceChanged(resource);
    }
  },

  /**
   * [notifyResourceCreated description]
   * @param  {[type]} app_id   [description]
   * @param  {[type]} resource [description]
   * @return {[type]}          [description]
   */
  notifyResourceCreated:function (app_id, resource) {
    var api = this.getApi(app_id);
    if (api !== null) {
      api.notifyResourceCreated(resource);
    }
  },

  /**
   * [notifyResourceDeleted description]
   * @param  {[type]} app_id   [description]
   * @param  {[type]} resource [description]
   * @return {[type]}          [description]
   */
  notifyResourceDeleted:function (app_id, resource) {
    var api = this.getApi(app_id);
    if (api !== null) {
      api.notifyResourceDeleted(resource);
    }
  }
};

var ApplicationStateTriggers = [

  // handle changing application attributes
  function (application, diff) {
    if (typeof diff['notify_proxy_fun'] == 'object') {
      application.notify_proxy_fun = diff['notify_proxy_fun'].newS;
    }

    return application;
  },

  // handles state change
  function (application, diff) {
    console.log('diff', diff);
    if (typeof diff['state'] == 'object') {
      return ApplicationController.changeState(application, diff['state'].newS);
    }

    if (typeof diff['routes_are_published'] == 'object') {
      return ApplicationController.publishRoutes(application, diff['routes_are_published'].newS);
    }

    return application;
  }
];

app.post('/api/app', function (req, res) {
  console.log("Creating new application: ", req.body);
  app_storage.addApplication(req.body, createResourceGetter(res));
});

app.get('/api/app/:id', function (req, res) {
  console.log("Getting application: ", req.params.id);
  app_storage.getApplication(req.params.id, createResourceGetter(res));
});

app.put('/api/app/:id', function (req, res) {
  console.log("Updateing application: ", req.body);

  app_storage.getApplication(req.params.id, function (application) {
    var diff = app_storage.getStateDiff(application, req.body);

    for (var i in ApplicationStateTriggers) {
      application = ApplicationStateTriggers[i](application, diff);

      if (application === null) {
        res.send(405);
        return;
      }
    }

    console.log("saving application state", application);
    app_storage.saveApplication(application, createResourceGetter(res));
  });
});

app.delete('/api/app/:id', function (req, res) {
  console.log("Removing application: ", req.params.id);

  app_storage.deleteApplication(req.params.id, function () {
    req.send(200);
  });
});


app.post('/api/app/:id/access_token', function(req, res) {
    console.log("Renewing application: ", req.params.id, " access token");

    app_storage.renewAccessToken(req.params.id, function(err, new_token){
        if (err != null)  {
            res.send(500);
        } else {
            res.send({new_token: new_token});
        }
    });

});

// Object Types
app.post('/api/app/:appId/objtype/', function (req, res) {
  console.log("Creating new object type: ", req.body, " for application ", req.params.appId);

  app_storage.addObjectType(req.params.appId, req.body, createResourceGetter(res));
});

app.put('/api/app/:appId/objtype/:objType', function (req, res) {
  console.log("Updating object type: ", req.body, " of application ", req.params.appId);

  app_storage.saveObjectType(req.params.appId, req.body, createResourceGetter(res));
});

app.get('/api/app/:appId/objetype/:id', function (req, res) {
  console.log("Getting object type ", req.params.id, " from application ", req.params.appId);

  app_storage.getObjectType(req.params.appId, req.params.id, createResourceGetter(res));
});

var empty_object = {};
app.delete('/api/app/:appId/objtype/:id', function (req, res) {
  console.log("Removing object type", req.params.id, " from application ", req.params.appId);

  app_storage.deleteObjectType(req.params.appId, req.params.id, function (err) {
    if (err == 'not_found') {
      res.send(404);
    } else if (err !== null) {
      res.send(500);
    } else {
      res.send(empty_object);  // TODO: backbone expects json response event for delete
    }
  });
});


// Object type instances
app.post('/api/app/:appId/:objType/', function (req, res) {
  app_storage.getObjectType(req.params.appId, req.params.objType, function (err, objectType) {
    var getter = createResourceGetter(res, 'created', req.params.appId);
    app_storage.addObjectInstace(req.params.appId, objectType.name, req.body, getter);
  });
});

app.get('/api/app/:appId/:objType/:id?', function (req, res) {
  app_storage.getObjectType(req.params.appId, req.params.objType, function (err, objectType) {
    var id = typeof req.params.id == 'undefined'? null : req.params.id;
    app_storage.getObjectInstances(req.params.appId, objectType.name, id, createResourceGetter(res));
  });
});

app.put('/api/app/:appId/:objType/:id', function (req, res) {
  app_storage.getObjectType(req.params.appId, req.params.objType, function (err, objectType) {
    var getter = createResourceGetter(res, 'updated', req.params.appId);
    var instanceId = {id_field: '_id', id: req.params.id};
    app_storage.saveObjectInstance(req.params.appId, objectType.name, instanceId, req.body, getter);
  });
});

app.delete('/api/app/:appId/:objType/:id', function (req, res) {
  app_storage.getObjectType(req.params.appId, req.params.objType, function (err, objectType) {
    var instanceId = {id_field: '_id', id: req.params.id};
    app_storage.deleteObjectInstance(req.params.appId, objectType.name, instanceId, function() {
      ApplicationController.notifyResourceDeleted(req.params.appId, {_id: req.params.id});
      res.send(200);
    });
  });
});

// start the server
app.listen(config.webui.port, function () {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
