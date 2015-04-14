'use strict';

var helpers = require('./helpers');
var request = require('request');

module.exports = function (client, workingChannel, identityUtils) {
  var funcs = {
    play: function (nickname, amount) {
      amount = parseInt(amount);
      if (isNaN(amount)) {
        return;
      }

      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/dice/play/' + amount,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !response || !body) {
            return;
          }
          if (response.statusCode === 200) {
            var obj = helpers.parseJson(body);
            if ('roll' in obj && 'win_at' in obj) {
              client.say(workingChannel.key, nickname + ', you ' + (obj.roll >= obj.win_at ? 'won' : 'lost') +
                ' by rolling a ' + obj.roll + ' on the one-hundred sided die.');
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
