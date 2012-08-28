var http = require('http'),
    assert = require('assert'),
    _ = require('underscore'),
    app_config = require('../../config'),
    api_base_path = "/api/1/",
    cookie = null;


var apiClient = {
    general:function (method, url, port, req_data, cb) {

        var options = {
            host:'localhost',
            port:port,
            path:(api_base_path + url).replace('//', '/'),
            method:method,
            headers:{Cookie:cookie, 'Content-Type':'application/json'}
        };

        var req = http.request(
            options,

            function (response) {
                var data = '';

                response.on('data', function (chunk) {
                    data += chunk.toString();
                });

                var endFunction = function () {
                    assert.ok(response.statusCode != 500, "Internal Server Error");
                    assert.ok(response.statusCode != 401, "Unathorized");


                    if (data.length > 0 && response.headers['content-type'].indexOf('application/json') >= 0) {
                        response.body = JSON.parse(data);
                    } else {
                        response.body = data;
                    }

                    if (_.isFunction(cb)) {
                        cb(response);
                    }
                };

                response.on('end', endFunction);

            });


        if (req_data != null) {
            req_data = JSON.stringify(req_data);
            if (_.isString(req_data)) {
                req.write(req_data);
            }
        }
        req.end();

    },
    get:function (url, data, cb) {
        apiClient.general('GET', url, app_config.backend.port, data, cb)
    },
    post:function (url, data, cb) {
        apiClient.general('POST', url, app_config.backend.port, data, cb)
    },
    put:function (url, data, cb) {
        apiClient.general('PUT', url, app_config.backend.port, data, cb)
    },
    del:function (url, data, cb) {
        apiClient.general('DELETE', url, app_config.backend.port, data, cb)
    }
}

var appClient = {

    get:function (url, data, cb) {
        apiClient.general('GET', url, app_config.app_api.port, data, cb)
    },
    post:function (url, data, cb) {
        apiClient.general('POST', url, app_config.app_api.port, data, cb)
    },
    put:function (url, data, cb) {
        apiClient.general('PUT', url, app_config.app_api.port, data, cb)
    },
    del:function (url, data, cb) {
        apiClient.general('DELETE', url, app_config.app_api.port, data, cb)
    }
}


function assertStatus(code) {
    return function (res, b, c) {
        assert.equal(res.statusCode, code);
    };
}


function assertJSONHead() {
    return function (res, b, c) {
        assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
    }
}

function assertValidJSON() {
    return function (res, b) {
        // this can either be a Object or Array
        assert.ok(typeof( res.body ) == 'object')
        //assert.isObject( res.body)
    }
}


var APP_NAME = "TestApplication";

/* Tests */
suite('application create/update/delete', function () {

    var application = null;

    beforeEach(function (done) {
        apiClient.post('/app/', {name:APP_NAME}, function (response) {
            application = response.body;
            done();
        });
    });

    afterEach(function (done) {
        apiClient.del('/app/' + application.id, null, function () {
            done()
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
                user = response.body;
                done();
            });
        };

        apiClient.post('/app/', {name:APP_NAME}, function (response) {
            application = response.body;
            createUser(done);
        });
    });

    afterEach(function (done) {
        apiClient.del('/app/' + application.id, null, function () {
            done();
        });
    });

    test('add user and get it by id', function () {
        assert.ok(user.user_name == credentials.user_name, 'User name doesn\'t match');
        assert.ok(user.id, 'Id field is missing');
    });


    test('renew user access token', function(done) {
        assert.ok(user.access_token, 'Access token field is missing');

        apiClient.post('/app/' + application.id + '/user/' + user.id + '/new_access_token', null, function(response) {
            assert(response.body.access_token, 'No new access token');
            assert(response.body.access_token != user.access_token, 'Access token is the same as before');

            done();
        });
    });
});


suite('basic test of app_api', function () {

    var application = null;
    var credentials = {
        user_name:"tester",
        password:"password"
    };
    var user = null;


    beforeEach(function (done) {
        var createUser = function () {
            apiClient.post('/app/' + application.id + '/user/', credentials, function (response) {
                user = response.body;
                done();
            });
        };

        apiClient.post('/app/', {name:APP_NAME}, function (response) {
            application = response.body;
            createUser();
        });
    });

    afterEach(function (done) {
        apiClient.del('/app/' + application.id, null, function () {
            done()
        });
    });

    test('get root api resource', function (done) {
        appClient.get('?access_token=' + application.access_token
                      + '&user_token=' + user.access_token, null, function (response) {
            var api_def = response.body;
            assert.ok(api_def.resources, "No resources field");
            done();

        });

    });
});