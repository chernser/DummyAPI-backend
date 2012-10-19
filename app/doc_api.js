var util = require("util"),
_ = require("underscore"),
async = require("async");

// Constants
var DOCUMENTATION_COLLECTION = "app_documentation";

var DocApi = module.exports = function (app_storage) {

  this.storage = app_storage;

  this.storage.createIndex(DOCUMENTATION_COLLECTION, ['app_id', 'object_type', 'title'], true);

  return this;
}

DocApi.prototype = {

  encodeTitle: function(title) {
    var bad_title_exp = /![\w\d _-]/g;

  },

  decodeTitle: function(web_encoded_title) {

  },

  getApplicationDocRoot: function (app_id, callback) {
    var api = this;
    var query = {
      app_id: parseInt(app_id)
    };

    var fields = {
      object_type: true
    };
    api.storage.getFields(DOCUMENTATION_COLLECTION, query, fields, function (err, items) {
      if (err != null) {
        callback(err, null);
        return;
      }

      var result = {
        object_types: []
      };

      var item_index, object_type;
      var href_prefix = ['/api/1/app/', app_id, '/doc/'].join('');
      for (item_index in items) {
        object_type = items[item_index].object_type;
        result.object_types.puth({rel: 'object_type_doc', href: [href_prefix, object_type].join('')});
      }

      callback(null, result);
    });
  },


  getObjectTypeDocRoot: function (app_id, object_type, callback) {
    var api = this;
    var query = {
      app_id: parseInt(app_id),
      object_type: object_type
    };
    var fields = {
      _self: 1
    };

    api.storage.getFields(DOCUMENTATION_COLLECTION, query, fields, function (err, items) {
      if (err != null) {
        callback(err, null);
        return;
      }

      var result = {
        actions: []
      };

      var item_index, href;
      for (item_index in items) {
        href = items[item_index]._self.href;
        result.actions.push({rel: 'object_type_action_doc', href: href});
      }

      callback(null, result);
    });
  },

  addObjectTypeActionDoc: function (app_id, object_type, action_doc, callback) {
    var api = this;
    app_id = parseInt(app_id);

    var action_doc_object = {
      app_id: app_id,
      object_type: object_type
    };

  },

  updateObjectTypeActionDoc: function (app_id, object_type, action_doc, callback) {

  },

  getObjectTypeActionDoc: function (app_id, object_type, action_title, callback) {

  },

  deleteObjectTypeActionDoc: function (app_id, object_type, action_title, callback) {

  }

};

