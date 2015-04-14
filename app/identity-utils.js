'use strict';

var jwt = require('jsonwebtoken');
var NAMESPACE_TOKEN = 'token:', NAMESPACE_ALIAS = 'alias:';
var alias_cache = {};

//Nickname utilities require an irc-client, the channel the bot is in, and a redis client.
module.exports = function (client, workingChannel, redis) {
  //Bind to a nickname change event to remove authentication when nickname is changed.
  client.addListener('nick', function (oldNickname, newNickname) {
    //Validate the channel object is valid (to our knowledge)
    if (!('users' in workingChannel)) {
      return;
    }
    var users = workingChannel['users'];
    //Validate the new nick name exists (it should)
    if (newNickname in users) {
      //Replace * with an empty space
      users[newNickname] = users[newNickname].replace(/[*]/g, '');
    }
  });

  //Watch for notices from NickServ about the status of a nickname
  client.addListener('notice', function (from, to, message) {
    //Validate the message is for us and comes from NickServ
    if (!(to === client.nick && from === 'NickServ')) {
      return;
    }
    //Split the message at whitespaces
    var parts = message.split(/\s/);
    //Validate it's a STATUS event, and the nickname is in the status we want (3).
    if (!(parts[0] === 'STATUS' && parts[2] == 3)) {
      return;
    }
    //Validate the channel
    if (!('users' in workingChannel)) {
      return;
    }
    //Add an asterisk to the user if not already there
    var users = workingChannel['users'];
    var nickname = parts[1];
    if (nickname in users && users[nickname] != null &&
      users[nickname].indexOf('*') === -1) {
      users[nickname] += '*';
    }
  });

  //Watch for pms involving linking to their web account
  client.addListener('pm', function (from, message) {
    var arr = message.split(/\s/);
    if (arr.length !== 2) {
      return;
    }
    if (funcs.isIdentified(from)) {
      if (arr[0].toLowerCase() == 'link') {
        funcs.setUserToken(from, arr[1]);
        client.notice(from, 'Linked -- do NOT share the command you just typed.');
      } else {
        client.notice(from, 'Unknown command, `' + arr[0] + '`.');
      }
    } else {
      client.notice(from, 'You are not identified. Please try again.');
    }
  });

  var funcs = {
    isIdentified: function (nickname) {
      //Validate the channel
      if (!('users' in workingChannel)) {
        return;
      }
      var users = workingChannel['users'];
      //Make sure our user is a valid user
      if (nickname in users && users[nickname] != null) {
        //Check if it's identified, if it is -- return so; otherwise query NickServ for an official response.
        var identified = users[nickname].indexOf('*') !== -1;
        if (!identified) {
          client.say('NickServ', 'STATUS ' + nickname);
        }
        return identified;
      }
      return false;
    },
    setUserToken: function (nickname, token) {
      nickname = nickname.toLowerCase();
      redis.set(NAMESPACE_TOKEN + nickname, token);
    },
    getUserToken: function (nickname, callback) {
      //On IRC, nicknames are not case sensitive -- we are (duh), normalize to lowercase.
      nickname = nickname.toLowerCase();
      //Call redis for the key nickname
      redis.get(NAMESPACE_TOKEN + nickname, function (err, value) {
        if (err || !value) {
          callback(null);
        } else {
          callback(value);
        }
      });
    },
    getUserUuid: function (nickname, callback) {
      funcs.getUserToken(nickname, function (token) {
        if (!token) {
          callback(null);
        } else {
          var uuid;
          try {
            uuid = jwt.decode(token)['profile_uuid'];
          } catch (e) {
            uuid = null;
          }
          callback(uuid);
        }
      });
    },
    getAliasForUuid: function (uuid, callback) {
      //If we already know this person's alias, don't look it up.
      if (alias_cache[uuid]) {
        callback(alias_cache[uuid]);
      } else {
        //We need to get the last known alias.  Maybe it's correct, maybe it isn't.
        //What the hell, we'll do it.
        redis.get(NAMESPACE_ALIAS + uuid, function (err, value) {
          if (err || !value) {
            callback(null);
          } else {
            //Update the cache
            alias_cache[uuid] = value;
            callback(value);
          }
        });
      }
    },
    setAliasForUuid: function (uuid, alias) {
      if (alias_cache[uuid] != alias) {
        //Update the cache
        alias_cache[uuid] = alias;
        //Set the value on the server for a last-known lookup
        redis.set(NAMESPACE_ALIAS + uuid, alias);
      }
    }
  };
  return funcs;
};
