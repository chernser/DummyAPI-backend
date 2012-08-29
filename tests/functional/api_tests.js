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

        if (appClient.access_token != null) {
            options.headers['Access-Token'] = appClient.access_token;
        }

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
    access_token: null,

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


    test('renew user access token', function (done) {
        assert.ok(user.access_token, 'Access token field is missing');

        apiClient.post('/app/' + application.id + '/user/' + user.id + '/new_access_token', null, function (response) {
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
        password:"password1"
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
            appClient.access_token = application.access_token;
            createUser();
        });
    });

    afterEach(function (done) {
        appClient.access_token = null;
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


    test('ugly get authentication', function (done) {
        apiClient.post('/app/' + application.id + '/object_type/', {name:"User", id_field:'id'}, function (response) {

            var MockUser = { id:user.id, first_name:"Homer", last_name:"Simpson" };
            apiClient.post('/app/' + application.id + '/object_type/User/', MockUser, function (response) {

                var auth_query = "/ugly_get_auth?username=" + user.user_name + "&password=" + user.password +
                    "&resource=User&access_token=" + application.access_token;
                appClient.get(auth_query, null, function (response) {

                    var session = response.body;
                    assert.ok(session.first_name == MockUser.first_name);
                    assert.ok(session.last_name == MockUser.last_name);

                    done();
                });
            });
        });
    });

    test('simple token auth', function (done) {
        var credentials = {user_name: user.user_name, password: user.password};
        console.log(credentials);
        appClient.post('/simple_token_auth', credentials, function (response) {

            var session = response.body;
            console.log(session);

            assert.ok(session.access_token, "Access Token missing");


            done();
        });

    });


});