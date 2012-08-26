/**
 *  app_storage.js - implement interactions with db objects
 *
 *  Author: Sergey Chernov (chernser@outlook.com)
 */

function getValue(field, defaultValue) {
    if (typeof field == 'undefined') {
        return defaultValue;
    }

    return field;
}

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
 * AppStorage is DAO class to manipulate everything, that stored in db
 * This class is implemented to 'talk' to mongodb only
 *
 * @class AppStorage
 */
var AppStorage = function (config, db, callback) {

    // Imports
    this.mongo_db = require('mongodb');
    this.ObjectID = this.mongo_db.ObjectID;
    this.crypto = require("crypto");

    // external
    this.db = db;

    var ownCallback = function () {
        if (typeof callback == 'function') {
            callback();
        }
    };

    this.db.ensureIndex('applications', {id:1}, {unique:true});
    this.db.ensureIndex('sequences', {name:1}, {unique:true});
    this.db.collection('sequences', function (err, collection) {
        collection.insert({name:'appSeqNumber', value:1});


    });

    ownCallback();

    return this;
};

module.exports.AppStorage = AppStorage;


AppStorage.prototype = {

    create: function(collection_name, object, callback) {

        var storage = this;
        storage.db.collection(collection_name, function(err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.insert(object, function(err, docs ) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                callback(null, docs);
            });
        });

    },

    get: function(collection_name, query_obj, callback) {

        var storage = this;
        storage.db.collection(collection_name, function(err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.find(query_obj, function(err, cursor) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                cursor.toArray(function(err, items) {
                    callback(err, items);
                });
            })
        });
    },

    put: function(collection_name, query_obj, object, callback) {
        var storage = this;
        storage.db.collection(collection_name, function(err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.update(query_obj, object, {safe: true}, function(err, result) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                collection.find(query_obj, function (err, cursor) {
                    if (err !== null) {
                        callback(err, null);
                        return;
                    }

                    if (typeof callback == 'function') {
                        cursor.toArray(function (err, items) {
                            callback(items[0]);
                        });
                    }
                });
            });
        });

    },

    remove: function(collection_name, query_obj, callback) {
        var storage = this;
        storage.db.collection(collection_name, function(err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.remove(query_obj, function(err, result) {
                callback(err, result);
            });
        });
    },


    getNextId: function(sequenceName, callback) {
        this.db.collection('sequences', function(err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }
            collection.findAndModify({name: sequenceName}, {}, {$inc:{ value:1}},
                function (err, result) {
                    if (err !== null) {
                        callback(err, null);
                        return;
                    }

                    callback(null, result.value);
                });

        });
    },



    // Constatns
    APPLICATIONS_COL: 'applications',
    APPLICATION_SEQ_NAME: 'appSeqNumber',

    addApplication:function (application, callback) {

        var storage = this;

        storage.getNextId(storage.APPLICATION_SEQ_NAME, function(err, app_id) {
            if (err != null) {
                callback(err, null);
                return;
            }

            application.id = app_id;
            application.object_types = [];
            application.access_token = storage.generateAccessToken();
            console.log("application: ", application);
            storage.create(storage.APPLICATIONS_COL, application, callback);
        });
    },

    saveApplication:function (application, callback) {
        var storage = this;

        application.id = new Number(application.id).valueOf();

        storage.put(storage.APPLICATIONS_COL, {id:application.id}, application, function(err, saved) {
            callback(err, saved);
        });
    },


    getApplication:function (app_id, callback) {
        app_id = new Number(app_id).valueOf();

        var storage = this;
        storage.get(storage.APPLICATIONS_COL, {id:app_id}, callback);
    },


    deleteApplication:function (app_id, callback) {
        app_id = new Number(app_id).valueOf();

        var storage = this;
        storage.remove(storage.APPLICATIONS_COL, {id: app_id}, callback);
    },

    generateAccessToken: function() {
        return this.crypto.randomBytes(24).toString('hex');
    },

    renewAccessToken:function (app_id, callback) {

        var storage = this;
        storage.getApplication(app_id, function (err, application) {

            application.access_token = storage.generateAccessToken();

            storage.saveApplication(application, function () {
                if (typeof callback == 'function') {
                    callback(null, new_token);
                }
            });
        });
    },

    addObjectType:function (app_id, objectType, callback) {
        if (typeof objectType.name == 'undefined' || objectType.name === '') {
            throw new Error("Empty object type name");
        }


        if (typeof objectType.route_pattern != 'string') {
            objectType.route_pattern = '/' + objectType.name + '/{id}/';
        }

        var storage = this;
        storage.getApplication(app_id, function (err, application) {

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


    getObjectType:function (app_id, objectTypeName, callback) {
        var storage = this;
        storage.getApplication(app_id, function (err, application) {
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


    getObjectTypeByRoute:function (app_id, routePattern, callback) {
        var storage = this;
        storage.getApplication(app_id, function (application) {
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


    saveObjectType:function (app_id, objectType, callback) {
        var storage = this;
        storage.getApplication(app_id, function (application) {

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


    deleteObjectType:function (app_id, object_type_name, callback) {
        var storage = this;
        storage.getApplication(app_id, function (application) {
            var doUpdate = false;
            var newObjectTypesList = [];
            // TODO: rework
            for (var index in application.objtypes) {
                if (application.objtypes[index].name == object_type_name) {
                    doUpdate = true;
                    continue;
                }
                newObjectTypesList.push(application.objtypes[index]);
            }

            console.log("Deleting object type: ", object_type_name, application);
            if (doUpdate) {
                application.objtypes = newObjectTypesList;
                storage.saveApplication(application, function () {
                    var resource_collection = storage.getResourceCollection(appId);
                    resource_collection.remove({__objectType:object_type_name});
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

    getResourceCollectionName:function (app_id) {
        return 'app_resources_' + app_id;
    },

    addObjectInstace:function (app_id, object_type_name, instance, callback) {
        instance.__objectType = object_type_name;

        var storage = this;
        var collectionName = this.getResourceCollectionName(app_id);
        storage.create(collectionName, instance, callback);
    },

    createIdObject:function (id) {
        try {
            return this.ObjectID.createFromHexString(id);
        } catch (e) {
            console.log(e);
            return null;
        }
    },

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


    saveObjectInstance:function (app_id, object_type_name, instance_id, instance, callback) {
        var collection_name = this.getResourceCollectionName(app_id);
        var query = this.createInstanceQuery(instance_id, object_type_name);

        delete instance['_id'];
        instance.__objectType = object_type_name;

        var storage = this;
        storage.put(collection_name, query, instance, callback);
    },

    getObjectInstances:function (app_id, object_type_name, instance_id, callback) {
        var collection_name = this.getResourceCollectionName(app_id);
        var query = this.createInstanceQuery(instance_id, object_type_name);

        var storage = this;
        storage.get(collection_name, query, function(err, items) {
            if (err != null) {
                callback(err, null);
                return;
            }
            var cleaned_items = [];

            for (var index in items) {
                delete items[index]['__objectType'];
                cleaned_items.push(items[index]);
            }
            callback(cleaned_items);
        });
    },

    deleteObjectInstance:function (appId, objectTypeName, instanceId, callback) {
        var collection_name = this.getResourceCollectionName(app_id);
        var query = this.createInstanceQuery(instance_id, object_type_name);

        var storage = this;
        storage.remove(query, callback);
    },


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
