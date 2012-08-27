DummyAPI-backend
================

Backend part of Dummy API


# Backend API

## Managing applications


**POST /api/1/app/  - create application**

    {
        name: String // application name
    }

*Response:*

    {
        name: String, // application name
        access_token: String // application access token. Should be used to access app's API
    }

**POST /api/1/app/:id/new_access_token - renew application token with id == ':id'**

*Response:*

    {
        access_token: String // new application access token.
    }


**DELETE /api/1/app/:id - remove application with id == ':id'**

    {
        access_token: String // valid access token
    }

*Response*

    Http Status: 200

## Managing application users and user groups

 **Note**: by default users are added to 'users' group which have read-write-create permissions

**POST /api/1/app/:app_id/user - create new application user**

    {
        user_name: String, // user's name
        password: String // user's password
    }

*Response:*

    {
        _id: db id
        user_name: String, // user's name
        groups: [String]   // user's groups
    }

**PUT /api/1/app/:app_id/user/:_id - update user with _id == ':_id'**

**DELETE /api/1/app/:app_id/user/:_id - delete application user with _id == ':_id'**


**POST /api/1/app/:app_id/user_group - create new application user group**

    {
        group_name: String, // unique user group name
        users: [String], // users in group
    }

*Response:*

    {
        _id: db id
        group_name: String,
        users: [String]
    }

**PUT /api/1/app/:app_id/user_group/:_id - update user group with _id == ':_id'**

**DELETE /api/1/app/:app_id/user_group/:_id - delete user group**


## Managing Object types

**GET /api/1/app/:app_id/object_type/ - list all object types**

**POST /api/1/app/:app_id/object_type/ - create new object type**

    {
        name: String // unique object type name
    }

*Response:*

    {
        name: String, // unique object type name
        route_pattern: String, // url pattern for accessing current resource within application's API
        proxy_code: String, // proxy function code used for processing each returned instance
        id_field: String // id field name
    }

**PUT /api/1/app/:app_id/object_type/:name - update object type**

    {
        route_pattern: String, // changes route pattern.
        proxy_code: String, // changes code of proxy function
        id_field: String, // changes name of id field
    }


**GET /api/1/app/:app_id/object_type/:name - get object type**

*Response:*

    {
        _id: String, // DB generated id
        // also see POST method
    }

## Socket.IO notifications API

**GET /api/1/app/:app_id/socket_io/clients - returns list of socket.io sessions**

**POST /api/1/app/:app_id/socket_io/send_event/:session_id - sends socket.io event to session id**

***note***: if session_id is missing - event is sent to all sessions

    {
        name: String, // event name
        data: String, // event data
    }


# Application API

Application API uses 8001 port and has common prefix '/api/1/'

Each request to application's resource should contain header 'Access-Token' with your application token.
If you are using user base authendication, header 'User-Access-Token' also should be added to identify user.

Query parameters 'access_token' and 'user_token' can be used insted, also.

## Object instance manipulations

**GET /api/1/:object_type_name/:id - get resource of object type name == ':object_type_name' and id == ':id'**

Response will contain any fields you have configured via object structure and proxy function of object type

**POST /api/1/:object_type_name/ - create new instance of object type name == ':object_type_name'**

Response will contain fields of stored instance plus '_id' field with db generated id.

**PUT /api/1/:object_type_name/:id - update instance of object of type name == ':object_type_name' and id == ':id'**

Response will contain saved instance

**DELETE /api/1/:object_type_name/:id - removed instance of object of type name == ':object_type_name' and id == ':id'**

Response

    {
        removed: true
    }

**Note:** 'id' field of instances is configurable via object type management. By default '_id' is used, but you can make
 any field 'id' one. Also note, all instances are uniqualy only by db generated '_id'.

## Socket.io Notifications

**TBD**