var debug = require('debug')('knex_store');
var Store = require('skwok').Store;
var knex = require('knex');
var _ = require('lodash');
var Promise = require('bluebird');
var util = require('util');
var skwok = require('skwok');

function KnexStore(knexConfig, options) {
  this.options = options || {
    messageTableName: 'messages',
    userTableName: 'users',
    sanitize: function(obj) {
      //automatically strips any fields starting with _
      var sanitized = _.pick(obj, function(val, key) {
        return key[0] != '_';
      }); 
      return sanitized;
    } 
  };

  this.knexConfig = knex;
  this.knex = knex(knexConfig);
}
util.inherits(KnexStore, Store);

KnexStore.prototype._saveSanitized = function(obj, tableName) {
  var knex = this.knex;
  var options = this.options;
  var sanitized = this.options.sanitize(obj); 

  if(obj.id) {
    return knex(tableName)
      .where({ id: obj.id })
      .update(sanitized)
      .then(function(id) {
        return obj;
      });
  }
  else {
    return knex(tableName)
      .insert(sanitized)
      .spread(function(id) {
        return knex(tableName)
          .select()
          .where({id: id})
          .spread(function(obj) {
            return obj;
          });
      })
  }
}

KnexStore.prototype._saveMessage = function(message) {
  var m = _.cloneDeep(message);
  delete m.user;
    
  return this._saveSanitized(m, this.options.messageTableName);
}

KnexStore.prototype._saveUser = function(user) {
  user.channel = _.keys(user.addresses)[0];
  user.address = _.values(user.addresses)[0];
  delete user.addresses;
  return this._saveSanitized(user, this.options.userTableName)
}

KnexStore.prototype._save = function(message) {
  return Promise.all([
    this._saveMessage(message),
    this._saveUser(message.user)
  ])
  .spread(function(message, user) {
    message = new skwok.Message(message);
    user = new skwok.User(user);
    message.user = user;

    return message;
  });
}

KnexStore.prototype._attachUser = function(message) {
  debug('attachUser');
  var knex = this.knex;
  var options = this.options;

  return knex(options.userTableName)
    .select()
    .where({ address: message.address })
    .spread(function(user) {
      if(!user) {
        return knex(options.userTableName)
          .insert({ address: message.address, channel: message.channel })
          .spread(function(id) {
            return knex(options.userTableName)
              .select()
              .where({id: id});
          });
      }
      else {
        return [user];
      }
    })
    .spread(function(user) {
      if(!user) {
        throw new Error('no user!');
      }

      user.addresses = {};
      user.addresses[user.channel] = user.address;
      delete user.address;
      delete user.channel;

      message.user = new skwok.User(user);
      return message;
    });
}

module.exports = {
  KnexStore: KnexStore
}
