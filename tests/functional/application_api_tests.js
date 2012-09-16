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

});
