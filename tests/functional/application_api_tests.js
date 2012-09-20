var should = require('should');
var _ = require('underscore');
var async = require('async');
var app_clients = require('../../app/app_clients');


var APPLICATION_NAME = "___Test__Application___";
var bclient = new app_clients.BackendClient();
var apiClient = new app_clients.AppApiClient();

describe('Application API', function () {

  var application = null;

  before(function (done) {

    async.series([
      function (done) {
        bclient.createApp(APPLICATION_NAME, function (response) {
          application = response.content.data;
          done();
        });
      }
    ],
    function () {
      done();
    });


  });

  after(function (done) {
    bclient.deleteApp(application.id, function (response) {
      done();
    });
  });

  it('should return application API description', function (done) {
    apiClient.getAPIInfo(application.access_token, function (response) {
      var info = response.content.data;

      info.should.have.property('app_id');
      info.should.have.property('app_name');
      info.should.have.property('resources');
      done();
    });

  });


  it('should create, get, modify and delete resource instance', function (done) {

    var object_type = {name:"Resource_01"};
    var resource = {test_field:"test_value"};

    async.series([

      function (done) {
        bclient.createObjectType(application.id, object_type, function (response) {
          object_type = response.content.data;
          done();
        });
      },

      function (done) {
        apiClient.createResource(application.access_token, object_type.name, resource, function (response) {
          resource = response.content.data;
          resource.should.have.property('test_field').equal("test_value");
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource._id, function (response) {
          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        resource.test_field = "another value";
        apiClient.updateResource(application.access_token, object_type.name, resource._id, resource, function (response) {

          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource._id, function (response) {

          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.deleteResource(application.access_token, object_type.name, resource._id, function (response) {
          response.content.data.should.have.property('removed').equal(true);
          done();
        });
      }

    ], function () {
      done();
    });

  });

  it('should get,modify, delete resource by custom id field', function (done) {
    var object_type = {name:"Resource_02", id_field:'id'};
    var resource = {test_field:"test_value", id:1};

    async.series([

      function (done) {
        bclient.createObjectType(application.id, object_type, function (response) {
          object_type = response.content.data;
          done();
        });
      },

      function (done) {
        apiClient.createResource(application.access_token, object_type.name, resource, function (response) {
          resource = response.content.data;
          resource.should.have.property('test_field').equal("test_value");
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource.id, function (response) {
          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        resource.test_field = "another value";
        apiClient.updateResource(application.access_token, object_type.name, resource.id, resource, function (response) {

          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource.id, function (response) {

          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.deleteResource(application.access_token, object_type.name, resource.id, function (response) {
          response.content.data.should.have.property('removed').equal(true);
          done();
        });
      }

    ], function () {
      done();
    });
  });

  it('should transform resource according proxy function code', function (done) {

    var code = "function proxy(resource) {  "
    + " resource.mocked = true; "
    + " return resource; } ";
    var object_type = {name:"Resource_03", proxy_fun_code:code};

    var resource = {test_field:"test_value"};

    async.series([

      function (done) {
        bclient.createObjectType(application.id, object_type, function (response) {
          object_type = response.content.data;
          done();
        });
      },

      function (done) {
        apiClient.createResource(application.access_token, object_type.name, resource, function (response) {
          resource = response.content.data;
          resource.should.have.property('test_field').equal("test_value");
          response.content.data.should.have.property('mocked').equal(true);
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource._id, function (response) {
          response.content.data.should.eql(resource);
          response.content.data.should.have.property('mocked').equal(true);
          done();
        });
      },

      function (done) {
        resource.test_field = "another value";
        apiClient.updateResource(application.access_token, object_type.name, resource._id, resource, function (response) {
          response.content.data.should.have.property('mocked').equal(true);
          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.getResource(application.access_token, object_type.name, resource._id, function (response) {
          response.content.data.should.have.property('mocked').equal(true);
          response.content.data.should.eql(resource);
          done();
        });
      },

      function (done) {
        apiClient.deleteResource(application.access_token, object_type.name, resource._id, function (response) {
          response.content.data.should.have.property('removed').equal(true);

          done();
        });
      }

    ], function () {
      done();
    });

  });

  it('should create resource base on calculations of id function', function(done) {
    var static_route = { route:'/session', resource:'session',
      id_fun_code:'function id_fun(req) { return {id_field: "id", id: 1}; }'
    };
    var resource_type = {name:'session' };
    var session = {user_name:"test_user"};
    async.series([

      function (done) {
        bclient.createObjectType(application.id, resource_type, function (response) {
          done();
        });
      },

      function (done) {
        bclient.createStaticRoute(application.id, static_route, function(response) {
          done();
        });
      },

      function (done) {
        apiClient.doReq('post', apiClient.api_url + static_route.route + '?access_token=' + application.access_token,
        session,
        function (response) {
          session = response.content.data;

          session.should.have.property("id").eql(1);
          done();
        });
      }
    ], function () {
      done();
    });
  });

  it('should return resource by static route', function (done) {

    var static_route = { route:'/user_session', resource:'user_session',
      id_fun_code:'function id_fun(req) { return {id_field: "id", id: 1}; }'
    };
    var resource_type = {name:'user_session' };
    var session = {id:1, user_name:"test_user"};
    async.series([

      function (done) {
        bclient.createObjectType(application.id, resource_type, function (response) {
          done();
        });
      },

      function (done) {
        bclient.createStaticRoute(application.id, static_route, function(response) {
          done();
        });
      },

      function (done) {
        apiClient.createResource(application.access_token, resource_type.name, session, function (response) {
          session = response.content.data;
          done();
        });
      },


      function (done) {
        apiClient.doReq('get', apiClient.api_url + static_route.route + '?access_token=' + application.access_token,
        null,
        function (response) {
          var result = response.content.data;
          result.should.eql(session);
          done();
        });
      }
    ], function () {
      done();
    });
  });
});
