var assert = require('assert'),
  _ = require('underscore'),
  client = require('./api_client');

var appClient = client.appClient;
var apiClient = client.apiClient;

var APP_NAME = "TestApplication2";

/* Tests */
suite('application create,update,delete', function () {

  var application = null;

  beforeEach(function (done) {
    apiClient.post('/app/', {name:APP_NAME}, function (response) {
      assert.ok(response.statusCode == 200);
      application = response.body;
      console.log("created application: ", application);
      done();
    });
  });

  afterEach(function (done) {
    apiClient.del('/app/' + application.id, null, function () {
      done();
    });
  });

  test('new applicaiton should be created', function () {
    assert.ok(application.name == APP_NAME);
    assert.ok(_.isString(application.access_token));
    assert.ok(_.isNumber(application.id));
  });

  test('updated application should be returned', function (done) {
    apiClient.put('/app/' + application.id, application, function (response) {
      assert.ok(response.statusCode == 200 || response.statusCode == 204, "Server returned error: " + response.statusCode);
      done();
    });
  });


  test('renew applications access token', function (done) {

    var access_token = application.access_token;
    var app_id = application.id;

    apiClient.post('/app/' + app_id + '/new_access_token', {access_token:access_token}, function (response) {


      assert(response.body.access_token, "Access token is undefined");
      assert(access_token != response.body.access_token, "Access token was not changed");

      done();
    });
  });
});

suite("user and user group manipulations", function () {
  var application = null;
  var credentials = {
    user_name:"tester",
    password:"password"
  };
  var user = null;

  beforeEach(function (done) {
    var createUser = function (done) {
      apiClient.post('/app/' + application.id + '/user/', credentials, function (response) {
        assert.ok(response.statusCode == 200);
        user = response.body;
        done();
      });
    };

    apiClient.post('/app/', {name:APP_NAME}, function (response) {
      assert.ok(response.statusCode == 200);
      application = response.body;
      createUser(done);
    });
  });

  afterEach(function (done) {
    apiClient.del('/app/' + application.id, null, function () {
      assert.ok(response.statusCode == 200);
      done();
    });
  });

  test('add user and get it by id', function () {
    assert.ok(user.user_name == credentials.user_name, 'User name doesn\'t match');
    assert.ok(user.id, 'Id field is missing');
  });


  test('renew user access token', function (done) {
    assert.ok(user.access_token, 'Access token field is missing');

    apiClient.post('/app/' + application.id + '/user/' + user.id + '/new_access_token', null, function (response) {
      assert(response.body.access_token, 'No new access token');
      assert(response.body.access_token != user.access_token, 'Access token is the same as before');

      done();
    });
  });
});


suite("object type create/remove", function () {
  var application = null;
  var object_type = null;
  var object_type_name = "Resource_01";

  beforeEach(function (done) {
    var createObjectType = function (done) {
      apiClient.post('/app/' + application.id + '/object_type/', {name:object_type_name}, function (response) {
        assert.ok(response.statusCode == 200);
        object_type = response.body;
        done();
      });
    };

    apiClient.post('/app/', {name:APP_NAME}, function (response) {
      assert.ok(response.statusCode == 200);
      application = response.body;
      createObjectType(done);
    });
  });

  afterEach(function (done) {
    apiClient.del('/app/' + application.id, null, function () {
      assert.ok(response.statusCode == 200);
      done();
    });
  });

  test('create new object type ', function () {
    assert.ok(object_type_name == object_type.name);
    assert.ok(object_type.route_pattern == '/' + object_type_name + '/{id}/');
    assert.ok(object_type.id_field == '_id');
  });

  test('change id field and route_pattern of object type', function (done) {

    object_type.id_field = "agent_id";
    object_type.route_pattern = "/Agent/this/{id}";
    apiClient.put('/app/' + application.id + '/object_type/' + object_type.name, object_type, function (response) {
      var changed = response.body;

      assert.ok(changed.id_field == object_type.id_field);
      assert.ok(changed.route_pattern == object_type.route_pattern);

      done();
    });
  });

  test('remove object type', function (done) {

    apiClient.get('/app/' + application.id, null, function (response0) {
      application = response0.body;
      assert.ok(application.object_types.length > 0);
      apiClient.del('/app/' + application.id + '/object_type/' + object_type.name, null, function () {
        apiClient.get('/app/' + application.id, null, function (response1) {
          assert.ok(response1.body.object_types.length === 0);
          done();
        });
      });
    });
  });
});


suite("object type instances manipulations", function () {
  var application = null;
  var object_type = null;
  var object_type_name = "Resource_01";

  beforeEach(function (done) {
    var createObjectType = function (done) {
      apiClient.post('/app/' + application.id + '/object_type/', {name:object_type_name}, function (response) {
        assert.ok(response.statusCode == 200);
        object_type = response.body;
        done();
      });
    };

    apiClient.post('/app/', {name:APP_NAME}, function (response) {
      assert.ok(response.statusCode == 200);
      application = response.body;
      createObjectType(done);
    });
  });

  afterEach(function (done) {
    apiClient.del('/app/' + application.id, null, function () {
      assert.ok(response.statusCode == 200);
      done();
    });
  });

  test('create instance', function (done) {
    var instance = {value:123};
    apiClient.post('/app/' + application.id + '/object/' + object_type_name + '/', instance, function (response) {
      var created_instance = response.body;

      assert.ok(created_instance._id);
      apiClient.get('/app/' + application.id + '/object/' + object_type_name + '/' + created_instance._id, null,
        function (response) {
          assert.ok(response.body.value == 123);
          done();
        });

    });
  });

  test('remove instance', function (done) {
    var instance = {value:123};
    apiClient.post('/app/' + application.id + '/object/' + object_type_name + '/', instance, function (response) {
      var created_instance = response.body;

      assert.ok(created_instance._id);
      apiClient.del('/app/' + application.id + '/object/' + object_type_name + '/' + created_instance._id, null,
        function () {

          done();
        });

    });
  });

  test('change instance', function (done) {
    var instance = {value:123};
    apiClient.post('/app/' + application.id + '/object/' + object_type_name + '/', instance, function (response) {
      var created_instance = response.body;

      assert.ok(created_instance._id);
      assert.ok(created_instance.value == 123);

      instance.value = 444;
      apiClient.put('/app/' + application.id + '/object/' + object_type_name + '/' + created_instance._id, instance,
        function (response) {
          assert.ok(response.body.value == instance.value);
          done();
        });

    });
  });

});
