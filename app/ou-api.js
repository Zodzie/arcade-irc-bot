'use strict';

var helpers = require('./helpers');
var request = require('request');

module.exports = function (client, workingChannel, identityUtils) {
  var funcs = {
    play: function (nickname, amount, target) {
      amount = parseInt(amount);
      if (isNaN(amount)) {
        return;
      }

      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/ou/play/' + target + '/' + amount,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !response || !body) {
            return;
          }
          if (response.statusCode === 200) {
            var obj = helpers.parseJson(body);
            if ('roll' in obj && 'target' in obj) {
              var roll = obj.roll;
              var won;
              switch (obj.target) {
              case 'over':
                won = roll > 7;
                break;
              case 'under':
                won = roll < 7;
                break;
              case '7':
                won = roll == 7;
                break;
              default:
                client.say(workingChannel.key, nickname + ', sorry but that game was malformed.');
                return;
              }
              client.say(workingChannel.key, nickname + ', you ' + (won ? 'won' : 'lost') + ' by rolling a ' + roll + '.');
            } else {
              client.say(workingChannel.key, nickname + ', I do not know the result of that game. Sorry.');
            }
          } else {
            client.say(workingChannel.key, 'Sorry, ' + nickname + ', I could not create that game.');
          }
        });
      });
    }
  };
  return funcs;
};
