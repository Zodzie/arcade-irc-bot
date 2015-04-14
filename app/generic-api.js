'use strict';

var helpers = require('./helpers');
var request = require('request'),
  _ = require('underscore');

module.exports = function (client, workingChannel, identityUtils) {
  var funcs = {
    getBalanceForUser: function (user, callback) {
      identityUtils.getUserUuid(user, function (uuid) {
        if (uuid) {
          identityUtils.setAliasForUuid(uuid, user);
          funcs.getBalanceForUuid(uuid, callback);
        } else {
          callback(-1);
        }
      });
    },
    getBalanceForUuid: function (uuid, callback) {
      request({
        url: 'http://arcade.invokestatic.com/api/public/balance/' + uuid,
        timeout: 5000
      }, function (error, response, body) {
        if (error || !response || !body || response.statusCode != 200) {
          callback(-1);
        } else {
          var obj = helpers.parseJson(body);
          var balance;
          if ('balance' in obj && !_.isNaN(balance = parseInt(obj['balance']))) {
            callback(balance);
          } else {
            callback(-1);
          }
        }
      });
    },
    sayBalanceForUser: function (user) {
      funcs.getBalanceForUser(user, function (balance) {
        if (balance >= 0) {
          client.say(workingChannel.key, user + '\'s balance is ' + balance + '.');
        } else {
          client.say(workingChannel.key, 'Sorry, I do not know the balance of that user.');
        }
      });
    }
  };
  return funcs;
};
