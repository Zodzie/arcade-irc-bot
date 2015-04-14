'use strict';

var irc = require('irc');
var redis = require('redis');
var redis_client = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_HOST);
redis_client.auth(process.env.REDIS_AUTH);
redis_client.on('error', console.log);

var BOT_CHAN = process.env.IRC_CHANNEL;
var client = new irc.Client(process.env.IRC_SERVER, process.env.IRC_USER_NAME, {
  channels: [BOT_CHAN]
});

client.addListener('error', function (message) {
  console.log('error: ', message);
  //TODO: reconnect
});

var identity_setup = require('./app/identity-utils');
var generic_setup = require('./app/generic-api');
var dd_setup = require('./app/dd-api');
var dice_setup = require('./app/dice-api');
var ou_setup = require('./app/ou-api');

client.addListener('registered', function () {
  client.say('NickServ', 'IDENTIFY ' + process.env.IRC_USER_PASSWORD);
});

client.addListener('join' + BOT_CHAN, function (who) {
  if (who == client.nick) {
    client.say(BOT_CHAN, 'Booting ...');
    var channel = client.chans[BOT_CHAN];
    if (channel) {
      var identity_utils = identity_setup(client, channel, redis_client);
      var generic_api = generic_setup(client, channel, identity_utils);
      var dd_api = dd_setup(client, channel, identity_utils);
      var dice_api = dice_setup(client, channel, identity_utils);
      var ou_api = ou_setup(client, channel, identity_utils);
      registerCommands(identity_utils, generic_api, dd_api, dice_api, ou_api);
    }
  }
});

function registerCommands(identity_utils, generic_api, dd_api, dice_api, ou_api) {
  client.addListener('message' + BOT_CHAN, function (from, message) {
    if (message.length < 1 || !(message[0] == '!' || message[0] == '.' || message[0] == '@')) {
      return;
    }
    message = message.slice(1);
    var params = message.split(/\s/);
    switch (params[0]) {
    case 'balance':
      var profile = null;
      if (params.length > 1) {
        profile = params[1];
      } else if (!identity_utils.isIdentified(from)) {
        client.say(BOT_CHAN, 'Sorry ' + from + ', you are not identified.');
        break;
      } else {
        profile = from;
      }
      generic_api.sayBalanceForUser(profile);
      break;
    case 'dd':
      if (!identity_utils.isIdentified(from) || params.length < 2) {
        break;
      }
      switch (params[1]) {
      case 'list':
        dd_api.list(from);
        break;
      case 'create':
        if (params.length < 3) {
          break;
        }
        var seats = 2;
        if (params.length > 3) {
          seats = params[3];
        }
        dd_api.create(from, seats, params[2]);
        break;
      case 'join':
        if (params.length < 3) {
          break;
        }
        dd_api.join(params[2], from);
        break;
      case 'leave':
        if (params.length < 3) {
          break;
        }
        dd_api.leave(params[2], from);
        break;
      case 'roll':
        if (params.length < 3) {
          break;
        }
        var lobby = params[2];
        dd_api.roll(lobby, from);
        break;
      }
      break;
    case 'dice':
      if (!identity_utils.isIdentified(from) || params.length !== 2) {
        break;
      }
      dice_api.play(from, params[1]);
      break;
    case 'ou':
      if (!identity_utils.isIdentified(from) || params.length !== 3) {
        break;
      }
      ou_api.play(from, params[1], params[2]);
      break;
    }
  });
}
