// Users Flux Store
// ----------------

"use strict";

var _            = require("lodash");
var EventEmitter = require("events").EventEmitter;

var FreeNASDispatcher = require("../dispatcher/FreeNASDispatcher");
var FreeNASConstants  = require("../constants/FreeNASConstants");

var UsersMiddleware = require("../middleware/UsersMiddleware");

var ActionTypes  = FreeNASConstants.ActionTypes;
var CHANGE_EVENT = "change";
var UPDATE_MASK  = "users.changed";
var PRIMARY_KEY  = "id";

var _updatedOnServer    = [];
var _localUpdatePending = {};
var _users              = {};

var UsersStore = _.assign( {}, EventEmitter.prototype, {

    emitChange: function() {
      this.emit( CHANGE_EVENT );
    }

  , addChangeListener: function( callback ) {
      this.on( CHANGE_EVENT, callback );
    }

  , removeChangeListener: function( callback ) {
      this.removeListener( CHANGE_EVENT, callback );
    }

  , getUpdateMask: function() {
      return UPDATE_MASK;
    }

  , getPendingUpdateIDs: function() {
      return _updatedOnServer;
    }

  , isLocalTaskPending: function( id ) {
      return _.values( _localUpdatePending ).indexOf( id ) > -1;
    }

  , isUserUpdatePending: function( id ) {
      return _updatedOnServer.indexOf( id ) > -1;
    }

  , findUserByKeyValue: function ( key, value ) {
      return _.find( _users, function ( user ) {
        return user[ key ] === value;
      });
    }

  , getUser: function( id ) {
      return _users[ id ];
    }

  , getAllUsers: function() {
      return _.values( _users );
    }

});

UsersStore.dispatchToken = FreeNASDispatcher.register( function( payload ) {
  var action = payload.action;

  switch( action.type ) {

    case ActionTypes.RECEIVE_RAW_USERS:

      var updatedUserIDs = _.pluck( action.rawUsers, PRIMARY_KEY );

      // When receiving new data, we can comfortably resolve anything that may
      // have had an outstanding update indicated by the Middleware.
      if ( _updatedOnServer.length > 0 ) {
        _updatedOnServer = _.difference( _updatedOnServer, updatedUserIDs );
      }

      action.rawUsers.map( function ( user ) {
          _users[ user [ PRIMARY_KEY ] ] = user;
      });

      UsersStore.emitChange();
      break;

    case ActionTypes.MIDDLEWARE_EVENT:
      var args = action.eventData.args;

      if ( args["name"] === UPDATE_MASK ) {
        var updateData = args["args"];

        if ( updateData["operation"] === "update" ) {
          Array.prototype.push.apply( _updatedOnServer, updateData["ids"] );
          // FIXME: This is a workaround for the current implementation of task
          // subscriptions and submission resolutions.
          UsersMiddleware.requestUsersList( _updatedOnServer );
        } else {
          // TODO: Can this be anything else?
        }

        UsersStore.emitChange();

      // TODO: Make this more generic, triage it earlier, create ActionTypes for it
      } else if ( args["name"] === "task.updated" && args.args["state"] === "FINISHED" ) {
        delete _localUpdatePending[ args.args["id"] ];
      }

      break;

    case ActionTypes.RECEIVE_USER_UPDATE_TASK:
      _localUpdatePending[ action.taskID ] = action.userID;
      UsersStore.emitChange();
      break;

    case ActionTypes.RESOLVE_USER_UPDATE_TASK:
      delete _localUpdatePending[ action.taskID ];
      UsersStore.emitChange();
      break;


    default:
      // No action
  }
});

module.exports = UsersStore;