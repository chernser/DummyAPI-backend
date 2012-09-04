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

function first(items) {
    return items != null && items.length > 0 ? items[0] : null;
}


/**
 * AppStorage is DAO class to manipulate everything, that stored in db
 * This class is implemented to 'talk' to mongodb only
 *
 * @class AppStorage
 */
var AppStorage = function (config, db) {

    // Imports
    this.mongo_db = require('mongodb');
    this.ObjectID = this.mongo_db.ObjectID;
    this.crypto = require("crypto");

    // external
    this.db = db;

    this.db.ensureIndex('applications', {id:1}, {unique:true});
    this.db.ensureIndex('sequences', {name:1}, {unique:true});
    this.db.collection('sequences', function (err, collection) {
        collection.insert({name:AppStorage.prototype.APPLICATION_SEQ_NAME, value:1});
        collection.insert({name:AppStorage.prototype.USER_SEQ_NAME, value:1});
        collection.insert({name:AppStorage.prototype.USER_GROUP_SEQ_NAME, value:1});
    });

    return this;
};

module.exports.AppStorage = AppStorage;


AppStorage.prototype = {

    dummyCallback: function() {},

    create:function (collection_name, object, callback) {
        if (typeof callback != 'function') {
            callback = this.dummyCallback;
        }

        var storage = this;
        storage.db.collection(collection_name, function (err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.insert(object, {safe: true}, function (err, docs) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                callback(null, docs[0]);
            });
        });

    },

    get:function (collection_name, query_obj, callback) {
        if (typeof callback != 'function') {
            callback = this.dummyCallback;
        }


        var storage = this;
        storage.db.collection(collection_name, function (err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.find(query_obj, function (err, cursor) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                cursor.toArray(function (err, items) {
                    callback(err, items);
                });
            })
        });
    },

    put:function (collection_name, query_obj, object, callback) {
        if (typeof callback != 'function') {
            callback = this.dummyCallback;
        }

        var storage = this;
        storage.db.collection(collection_name, function (err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }

            collection.update(query_obj, object, {safe:true}, function (err, result) {
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
                            callback(null, items[0]);
                        });
                    }
                });
            });
        });

    },

    remove:function (collection_name, query_obj, callback) {
        if (typeof callback != 'function') {
            callback = this.dummyCallback;
        }

        var storage = this;
        storage.db.collection(collection_name, function (err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }


            collection.remove(query_obj, function (err, result) {
                callback(err, {removed:true});
            });
        });
    },


    getNextId:function (sequenceName, callback) {
        this.db.collection('sequences', function (err, collection) {
            if (err != null) {
                callback(err, null);
                return;
            }
            collection.findAndModify({name:sequenceName}, {}, {$inc:{ value:1}},
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
    GET_ALL_QUERY: {},
    APPLICATIONS_COL:'applications',
    APPLICATION_SEQ_NAME:'appSeqNumber',
    USER_COL:'application_users',
    USER_GROUP_COL:'application_user_groups',
    USER_SEQ_NAME:'userSeqNumber',
    USER_GROUP_SEQ_NAME:'userGroupSeqNumber',

    addApplication:function (application, callback) {

        if (typeof application.name == 'undefined' || application.name == '') {
            callback('invalid', null);
            return;
        }

        var storage = this;
        storage.getNextId(storage.APPLICATION_SEQ_NAME, function (err, app_id) {
            if (err != null) {
                callback(err, null);
                return;
            }

            application.id = app_id;
            application.object_types = [];
            application.access_token = storage.generateAccessToken();
            storage.create(storage.APPLICATIONS_COL, application, callback);
        });
    },

    saveApplication:function (application, callback) {
        var storage = this;

        var app_id = parseInt(application.id);

        var object = { $set: {}};
        if (typeof application.notify_proxy_fun == 'string') {
            object.$set.notify_proxy_fun = application.notify_proxy_fun;
        }


        if (Array.isArray(application.object_types)) {
            object.$set.object_types = application.object_types;
        }

        storage.put(storage.APPLICATIONS_COL, {id: app_id}, object, function (err, saved) {
            if (saved == null) {
                callback('not_found');
                return;
            }
            callback(err, saved);
        });
    },


    getApplication:function (app_id, callback) {
        var storage = this;
        var query = typeof app_id != 'undefined' ? {id: parseInt(app_id)} : storage.GET_ALL_QUERY;
        storage.get(storage.APPLICATIONS_COL, query, callback);
    },


    deleteApplication:function (app_id, callback) {
        app_id = parseInt(app_id);

        var storage = this;
        storage.remove(storage.APPLICATIONS_COL, {id:app_id}, function() {
            storage.remove(storage.USER_COL, {app_id: app_id});
            storage.remove(storage.USER_GROUP_COL, {app_id: app_id});
            storage.db.collection(storage.getResourceCollectionName(app_id), function(err, collection) {
                collection.drop();
            });
            callback(null, {removed: true});
        });

    },

    generateAccessToken:function () {
        return this.crypto.randomBytes(24).toString('hex');
    },

    renewAccessToken:function (app_id, callback) {

        var storage = this;
        storage.getApplication(app_id, function (err, application) {
            if (err != null) {
                callback(err, null);
                return;
            } else if (application == null) {
                callback('not_found', null);
                return;
            }

            application = application[0];

            var old_access_token = application.access_token;
            var new_access_token = storage.generateAccessToken();
            application.access_token = new_access_token;

            storage.saveApplication(application, function (err, saved) {
                if (err == null) {
                    storage.updateAppAccessTokens(app_id, old_access_token, new_access_token);
                }
                if (typeof callback == 'function') {
                    callback(err, {access_token:application.access_token});
                }
            });
        });
    },

    application_access_tokens: {},

    updateAppAccessTokens: function(app_id, old_access_token, access_token) {
        try {
            delete this.application_access_tokens[old_access_token];
        } catch (e) {
        }

        this.application_access_tokens[access_token] = app_id;
    },

    getAppIdByAccessToken: function(access_token, callback)  {
        var app_id = this.application_access_tokens[access_token];
        if (typeof  app_id == 'number' ) {
            callback(null, app_id);
        } else {
            var storage = this;
            storage.get(storage.APPLICATIONS_COL, {access_token: access_token}, function(err, items) {
                if (err != null) {
                    callback(err, null);
                    return;
                }

                var app_id = items != null && items.length > 0 ? items[0].id : null;
                for (var index in storage.application_access_tokens) {
                    if (storage.application_access_tokens[index] == app_id) {
                        storage.application_access_tokens[index] = null;
                    }
                }

                storage.application_access_tokens[access_token] == app_id;
                callback(null, app_id);
            });
        }

    },

    createUserOrGroupQuery:function (app_id, user_or_group_id) {
        var query = { };


        var tmp_app_id = parseInt(app_id);
        if (!isNaN(tmp_app_id)) {
            query.app_id = tmp_app_id;
        }

        var tmp_user_or_group_id = parseInt(user_or_group_id);
        if (!isNaN(tmp_user_or_group_id)) {
            query.id = tmp_user_or_group_id;
        }

        return query;
    },

    addUser:function (app_id, user, callback) {
        if (typeof user.user_name != 'string') {
            callback('invalid', null);
            return;
        }

        var storage = this;
        storage.getNextId(storage.USER_SEQ_NAME, function(err, id) {
            user.id = id;
            user.app_id = parseInt(app_id);
            user.access_token = storage.generateAccessToken();
            storage.create(storage.USER_COL, user, callback);
        });

    },

    renewUserAccessToken:function(app_id, user_id, callback) {
        var storage = this;
        var new_access_token = storage.generateAccessToken();
        storage.put(storage.USER_COL, {id: user_id}, {$set: {access_token: new_access_token}}, function(err, saved) {
            if (err != null) {
                callback(err, null);
                return;
            }

            callback(null, {access_token: new_access_token});
        });
    },

    getUser:function (app_id, user_id, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user_id);
        storage.get(storage.USER_COL, query, callback);
    },

    getUserByName: function(app_id, user_name, callback) {
        var storage = this;
        var query = { app_id: parseInt(app_id), user_name: user_name};

        storage.get(storage.USER_COL, query, function(err, items) {
            if (err != null) {
                callback(err, null);
                return;
            }

            callback(null, first(items));
        });
    },

    getUserByAccessToken: function(access_token, callback) {
        var storage = this;
        var query = {access_token: access_token};
        storage.get(this.USER_COL, query, function(err, items) {
            if (err != null) {
                callback(err, null);
                return;
            }

            callback(null, first(items));
        });
    },

    saveUser:function (app_id, user, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user.id);

        var user_object = { $set: {}};

        if (typeof user.password == 'string') {
            user_object.$set.password = user.password;
        }

        if (typeof user.user_name == 'string') {
            user_object.$set.user_name = user.user_name;
        }

        if (typeof user.groups != 'undefined') {
            user_object.$set.groups = user.groups;
        }

        storage.put(this.USER_COL, query, user_object, callback);
    },

    deleteUser:function (app_id, user_id, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user_id);
        storage.remove(storage.USER_COL, query, callback);
    },

    addUserGroup:function (app_id, user_group, callback) {
        var storage = this;
        if (typeof user_group.name != 'string') {
            callback('invalid', null);
            return;
        }

        storage.getNextId(storage.USER_GROUP_SEQ_NAME, function(err, id) {
            user_group.id = id;
            user_group.app_id = parseInt(app_id);
            storage.create(storage.USER_GROUP_COL, user_group, callback);
        })

    },

    getUserGroup:function (app_id, user_group_id, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user_group_id);
        storage.get(storage.USER_GROUP_COL, query, callback);
    },

    saveUserGroup: function(app_id, user_group, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user_group.id);

        var user_group_object = { $set: {}};

        if (typeof user_group.name == 'string') {
            user_group_object.$set.name = user_group.name;
        }

        storage.put(storage.USER_GROUP_COL, query, user_group_object, callback);
    },

    deleteUserGroup:function (app_id, user_group_id, callback) {
        var storage = this;
        var query = storage.createUserOrGroupQuery(app_id, user_group_id);
        storage.remove(storage.USER_GROUP_COL, query, callback);
    },

    addObjectType:function (app_id, objectType, callback) {
        if (typeof objectType.name == 'undefined' || objectType.name === '') {
            throw new Error("Empty object type name");
        }


        if (typeof objectType.route_pattern != 'string') {
            objectType.route_pattern = '/' + objectType.name + '/{id}/';
        }

        if (typeof objectType.id_field == 'undefined') {
            objectType.id_field = '_id';
        }

        var storage = this;
        storage.getApplication(app_id, function (err, applications) {
            if (applications === null) {
                callback('not_found', null);
                return;
            }

            var application = applications[0];
            for (var index in application.object_types) {
                if (application.object_types[index].name == objectType.name) {
                    if (typeof callback == 'function') {
                        callback('already_exists', application.objtypes[index]);
                    }
                    return;
                }
            }

            if (typeof application.object_types == 'undefined' ) {
                application.object_types = [];
            }
            application.object_types.push(objectType);
            storage.saveApplication(application, function () {
                if (typeof callback == 'function') {
                    callback(null, objectType);
                }
            });
        });
    },


    getObjectType:function (app_id, objectTypeName, callback) {
        var storage = this;
        storage.getApplication(app_id, function (err, applications) {
            if (applications === null) {
                callback('not_found', null);
                return;
            }

            var application = applications[0];

            if (objectTypeName != '*') {

                for (var index in application.object_types) {
                    if (application.object_types[index].name == objectTypeName) {
                        if (typeof callback == 'function') {
                            var object_type = application.object_types[index];
                            object_type.app_id = app_id;

                            callback(null, object_type);
                        }
                        return;
                    }
                }
                callback('not_found', null);
            } else {
                for (var index in application.object_types) {
                    application.object_types[index].app_id = app_id;
                }
                callback(null, application.object_types);
            }

        });
    },


    getObjectTypeByRoute:function (app_id, routePattern, callback) {
        var storage = this;
        storage.getApplication(app_id, function (err, applications) {
            if (applications === null) {
                callback('not_found', null);
                return;
            }

            var application = applications[0];
            for (var index in application.object_types) {
                if (application.object_types[index].route_pattern == routePattern) {
                    if (typeof callback == 'function') {
                        callback(null, application.object_types[index]);
                    }
                    return;
                }
            }

            callback('not_found', null);
        });
    },


    saveObjectType:function (app_id, objectType, callback) {
        var storage = this;
        storage.getApplication(app_id, function (err, applications) {
            if (applications === null ) {
                callback('not_found', null);
                return;
            }

            var application = applications[0];
            var doUpdate = false;
            for (var index in application.object_types) {

                if (application.object_types[index].name == objectType.name) {
                    var existing = application.object_types[index];

                    // Copy allowed to change fields
                    existing.route_pattern = objectType.route_pattern;
                    existing.proxy_fun_code = objectType.proxy_fun_code;
                    existing.id_field = objectType.id_field;

                    // finally copy existing to response object
                    objectType = existing;
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
        storage.getApplication(app_id, function (err, applications) {
            if (applications === null) {
                callback('not_found', null);
                return;
            }

            var application = applications[0];
            var doUpdate = false;
            var newObjectTypesList = [];
            // TODO: rework
            for (var index in application.object_types) {
                if (application.object_types[index].name == object_type_name) {
                    doUpdate = true;
                    continue;
                }
                newObjectTypesList.push(application.object_types[index]);
            }

            if (doUpdate) {
                application.object_types = newObjectTypesList;
                storage.saveApplication(application, function () {
                    var resource_collection_name = storage.getResourceCollectionName(app_id);
                    storage.remove(resource_collection_name, {__objectType:object_type_name});
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
        storage.get(collection_name, query, function (err, items) {
            if (err != null) {
                callback(err, null);
                return;
            }

            callback(null, items);
        });
    },

    deleteObjectInstance:function (app_id, object_type_name, instance_id, callback) {
        var collection_name = this.getResourceCollectionName(app_id);
        var query = this.createInstanceQuery(instance_id, object_type_name);

        var storage = this;
        storage.remove(collection_name, query, callback);
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
