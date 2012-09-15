var should = require('should');
var _ = require('underscore');
var async = require('async');
var app_clients = require('../../app/app_clients');




var bclient = new app_clients.BackendClient();
var apiClient = new app_clients.AppApiClient();

describe('Authentication API', function () {

  var application = null;
  var user = null;
  var resource = null;
  var object_type_name_01 = "Resource_01";

  beforeEach(function (done) {

    async.series([
      function (done) {
        bclient.createApp(function (response) {
          application = response.content.data;
          done();
        });
      },

      function (done) {
        bclient.createObjectType(application.id, {name:object_type_name_01, id_field:"id"}, function (response) {
          done();
        });
      },

      function (done) {
        bclient.createResource(application.id, object_type_name_01, { id:"1", test_field:"test_value"}, function (response) {
          resource = response.content.data;
          done();
        });
      },

      function (done) {
        bclient.createUser(application.id, {user_name:"test", password:"test", resource:object_type_name_01,
          resource_id: resource.id},
        function (response) {
          user = response.content.data;
          done();
        });
      }
    ],
    function () {
      done();
    });


  });

  afterEach(function (done) {
    bclient.deleteApp(application.id, function (response) {
      done();
    });
  });

  it("Should return linked resource merged with user", function (done) {

    apiClient.do_ugly_get_auth(application.access_token, user, function (response) {
      var data = response.content.data;

      data.should.have.property('test_field');

      done();
    });
  });

  it("should remove link between user and resource and return only user", function(done) {
    user.resource = '';
    bclient.updateUser(application.id, user, function(response) {
      apiClient.do_ugly_get_auth(application.access_token, user, function (response) {
        var data = response.content.data;

        data.should.have.not.property('test_field');

        done();
      });
    });
  });

});
