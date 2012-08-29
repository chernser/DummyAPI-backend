var app_api = require("./app_api.js");

// Application controller logic
var ApplicationController = {

    running:{},

    startApplications:function () {
        var that = this;
        app_storage.getApplicationList(function (applications) {
            for (var app_i in applications) {
                if (applications[app_i].state != 'started') {
                    applications[app_i].state = 'stopped';
                    applications[app_i].api_port = 0;
                    app_storage.saveApplication(applications[app_i]);

                    continue;
                }

                that.startAppApi(applications[app_i], applications[app_i].api_port);
            }
        });
    },

    startAppApi:function (application, port) {
        if (typeof this.running[application.id] != 'undefined') {
            return;
        }
        console.log(app_api);
        var api = this.running[application.id] = app_api.createApi(application.id);
        api.start();
        if (application.routes_are_published) {
            api.publish_routes();
        }
        application.state = 'started';
        application.api_port = api.port;
        console.log("api started for application: ", application.id);
    },

    changeState:function (application, state) {
        if (state != 'starting' && state != 'stopping') {
            return null;
        }

        if (state == 'starting') {
            this.startAppApi(application);
        } else {
            if (typeof this.running[application.id] != 'undefined') {
                this.running[application.id].stop();
                delete this.running[application.id];
                application.state = 'stopped';
                application.api_port = 0;
                console.log("api stopped");
            }
        }

        return application;
    },

    getApi:function (app_id) {
        if (typeof this.running[app_id] == 'undefined') {
            return null;
        }

        return this.running[app_id];
    },

    publishRoutes:function (application, newState) {
        var api = this.getApi(application.id);
        if (api !== null) {
            if (newState === true) {
                api.publish_routes();
            } else {
                api.unpublish_routes();
            }
        }
        application.routes_are_published = newState;
        return application;
    },

    notifyResourceChanged:function (app_id, resource) {
        var api = this.getApi(app_id);
        if (api !== null) {
            api.notifyResourceChanged(resource);
        }
    },

    notifyResourceCreated:function (app_id, resource) {
        var api = this.getApi(app_id);
        if (api !== null) {
            api.notifyResourceCreated(resource);
        }
    },

    notifyResourceDeleted:function (app_id, resource) {
        var api = this.getApi(app_id);
        if (api !== null) {
            api.notifyResourceDeleted(resource);
        }
    }
};