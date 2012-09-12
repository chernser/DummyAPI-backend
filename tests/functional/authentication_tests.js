var assert = require('assert'),
  _ = require('underscore'),
  client = require('./api_client');

var appClient = client.appClient;
var apiClient = client.apiClient;

var APP_NAME = "TestApplication2";


suite("authentication logic test", function () {
  var application = null;
  var object_type = null;
  var object_type_name = "User";
  var credentials = {user_name:"agent007", password:"world_is_not_enough"};
  var user = null;

  beforeEach(function (done) {

    var createUser = function (done) {
      apiClient.post('/app/' + application.id + '/user/', credentials, function (response) {
        user = response.body;
        done();
      });
    };

    var createObjectType = function (done) {
      apiClient.post('/app/' + application.id + '/object_type/', {name:object_type_name, id_field:'id'}, function (response) {
        object_type = response.body;
        createUser(done);
      });
    };

    apiClient.post('/app/', {name:APP_NAME}, function (response) {
      assert.ok(response.statusCode == 200);
      application = response.body;
      appClient.access_token = application.access_token;
      createObjectType(done);
    });
  });

  afterEach(function (done) {
    apiClient.del('/app/' + application.id, null, function () {
      done();
    });
  });

  function getInstanceUrl(id) {
    return '/' + object_type_name + '/' + id;
  }

  test('ugly get authentication', function (done) {

    var instance = { id:user.id, first_name:"Homer", last_name:"Simpson" };
    apiClient.post('/app/' + application.id + '/object/' + object_type_name + '/', instance, function (response) {

      user.resource = object_type_name;
      user.resource_id = new String(user.id);

      apiClient.put('/app/' + application.id + '/user/' + user.id, user, function (response) {
        var auth_query = "/ugly_get_auth?username=" + user.user_name + "&password=" + user.password;
        appClient.get(auth_query, null, function (response) {

          var session = response.body;

          assert.ok(session.first_name == instance.first_name, "First name missing");
          assert.ok(session.last_name == instance.last_name, "Last name missing");

          done();
        });
      });

    });
  });

  test('simple token auth', function (done) {
    var credentials = {user_name:user.user_name, password:user.password};

    appClient.post('/simple_token_auth', credentials, function (response) {

      var session = response.body;
      assert.ok(session.access_token, "Access Token missing");
      done();
    });
  });

});
