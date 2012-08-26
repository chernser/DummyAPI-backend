/**
 *  app_storage.js
 *
 *  Hold routines to manage application structure:
 *  1. create/remove application
 *  2. add/remove testsuites to application
 *  3. bootstrap resources
 *
 */


/**
 * [getAppNextId description]
 * @param  {[type]}   db       [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
function getAppNextId(db, callback) {
    var collection = db.collection('sequences');

    collection.findAndModify({name:"appSeqNumber"}, {}, {$inc:{ value:1}},
        function (err, result) {
            if (err !== null) {
                throw err;
            }

            callback(result.value);
        });
}

/**
 * [generateMongoUrl creates a mongoDb-formatted url]
 * @param  {[type]} dbConfig [description]
 * @return {[type]}          [description]
 */
var generateMongoUrl = function (dbConfig) {
    dbConfig.hostname = (dbConfig.hostname || 'localhost');
    dbConfig.port = (dbConfig.port || 27017);
    dbConfig.db = (dbConfig.db || 'test');

    if (dbConfig.username && dbConfig.password) {
        return "mongodb://" + dbConfig.username +
            ":" + dbConfig.password + "@" + dbConfig.hostname + ":" +
            dbConfig.port + "/" + dbConfig.db;
    } else {
        return "mongodb://" + dbConfig.hostname + ":" + dbConfig.port +
            "/" + dbConfig.db;
    }
};

/**
 * [getNextAppResId description]
 * @param  {[type]}   db       [description]
 * @param  {[type]}   appId    [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
function getNextAppResId(db, appId, callback) {
    var collection = db.collection('applications');

    collection.findAndModify({id:appId}, {}, {$inc:{ appResLastId:1}},
        function (err, result) {
            if (err !== null) {
                throw err;
            }

            callback(result.appResLastId);
        });
}

/**
 * [AppStorage description]
 * @param {Function} callback [description]
 */
function AppStorage(callback) {

    // Imports
    var mongo_db = require("mongodb");
    var config = require('./config');
    var crypto = require("crypto");

    this.ObjectID = mongo_db.ObjectID;
    this.crypto = crypto;

    // use config.js to load the mongoDb info
    this.db = new mongo_db.Db(config.mongo.db,
        new mongo_db.Server(config.mongo.server,
            config.mongo.port,
            {auto_reconnect:config.mongo.reconnect, poolSize:config.mongo.poolSize}),
        {native_parser:config.mongo.useNative}
    );

    var ownCallback = function () {
        if (typeof callback == 'function') {
            callback();
        }
    };

    //TODO: fix the 'ensureIndex()'' duplication below. Horrible hack,
    // but I'm tired :)

    // Preparing db connection
    var that = this;
    this.db.open(function (err, db) {
        // authenticate if config.js has a username & password defined.
        // TODO: add logic to validate against 'undefined' and so-on.
        if (config.mongo.username !== '' && config.mongo.password !== '') {
            that.db.authenticate(config.mongo.username, config.mongo.password, function () {

                if (err !== null) {
                    console.log("Db Error: ", err);
                    return null;
                }

                that.db.ensureIndex('applications', {id:1}, {unique:true});
                that.db.ensureIndex('sequences', {name:1}, {unique:true});
                that.db.collection('sequences', function (err, collection) {
                    collection.insert({name:'appSeqNumber', value:1});
                });

                ownCallback();
            });
        } else {
            if (err !== null) {
                console.log("Db Error: ", err);
                return null;
            }

            that.db.ensureIndex('applications', {id:1}, {unique:true});
            that.db.ensureIndex('sequences', {name:1}, {unique:true});
            that.db.collection('sequences', function (err, collection) {
                collection.insert({name:'appSeqNumber', value:1});
            });

            ownCallback();
        }
    });

    return this;
}

/**
 * [getValue description]
 * @param  {[type]} field        [description]
 * @param  {[type]} defaultValue [description]
 * @return {[type]}              [description]
 */
function getValue(field, defaultValue) {
    if (typeof field == 'undefined') {
        return defaultValue;
    }

    return field;
}

/**
 * [fixApplicationFields description]
 * @param  {[type]} application [description]
 * @return {[type]}             [description]
 */
function fixApplicationFields(application) {
    if (typeof application == 'undefined') {
        return;
    }

    application.objtypes = getValue(application.objtypes, []);

    delete application._id;
    delete application.appResLastId;

    return application;
}

/**
 * [prototype description]
 * @type {Object}
 */
AppStorage.prototype = {

    /**
     * [getStateDiff description]
     * @param  {[type]} oldState [description]
     * @param  {[type]} newState [description]
     * @return {[type]}          [description]
     */
    getStateDiff:function (oldState, newState) {

        var diff = {};

        // Copy not matching fields
        for (var field in oldState) {
            if (typeof newState[field] != 'undefined') {
                if (newState[field] != oldState[field]) {
                    diff[field] = {
                        oldS:oldState[field],
                        newS:newState[field]
                    };
                }
            }
        }

        // Copy all new fields
        for (var field in newState) {
            if (typeof oldState[field] == 'undefined') {
                diff[field] = { newS:newState[field] };
            }
        }

        return diff;
    },

    /**
     * [getApplicationList description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    getApplicationList:function (callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.db.collection('applications');

        var cursor = collection.find({});

        cursor.toArray(function (err, items) {
            if (err !== null) {
                throw err;
            }

            if (typeof callback == 'function') {
                var fixedItems = [];
                for (var i in items) {
                    fixedItems.push(fixApplicationFields(items[i]));
                }
                callback(fixedItems);
            }
        });
    },

    /**
     * [addApplication description]
     * @param {[type]}   application [description]
     * @param {Function} callback    [description]
     */
    addApplication:function (application, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        if ((typeof application.name == 'undefined') ||
            (application.name === '') || application.name === null) {
            throw 'application.name is null';
        }

        application.appResLastId = 0;

        var collection = this.db.collection('applications');
        getAppNextId(this.db, function (appId) {
            application.id = appId;
            collection.save(application);
            if (typeof callback == 'function') {
                callback(fixApplicationFields(application));
            }
        });
    },

    renewAccessToken:function (applicationId, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var storage = this;
        storage.getApplication(applicationId, function (application) {
            var new_token = storage.crypto.randomBytes(24).toString('hex');
            application.access_token = new_token;

            storage.saveApplication(application, function () {
                if (typeof callback == 'function') {
                    callback(null, new_token);
                }
            });
        });
    },

    /**
     * [saveApplication description]
     * @param  {[type]}   application [description]
     * @param  {Function} callback    [description]
     * @return {[type]}               [description]
     */
    saveApplication:function (application, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        delete application.appResLastId;

        application.id = new Number(application.id).valueOf();
        this.db.collection('applications', function (err, collection) {
            if (err !== null) {
                throw err;
            }

            var selector = {id:application.id};
            collection.update(selector, application, {safe:true}, function (err, saved) {
                if (err !== null) {
                    throw err;
                }

                collection.find(selector, function (err, cursor) {
                    if (err !== null) {
                        throw err;
                    }

                    if (typeof callback == 'function') {
                        cursor.toArray(function (err, items) {
                            callback(fixApplicationFields(items[0]));
                        });
                    }
                });
            });
        });
    },

    /**
     * [getApplication description]
     * @param  {[type]}   applicationId [description]
     * @param  {Function} callback      [description]
     * @return {[type]}                 [description]
     */
    getApplication:function (applicationId, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.db.collection('applications');
        applicationId = new Number(applicationId).valueOf();

        collection.find({id:applicationId},
            function (err, cursor) {
                cursor.toArray(function (err, items) {
                    callback(fixApplicationFields(items[0]));
                });
            });
    },

    /**
     * [deleteApplication description]
     * @param  {[type]}   applicationId [description]
     * @param  {Function} callback      [description]
     * @return {[type]}                 [description]
     */
    deleteApplication:function (applicationId, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        applicationId = new Number(applicationId).valueOf();
        this.db.collection('applications', function (err, collection) {
            collection.remove({id:applicationId});

            if (typeof callback == 'function') {
                callback();
            }
        });
    },

    /**
     * [addObjectType description]
     * @param {[type]}   appId      [description]
     * @param {[type]}   objectType [description]
     * @param {Function} callback   [description]
     */
    addObjectType:function (appId, objectType, callback) {
        if (typeof objectType.name == 'undefined' || objectType.name === '') {
            throw new Error("Empty object type name");
        }


        if (typeof objectType.route_pattern != 'string') {
            objectType.route_pattern = '/' + objectType.name + '/{id}/';
        }

        var storage = this;
        storage.getApplication(appId, function (application) {

            for (var index in application.objtypes) {
                if (application.objtypes[index].name == objectType.name) {
                    if (typeof callback == 'function') {
                        callback('already_exists', application.objtypes[index]);
                    }
                    return;
                }
            }

            application.objtypes.push(objectType);

            storage.saveApplication(application, function () {
                if (typeof callback == 'function') {
                    callback(null, objectType);
                }
            });
        });
    },

    /**
     * [getObjectType description]
     * @param  {[type]}   appId          [description]
     * @param  {[type]}   objectTypeName [description]
     * @param  {Function} callback       [description]
     * @return {[type]}                  [description]
     */
    getObjectType:function (appId, objectTypeName, callback) {
        var storage = this;
        storage.getApplication(appId, function (application) {
            if (typeof application == 'undefined') {
                callback('not_found', null);
                return;
            }

            for (var index in application.objtypes) {
                if (application.objtypes[index].name == objectTypeName) {
                    if (typeof callback == 'function') {
                        callback(null, application.objtypes[index]);
                    }
                    return;
                }
            }
            callback('not_found', null);
        });
    },

    /**
     * [getObjectTypeByRoute description]
     * @param  {[type]}   appId        [description]
     * @param  {[type]}   routePattern [description]
     * @param  {Function} callback     [description]
     * @return {[type]}                [description]
     */
    getObjectTypeByRoute:function (appId, routePattern, callback) {
        var storage = this;
        storage.getApplication(appId, function (application) {
            if (typeof application == 'undefined') {
                callback('not_found', null);
                return;
            }

            console.log(application);
            for (var index in application.objtypes) {
                if (application.objtypes[index].route_pattern == routePattern) {
                    if (typeof callback == 'function') {
                        callback(null, application.objtypes[index]);
                    }
                    return;
                }
            }

            callback('not_found', null);
        });
    },

    /**
     * [saveObjectType description]
     * @param  {[type]}   appId      [description]
     * @param  {[type]}   objectType [description]
     * @param  {Function} callback   [description]
     * @return {[type]}              [description]
     */
    saveObjectType:function (appId, objectType, callback) {
        var storage = this;
        storage.getApplication(appId, function (application) {

            var doUpdate = false;
            for (var index in application.objtypes) {
                if (application.objtypes[index].name == objectType.name) {
                    application.objtypes[index] = objectType;
                    doUpdate = true;
                    break;
                }
            }

            if (doUpdate) {
                storage.saveApplication(application, function () {
                    if (typeof callback == 'function') {
                        callback(null, objectType);
                    }
                });
            } else {
                if (typeof callback == 'function') {
                    callback('not_found', null);
                }
            }
        });
    },

    /**
     * [deleteObjectType description]
     * @param  {[type]}   appId          [description]
     * @param  {[type]}   objectTypeName [description]
     * @param  {Function} callback       [description]
     * @return {[type]}                  [description]
     */
    deleteObjectType:function (appId, objectTypeName, callback) {
        var storage = this;
        storage.getApplication(appId, function (application) {
            var doUpdate = false;
            var newObjectTypesList = [];
            // TODO: rework
            for (var index in application.objtypes) {
                if (application.objtypes[index].name == objectTypeName) {
                    doUpdate = true;
                    continue;
                }
                newObjectTypesList.push(application.objtypes[index]);
            }

            console.log("Deleting object type: ", objectTypeName, application);
            if (doUpdate) {
                application.objtypes = newObjectTypesList;
                storage.saveApplication(application, function () {
                    var resource_collection = storage.getResourceCollection(appId);
                    resource_collection.remove({__objectType:objectTypeName});
                    if (typeof callback == 'function') {
                        callback(null, true);
                    }
                });
            } else {
                if (typeof callback == 'function') {
                    callback('not_found', null);
                }
            }
        });
    },

    /**
     * [getResourceCollection description]
     * @param  {[type]} appId [description]
     * @return {[type]}       [description]
     */
    getResourceCollection:function (appId) {
        return this.db.collection('app_resources_' + appId);
    },

    /**
     * [addObjectInstace description]
     * @param {[type]}   appId          [description]
     * @param {[type]}   objectTypeName [description]
     * @param {[type]}   instance       [description]
     * @param {Function} callback       [description]
     */
    addObjectInstace:function (appId, objectTypeName, instance, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.getResourceCollection(appId);
        instance.__objectType = objectTypeName;
        collection.insert(instance, function (err, object) {
            if (err !== null) {
                throw err;
            }

            if (typeof callback == 'function') {
                callback(object[0]);
            }
        });
    },

    /**
     * [createIdObject description]
     * @param  {[type]} id [description]
     * @return {[type]}    [description]
     */
    createIdObject:function (id) {
        try {
            return this.ObjectID.createFromHexString(id);
        } catch (e) {
            console.log(e);
            return null;
        }
    },

    /**
     * [createInstanceQuery description]
     * @param  {[type]} instanceId     [description]
     * @param  {[type]} objectTypeName [description]
     * @return {[type]}                [description]
     */
    createInstanceQuery:function (instanceId, objectTypeName) {
        var query = { __objectType:objectTypeName};

        if (typeof instanceId != 'undefined' && instanceId !== null) {
            var id = instanceId;
            var id_field = "_id";
            if (typeof instanceId.id_field != 'undefined') {
                id_field = instanceId.id_field;
                id = instanceId.id;
            }

            if (id_field == "_id") {
                query[id_field] = this.createIdObject(id);
            } else {
                // Handle converting integer values
                var tmpId = parseInt(id);
                if (tmpId === NaN) {
                    query[id_field] = id;
                } else {
                    query[id_field] = tmpId;
                }
            }
        }

        return query;
    },

    /**
     * [saveObjectInstance description]
     * @param  {[type]}   appId          [description]
     * @param  {[type]}   objectTypeName [description]
     * @param  {[type]}   instanceId     [description]
     * @param  {[type]}   instance       [description]
     * @param  {Function} callback       [description]
     * @return {[type]}                  [description]
     */
    saveObjectInstance:function (appId, objectTypeName, instanceId, instance, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.getResourceCollection(appId);
        var query = this.createInstanceQuery(instanceId, objectTypeName);
        if (query === null) {
            if (typeof callback == 'function')
                callback(null);
            return;
        }


        delete instance['_id'];
        instance.__objectType = objectTypeName;

        collection.findAndModify(query, {}, instance, {safe:true, 'new':true}, function (err, saved) {
            if (err !== null) {
                throw err;
            }

            console.log("saved: ", saved);
            if (typeof callback == 'function') {
                callback(saved);
            }
        });
    },

    /**
     * [getObjectInstances description]
     * @param  {[type]}   appId          [description]
     * @param  {[type]}   objectTypeName [description]
     * @param  {[type]}   instanceId     [description]
     * @param  {Function} callback       [description]
     * @return {[type]}                  [description]
     */
    getObjectInstances:function (appId, objectTypeName, instanceId, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.getResourceCollection(appId);
        var query = this.createInstanceQuery(instanceId, objectTypeName);
        if (query === null) {
            if (typeof callback == 'function') {
                callback(null);
            }
            return;
        }

        console.log('query: ', query);
        collection.find(query, function (err, cursor) {
            if (err !== null) {
                throw err;
            }

            if (typeof callback == 'function') {
                cursor.toArray(function (err, items) {
                    var cleaned_items = [];

                    for (var index in items) {
                        delete items[index]['__objectType'];
                        cleaned_items.push(items[index]);
                    }
                    callback(cleaned_items);
                });
            }
        });
    },

    /**
     * [deleteObjectInstance description]
     * @param  {[type]}   appId          [description]
     * @param  {[type]}   objectTypeName [description]
     * @param  {[type]}   instanceId     [description]
     * @param  {Function} callback       [description]
     * @return {[type]}                  [description]
     */
    deleteObjectInstance:function (appId, objectTypeName, instanceId, callback) {
        if (this.db.state != 'connected') throw 'db not connected';

        var collection = this.getResourceCollection(appId);
        var query = this.createInstanceQuery(instanceId, objectTypeName);
        if (query === null) {
            if (typeof callback == 'function')
                callback(null);
            return;
        }

        collection.remove(query, function (err, cursor) {
            if (err !== null) {
                throw err;
            }

            if (typeof callback == 'function') {
                callback();
            }
        });
    },

    /**
     * [addTestsuite description]
     * @param {[type]}   applicationId [description]
     * @param {Function} callback      [description]
     */
    addTestsuite:function (applicationId, callback) {

    },

    /**
     * [removeTestsuite description]
     * @param  {[type]}   applicationId [description]
     * @param  {Function} callback      [description]
     * @return {[type]}                 [description]
     */
    removeTestsuite:function (applicationId, callback) {

    },

    /**
     * [migrate Db Migration updates]
     * @param  {[type]} appId [description]
     * @return {[type]}       [description]
     */
    // Db Migration updates
    migrate:function (appId) {
        var storage = this;

        storage.getApplication(appId, function (application) {
            if (application == null) {
                console.log("Failed to migrate db for application: ", appId);
                return;
            }


            storage.setDefaultRoutePatternForObjectTypes(application, storage);
            storage.setAccessToken(application, storage);

            storage.saveApplication(application);
        });

    },

    setDefaultRoutePatternForObjectTypes:function (application, storage) {
        for (var index in application.objtypes) {
            if (typeof application.objtypes[index].route_pattern == 'undefined') {
                application.objtypes[index].route_pattern = '/' + application.objtypes[index].name + '/{id}/';
            }
        }
    },


    setAccessToken:function (application, storage) {
        if (typeof application.access_token == 'undefined') {
            application.access_token = storage.crypto.randomBytes(24).toString("hex");
            console.log("application:access_token set: ", application.access_token);
        }
    }
};


/**
 * [exports description]
 * @param  {[type]}   config   [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
module.exports = function (callback) {
    return new AppStorage(callback);
};
