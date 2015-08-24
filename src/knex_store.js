var debug = require('debug')('knex_store');
var Store = require('skwok').Store;
var knex = require('knex');
var _ = require('lodash');
var Promise = require('bluebird');
var util = require('util');
var skwok = require('skwok');

function _messageFromDb(message) {
  var message = new skwok.Message(message);
  return message;
}

function _messageToDb(message) {
  var message = _.pick(message, function(val, key) {
    return key[0] != '_';
  });

  return message;
}

function _userFromDb(message, user) {
  user.addresses = {};
  user.addresses[user.channel] = user.address;
  delete user.address;
  delete user.channel;

  return new skwok.User(user);
}

function _userToDb(message, user) {
  var user = _.pick(user, function(val, key) {
    return key[0] != '_';
  });

  user.channel = _.keys(user.addresses)[0];
  user.address = _.values(user.addresses)[0];
  delete user.addresses;

  return user;
}


function KnexStore(knexConfig, options) {
  this.options = options || {
    tableNames: {
      message: 'messages',
      user: 'users'
    },
    objects: ['user']
  };
  this.options.transforms = _.extend({
    messageToDb: _messageToDb,
    messageFromDb: _messageFromDb,
    userToDb: _userToDb,
    userFromDb: _userFromDb
  }, this.options.transforms);

  this.knexConfig = knex;
  this.knex = knex(knexConfig);
}
util.inherits(KnexStore, Store);

KnexStore.prototype._saveToTable = function(obj, tableName) {
  var knex = this.knex;
  var options = this.options;

  if(obj.id) {
    return knex(tableName)
      .where({ id: obj.id })
      .update(obj)
      .then(function(id) {
        return obj;
      });
  }
  else {
    return knex(tableName)
      .insert(obj)
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

KnexStore.prototype._transform = function(name, toOrFrom) {
  var args = Array.prototype.slice.call(arguments, 2);
  
  var transformFn = this.options.transforms[name + (toOrFrom == 'to' ? 'ToDb' : 'FromDb')];
  return transformFn.apply(this, args);
}

KnexStore.prototype._save = function(message) {
  var self = this;

  var dbObj = self._transform('message', 'to', message);
  return self._saveToTable(dbObj, self.options.tableNames.message)
    .then(function(message) {
      var objectPromises = _.map(self.options.objects, function(name) {
        var dbObj = self._transform(name, 'to', message, message['_' + name]);
        return self._saveToTable(dbObj, self.options.tableNames[name]);
      });

      return Promise.all(objectPromises)
        .then(function(results) {
          _.each(self.options.objects, function(name, index) {
            var obj = self._transform(name, 'from', message, results[index]);
            message['_' + name] = obj;
          });
          
          return message; 
        });
  });
}

KnexStore.prototype._attachUser = function(message) {
  debug('attachUser');
  var self = this;

  return self.knex(self.options.tableNames.user)
    .select()
    .where({ address: message.address })
    .spread(function(user) {
      if(!user) {
        var user = self._transform('user', 'to', message, { address: message.address, channel: message.channel });
        return self._saveToTable({ address: message.address, channel: message.channel }, self.options.tableNames.user);
      }
      else {
        return user;
      }
    })
    .then(function(user) {
      if(!user) {
        throw new Error('no user!');
      }

      user = _userFromDb(message, user);
      message._user = user;
      return message;
    });
}

module.exports = {
  KnexStore: KnexStore
}
