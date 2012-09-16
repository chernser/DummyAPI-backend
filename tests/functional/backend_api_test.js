var should = require('should');
var _ = require('underscore');
var async = require('async');
var app_clients = require('../../app/app_clients');


var APPLICATION_NAME = "___Test__Application___";
var bclient = new app_clients.BackendClient();

describe('Backend Configuration API', function () {

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

  it('should have created application', function() {
    application.should.have.property('access_token');
    application.should.have.property('name');
    application.should.have.property('object_types');
  });
});
