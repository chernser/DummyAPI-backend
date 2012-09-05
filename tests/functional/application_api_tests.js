var assert = require('assert'),
    _ = require('underscore'),
    client = require('./api_client');

var appClient = client.appClient;
var apiClient = client.apiClient;

var APP_NAME = "TestApplication";

/* Tests */
suite("object type instances manipulations via application api", function () {
    var application = null;
    var object_type = null;
    var object_type_name = "Resource_01";

    beforeEach(function (done) {
        var createObjectType = function (done) {
            apiClient.post('/app/' + application.id + '/object_type/', {name:object_type_name}, function (response) {
                object_type = response.body;
                done();
            });
        };

        apiClient.post('/app/', {name:APP_NAME}, function (response) {
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

    test('create instance', function (done) {
        var instance = {value:123};
        appClient.post(getInstanceUrl(''), instance, function (response) {
            var created_instance = response.body;
            assert.ok(created_instance._id);
            appClient.get(getInstanceUrl(created_instance._id), null,
                function (response) {
                    assert.ok(response.body.value == 123);
                    done();
                });

        });
    });

    test('remove instance', function (done) {
        var instance = {value:123};
        appClient.post(getInstanceUrl(''), instance, function (response) {
            var created_instance = response.body;

            assert.ok(created_instance._id);
            appClient.del(getInstanceUrl(created_instance._id), null,
                function () {

                    done();
                });

        });
    });

    test('change instance', function (done) {
        var instance = {value:123};
        appClient.post(getInstanceUrl(''), instance, function (response) {
            var created_instance = response.body;

            assert.ok(created_instance._id);
            assert.ok(created_instance.value == 123);

            instance.value = 444;
            appClient.put(getInstanceUrl(created_instance._id), instance,
                function (response) {
                    assert.ok(response.body.value == instance.value);
                    done();
                });

        });
    });

    test('set custom proxy function', function (done) {
        var NEW_PROXY_FUN = 'function proxy(resource) { ' +
            '   resource.mocked = true;' +
            '   return resource;' +
            '}';

        object_type.proxy_fun_code = NEW_PROXY_FUN;
        apiClient.put('/app/' + application.id + '/object_type/' + object_type_name, object_type, function (response) {
            var instance = {value:123};
            appClient.post(getInstanceUrl(''), instance, function (response) {
                var created_instance = response.body;
                assert.ok(created_instance._id);
                appClient.get(getInstanceUrl(created_instance._id), null,
                    function (response) {
                        assert.ok(response.body.value == 123);
                        assert.ok(response.body.mocked == true);
                        done();
                    });

            });

        });
    });

});


