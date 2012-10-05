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


var util = require("util"),
_ = require("underscore"),
async = require("async");

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
  this.db.ensureIndex('applications', {name:1}, {unique:true});
  this.db.ensureIndex('event_callbacks', {app_id:1, event_name:1}, {unique:true});
  this.db.ensureIndex('static_routes', {app_id:1, route:1}, {unique:true});

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

  dummyCallback:function () {
  },

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

      collection.insert(object, {safe:true}, function (err, docs) {
        if (err != null && err.code == 11000) {
          callback('already_exists', null);
          return;
        } else if (err != null) {
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
  GET_ALL_QUERY:{},
  APPLICATIONS_COL:'applications',
  APPLICATION_SEQ_NAME:'appSeqNumber',
  USER_COL:'application_users',
  USER_GROUP_COL:'application_user_groups',
  USER_SEQ_NAME:'userSeqNumber',
  USER_GROUP_SEQ_NAME:'userGroupSeqNumber',
  EVENT_CALLBACKS_COL:'event_callbacks',
  EVENT_TEMPLATES_COL:'event_templates',
  STATIC_ROUTES_COL:'static_routes',

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
      application.routes_prefix = application.routes_prefix;
      if (_.isUndefined(application.routes_prefix) || _.isEmpty(application.routes_prefix)) {
        application.routes_prefix = '/api/1';
      }
      storage.create(storage.APPLICATIONS_COL, application, callback);
    });
  },

  saveApplication:function (application, callback) {
    var storage = this;

    var app_id = parseInt(application.id);

    // TODO: rework
    var object = { $set:{}};
    if (typeof application.notify_proxy_fun == 'string') {
      object.$set.notify_proxy_fun = application.notify_proxy_fun;
    }

    if (Array.isArray(application.object_types)) {
      object.$set.object_types = application.object_types;
    }

    if (_.isString(application.description)) {
      object.$set.description = application.description;
    }

    if (_.isString(application.routes_prefix)) {
      object.$set.routes_prefix = application.routes_prefix;
    }

    storage.put(storage.APPLICATIONS_COL, {id:app_id}, object, function (err, saved) {
      if (saved == null) {
        callback('not_found');
        return;
      }
      callback(err, saved);
    });
  },


  getApplication:function (app_id, callback) {
    var storage = this;
    var query = typeof app_id != 'undefined' ? {id:parseInt(app_id)} : storage.GET_ALL_QUERY;
    storage.get(storage.APPLICATIONS_COL, query, callback);
  },


  deleteApplication:function (app_id, callback) {
    app_id = parseInt(app_id);

    var storage = this;
    storage.remove(storage.APPLICATIONS_COL, {id:app_id}, function () {
      storage.remove(storage.USER_COL, {app_id:app_id});
      storage.remove(storage.USER_GROUP_COL, {app_id:app_id});
      storage.remove(storage.EVENT_CALLBACKS_COL, {app_id:app_id});
      storage.remove(storage.STATIC_ROUTES_COL, {app_id:app_id});
      storage.db.collection(storage.getResourceCollectionName(app_id), function (err, collection) {
        collection.drop();
      });
      callback(null, {removed:true});
    });

  },

  copyCollection:function (source_collection_name, target_collection_name, query, callback) {
    var storage = this;
    storage.db.collection(source_collection_name, function (err, collection) {
      collection.find(query, function (err, cursor) {
        cursor.toArray(function (err, items) {
          storage.db.collection(target_collection_name, function (err, collection) {
            collection.insert(items, function (err, result) {
              delete items;
              callback(err, result);
            });
          });
        });
      });
    });
  },

  copyCollectionItems:function (collection_name, fields_transformation, query, callback) {
    var storage = this;
    storage.db.collection(collection_name, function (err, collection) {
      collection.find(query, function (err, cursor) {
        cursor.toArray(function (err, items) {
          var converted_items = [];
          var item = null;
          for (var index in items) {
            item = _.extend(items[index], fields_transformation);
            delete item._id;
            converted_items.push(item);
          }
          //delete items;
          collection.insert(converted_items, function (err, result) {
            delete converted_items;
            callback(err, result);
          });
        });
      });
    });
  },

  cloneApplication:function (app_id, opts, callback) {
    app_id = parseInt(app_id);

    var storage = this;
    storage.getApplication(app_id, function (err, applications) {
      if (_.isEmpty(applications)) {
        callback('not_found', null);
        return;
      }

      var application = applications[0];
      storage.getNextId(storage.APPLICATION_SEQ_NAME, function (err, id) {
        if (err != null) {
          callback(err, null);
          return;
        }

        delete application._id;
        application.id = parseInt(id);
        if (_.isUndefined(opts.name)) {
          application.name += '_clone';
        } else {
          application.name = opts.name;
        }

        opts.clone_callbacks = opts.clone_callbacks === false ? false : true;
        opts.clone_callbacks = opts.clone_static_routes === false ? false : true;

        application.access_token = storage.generateAccessToken();

        storage.create(storage.APPLICATIONS_COL, application, function (err, saved) {
          if (err != null) {
            callback(err, null);
            return;
          }

          // do clone
          async.series([

            function (done) {
              if (opts.clone_instances === true) {
                var source_collection_name = storage.getResourceCollectionName(app_id);
                var target_collection_name = storage.getResourceCollectionName(id);
                storage.copyCollection(source_collection_name, target_collection_name, {},
                function (err, result) {
                  done(err);
                });
              } else {
                done(null);
              }
            },

            function (done) {
              if (opts.clone_users === true) {
                storage.copyCollectionItems(storage.USER_COL, {app_id:id}, {app_id:app_id},
                function (err, result) {
                  done(err);
                });
              } else {
                done(null);
              }
            },

            function (done) {
              if (opts.clone_callbacks === true) {
                storage.copyCollectionItems(storage.EVENT_CALLBACKS_COL, {app_id:id}, {app_id:app_id},
                function (err, result) {
                  done(err);
                });
              } else {
                done(null);
              }

            },

            function (done) {
              if (opts.clone_static_routes === true) {
                storage.copyCollectionItems(storage.STATIC_ROUTES_COL, {app_id:id}, {app_id:app_id},
                function (err, result) {
                  done(err);
                });
              } else {
                done(null);
              }
            }
          ],
          function (err) {
            //finished
            callback(err, application);
          });
        });
      });
    });
  },


  generateAccessToken:function () {
    return this.crypto.randomBytes(24).toString('hex');
  },

  renewAppAccessToken:function (app_id, callback) {

    var storage = this;
    var query = {id:parseInt(app_id)};
    var new_access_token = storage.generateAccessToken();
    var modify = { $set:{ access_token:new_access_token}};
    storage.put(storage.APPLICATIONS_COL, query, modify, function (err, result) {
      if (err != null) {
        callback(err, null);
        return;
      }

      storage.clearAppInfoCache(app_id);

      callback(null, {access_token:new_access_token});
    });
  },

  application_infos:{},

  clearAppInfoCache:function (app_id) {

    for (var index in this.application_infos) {
      if (this.application_infos[index].id == app_id) {
        this.application_infos[index] = null;
        return;
      }
    }
  },

  getAppInfoByAccessToken:function (access_token, callback) {
    var app_info = this.application_infos[access_token];
    if (!_.isUndefined(app_info) && app_info !== null) {
      callback(null, app_info);
    } else {
      var storage = this;
      storage.get(storage.APPLICATIONS_COL, {access_token:access_token}, function (err, items) {
        if (err != null || _.isEmpty(items)) {
          callback(err, null);
          return;
        }

        var application = items[0];
        var app_info = {
            id: application.id,
            routes_prefix: application.routes_prefix || '/api/1'
        };

        storage.application_infos[access_token] == app_info;
        callback(null, app_info);
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
    storage.getNextId(storage.USER_SEQ_NAME, function (err, id) {
      user.id = parseInt(id);
      user.app_id = parseInt(app_id);
      user.access_token = storage.generateAccessToken();
      storage.create(storage.USER_COL, user, callback);
    });

  },

  renewUserAccessToken:function (app_id, user_id, callback) {
    var storage = this;
    var new_access_token = storage.generateAccessToken();
    storage.put(storage.USER_COL, {id:user_id}, {$set:{access_token:new_access_token}}, function (err, saved) {
      if (err != null) {
        callback(err, null);
        return;
      }

      callback(null, {access_token:new_access_token});
    });
  },

  getUser:function (app_id, user_id, callback) {
    var storage = this;
    var query = storage.createUserOrGroupQuery(app_id, user_id);
    storage.get(storage.USER_COL, query, callback);
  },

  getUserByName:function (app_id, user_name, callback) {
    var storage = this;
    var query = { app_id:parseInt(app_id), user_name:user_name};

    storage.get(storage.USER_COL, query, function (err, items) {
      if (err != null) {
        callback(err, null);
        return;
      }

      callback(null, first(items));
    });
  },

  getUserByAccessToken:function (access_token, callback) {
    var storage = this;
    var query = {access_token:access_token};
    storage.get(this.USER_COL, query, function (err, items) {
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

    var user_object = { $set:{}};

    if (typeof user.password == 'string') {
      user_object.$set.password = user.password;
    }

    if (typeof user.user_name == 'string') {
      user_object.$set.user_name = user.user_name;
    }

    if (typeof user.groups != 'undefined') {
      user_object.$set.groups = user.groups;
    }

    if (typeof user.resource == 'string') {
      user_object.$set.resource = user.resource;
    }

    if (typeof user.resource_id == 'string') {
      user_object.$set.resource_id = user.resource_id;
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

    storage.getNextId(storage.USER_GROUP_SEQ_NAME, function (err, id) {
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

  saveUserGroup:function (app_id, user_group, callback) {
    var storage = this;
    var query = storage.createUserOrGroupQuery(app_id, user_group.id);

    var user_group_object = { $set:{}};

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
      if (applications === null || applications.length == 0) {
        callback('not_found', null);
        return;
      }

      var application = applications[0];
      for (var index in application.object_types) {
        if (application.object_types[index].name == objectType.name) {
          if (typeof callback == 'function') {
            callback('already_exists', application.object_types[index]);
          }
          return;
        }
      }

      if (typeof application.object_types == 'undefined') {
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
      if (applications === null || applications.length == 0) {
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
      if (applications === null || applications.length == 0) {
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
      if (applications === null || applications.length == 0) {
        callback('not_found', null);
        return;
      }

      var application = applications[0];
      var doUpdate = false;
      for (var index in application.object_types) {

        if (application.object_types[index].name == objectType.name) {
          var existing = application.object_types[index];

          // Copy allowed to change fields
          existing.route_pattern = objectType.route_pattern || existing.route_pattern;
          existing.proxy_fun_code = objectType.proxy_fun_code || existing.proxy_fun_code;
          existing.id_field = objectType.id_field || existing.id_field;
          existing.decode_fun_code = objectType.decode_fun_code || existing.decode_fun_code;

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
      if (applications === null || applications.length == 0) {
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
        if (isNaN(tmpId)) {
          query[id_field] = id;
        } else {
          // Handle both numbers and strings
          var if_number_clause = {};
          if_number_clause[id_field] = tmpId;
          var if_string_clause = {};
          if_string_clause[id_field] = id;

          query.$or = [if_number_clause, if_string_clause];
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

  // event callbacks
  addEventCallback:function (app_id, event_callback, callback) {
    var storage = this;

    var object = {
      app_id:parseInt(app_id),
      event_name:event_callback.event_name,
      code:event_callback.code,
      is_enabled:true
    };
    storage.create(storage.EVENT_CALLBACKS_COL, object, callback);
  },

  getEventCallbacks:function (app_id, event_name, callback) {
    var storage = this;
    var query = {app_id:parseInt(app_id) };

    if (!_.isEmpty(event_name)) {
      query.event_name = event_name;
    }

    storage.get(storage.EVENT_CALLBACKS_COL, query, callback);
  },


  updateEventCallback:function (app_id, event_callback, callback) {
    var storage = this;
    var query = {app_id:parseInt(app_id), event_name:event_callback.event_name };

    if (_.isEmpty(event_callback.event_name)) {
      callback('not_found', null);
      return;
    }

    var object = { $set:{}};
    if (!_.isEmpty(event_callback.code)) {
      object.$set.code = event_callback.code;
    }

    if (_.isBoolean(event_callback.is_enabled)) {
      object.$set.is_enabled = event_callback.is_enabled;
    }

    storage.put(storage.EVENT_CALLBACKS_COL, query, object, callback);
  },

  deleteEventCallback:function (app_id, event_name, callback) {
    var storage = this;
    var query = {app_id:parseInt(app_id), event_name:event_name};
    if (_.isEmpty(event_name)) {
      callback('not_found', null);
      return;
    }

    storage.remove(storage.EVENT_CALLBACKS_COL, query, callback);
  },

  //event templates
  addEventTemplate:function(app_id, event_template, callback){
    var storage = this;

    var object = {
      app_id:parseInt(app_id),
      event_name:event_template.event_name,
      event_data:event_template.event_data,
      is_enabled:true
    };
    console.log(object);
    storage.create(storage.EVENT_TEMPLATES_COL, object, callback);
  },

  getEventTemplates:function(app_id, event_template_name, callback){
    var storage = this;
    var query = {app_id:parseInt(app_id) };

    if (!_.isEmpty(event_template_name)) {
      query.event_name = event_template_name;
    }

    storage.get(storage.EVENT_TEMPLATES_COL, query, callback);
  },

  updateEventTemplate:function(app_id, event_template, callback){
    var storage = this;
    var query = {app_id:parseInt(app_id), _id:this.ObjectID(event_template._id) };

    if (_.isEmpty(event_template.event_name)) {
      callback('not_found', null);
      return;
    }

    var object = { $set:{}};
    if (!_.isEmpty(event_template.event_data)) {
      object.$set.event_data = event_template.event_data;
    }

    if (!_.isEmpty(event_template.event_name)) {
      object.$set.event_name = event_template.event_name;
    }

    storage.put(storage.EVENT_TEMPLATES_COL, query, object, callback);
  },

  deleteEventTemplate:function(app_id, event_template_name, callback){
    console.log("delete template");
    var storage = this;
    var query = {app_id:parseInt(app_id), event_name:event_template_name};
    if (_.isEmpty(event_template_name)) {
      callback('not_found', null);
      return;
    }

    storage.remove(storage.EVENT_TEMPLATES_COL, query, callback);
  },

  // Static routes
  addStaticRoute:function (app_id, route, callback) {
    var storage = this;
    app_id = parseInt(app_id);

    if (!_.isString(route.route) || !_.isString(route.resource) || !_.isString(route.id_fun_code) ||
    _.isEmpty(route.route) || _.isEmpty(route.resource) || _.isEmpty(route.id_fun_code)) {
      callback('invalid', null);
      return;
    }

    var object = {
      app_id:app_id,
      route:('/' + route.route).replace('//', '/'),
      resource:route.resource,
      id_fun_code:route.id_fun_code
    };

    storage.create(storage.STATIC_ROUTES_COL, object, callback);
  },

  saveStaticRoute:function (app_id, route, callback) {
    var storage = this;
    app_id = parseInt(app_id);

    if (!_.isString(route.route) || _.isEmpty(route.route)) {
      callback('invalid', null);
    }

    var query = {
      app_id:app_id,
      route:('/' + route.route).replace('//', '/')
    };

    var object = { $set:{} };

    if (_.isString(route.resource) && !_.isEmpty(route.resource)) {
      object.$set.resource = route.resource;
    }

    if (_.isString(route.id_fun_code) && !_.isEmpty(route.id_fun_code)) {
      object.$set.id_fun_code = route.id_fun_code;
    }

    storage.put(storage.STATIC_ROUTES_COL, query, object, callback);
  },

  getStaticRoutes:function (app_id, route_name, callback) {
    var storage = this;
    app_id = parseInt(app_id);

    var query = {app_id:app_id};
    if (_.isString(route_name)) {
      query.route = ('/' + route_name).replace('//', '/');
    }

    storage.get(storage.STATIC_ROUTES_COL, query, function (err, routes) {
      callback(err, routes);
    });
  },

  deleteStaticRoute:function (app_id, route_id, callback) {
    var storage = this;
    app_id = parseInt(app_id);

    var query = {app_id:app_id};
    if (_.isString(route_id)) {
      query.route = ('/' + route_id).replace('//', '/');
    }

    storage.remove(storage.STATIC_ROUTES_COL, query, callback);
  },

  // TODO: move to some place
  migrate_db:function (done) {
    var storage = this;

    async.series([
      function (done) {
        var query = { routes_prefix:{$exists:false}};
        var patch = { $set:{routes_prefix:"/api/1"}};
        storage.put(storage.APPLICATIONS_COL, query, patch, function (err, result) {
          console.log("Result of fixing application route prefix: ", err, result);
          done();
        });

      }

    ], function () {
      done();
    });

  }
};
