var app_config = require('../../config'),
    api_base_path = "/api/1/",
    http = require('http'),
    cookie = null,
    assert = require('assert'),
    _ = require('underscore');


var apiClient = module.exports.apiClient = {
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

var appClient = module.exports.appClient = {
    access_token:null,

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