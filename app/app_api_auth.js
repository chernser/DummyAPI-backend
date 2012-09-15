var _ = require('underscore');

module.exports = {

  // Adds authentication endpoints to existing express application
  addAuthEndpoints:function (api) {
    this.addTokenAuth(api);
    this.addUglyGetAuth(api);
  },

  addTokenAuth:function (api) {
    var app = api.app;
    var auth = this;

    app.post('/api/1/simple_token_auth', this.getMiddleware(api), function (req, res) {

      if (req.is('application/json')) {
        var user_name = req.body.user_name;
        var password = req.body.password;
        auth.generalAuthentication(api, user_name, password, req, res);
      } else {
        res.send('Not a JSON', 400);
      }
    });
  },

  addUglyGetAuth:function (api) {
    var app = api.app;
    var auth = this;

    app.get('/api/1/ugly_get_auth', this.getMiddleware(api), function (req, res) {
      var user_name = req.query.username;
      var password = req.query.password;

      auth.generalAuthentication(api, user_name, password, req, res);
    })
  },

  generalAuthentication:function (api, user_name, password, req, res) {
    var auth = this;
    if (typeof user_name != 'string' || typeof password != 'string') {
      res.send("Invalid credentials", 400);
      return;
    }

    auth.authorizeAndGet(api, req.app_id, res, user_name, password, function (err, user) {
      if (err == 'unauthorized' || user == null) {
        res.send("Invalid credentials", 401);
        return;
      } else if (err !== null) {
        console.log("authorizeAndGet():", err);
        res.send(500);
        return;
      }

      // Add cookies

      // Add linked resource
      auth.getLinkedResource(api, req, res, user, function (err, linked_resource) {
        if (err != null) {
          console.log("getLinkedResource():",err);
          res.send(500);
          return;
        }

        var user_to_return = {
          user_id:user.id,
          access_token:user.access_token,
          user_name:user.user_name
        };

        var response = _.extend(user_to_return, linked_resource);
        res.json(response);
      });
    });
  },

  getMiddleware:function (api) {
    return [api.getApplicationIdMiddleware, api.addHeadersMiddleware];
  },

  authorizeAndGet:function (api, app_id, res, user_name, password, callback) {
    var app_storage = api.app_storage;

    app_storage.getUserByName(app_id, user_name, function (err, user) {
      if (err != null) {
        callback(err, null);
        return;
      }

      if (user == null || user.password != password) {
        callback('unauthorized', null)
      }

      callback(null, user);
    });
  },

  EMPTY_RESOURCE:{},

  getLinkedResource:function (api, req, res, user, callback) {
    var app_storage = api.app_storage;
    var auth = this;

    var resource = user != null ? user.resource : null;
    var resource_id = user != null? user.resource_id : null;

    // Override application settings if we set them in query
    if (req.query != null && (!_.isEmpty(req.query.resource) && !_.isEmpty(req.query.resource_id))) {
      resource = req.query.resource;
      resource_id = req.query.resource_id;
    }


    // Check resource name and id
    if (_.isEmpty(resource) || _.isEmpty(resource_id)) {
      callback(null, auth.EMPTY_RESOURCE);
      return;
    }

    app_storage.getObjectType(req.app_id, resource, function (err, object_type) {
      if (err != null || object_type == null) {
        callback(err, null);
      }

      var id = {id:resource_id, id_field:object_type.id_field};

      app_storage.getObjectInstances(req.app_id, resource, id, function (err, resources) {
        if (err != null) {
          callback(err, null);
        }


        if (_.isEmpty(resources)) {
          callback(null, auth.EMPTY_RESOURCE);
        } else {
          var resource = resources[0];
          delete resource._id;
          delete resource.__objectType;
          delete resource.app_id;
          callback(null, resource);
        }
      });
    });
  }

};