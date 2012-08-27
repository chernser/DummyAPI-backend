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

**POST /api/1/app/:app_id/object_type/ - create new object type**

    {
        name: String // unique object type name
    }

*Response:*

    {
        name: String, // unique object type name
        route: String, // url pattern for accessing current resource within application's API
        proxy_function, // proxy function used for processing each returned instance
    }

**PUT /api/1/app/:app_id/object_type/:name - update object type**

    {
        // any number of existing object type resource fields that should be changed
    }


**GET /api/1/app/:app_id/object_type/:name - get object type**

*Response:*

    {


    }

## Socket.IO notifications API

**GET /api/1/app/:app_id/socket_io/clients - returns list of socket.io sessions**

**POST /api/1/app/:app_id/socket_io/send_event/:session_id - sends socket.io event to session id**

***note***: if session_id is missing - event is sent to all sessions

    {
    name: String, // event name
    data: String, // event data
    }


