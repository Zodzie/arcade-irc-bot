'use strict';

var helpers = require('./helpers');
var request = require('request'),
  async = require('async'),
  _ = require('underscore'),
  sprintf = require("sprintf-js").sprintf;

module.exports = function (client, workingChannel, identityUtils) {
  var dice_duel_registry = {};
  var funcs = {
    list: function (nickname) {
      request({
        url: 'http://arcade.invokestatic.com/api/public/dd/list',
        timeout: 5000
      }, function (error, response, body) {
        if (error || !response || !body) {
          return;
        }
        if (response.statusCode !== 200) {
          return;
        }
        var obj = helpers.parseJson(body);
        if (!('games' in obj && _.isArray(obj['games']))) {
          return;
        }
        var props = ['id', 'seats', 'buy_in', 'players', 'state'];
        async.filter(obj['games'], function (entry, callback) {
          for (var i = 0; i < props.length; ++i) {
            if (!_.has(entry, props[i])) {
              callback(false);
              return;
            }
          }
          if (entry['players'].length === 0) {
            callback(false);
            return;
          }
          async.map(entry['players'], function (item, callback) {
            identityUtils.getAliasForUuid(item, function (value) {
              callback(null, value ? value : '');
            })
          }, function (err, results) {
            for (var check = 0; check < results.length; ++check) {
              if (results[check] == '') {
                callback(false);
                return;
              }
            }
            entry['players'] = results;
            entry['lobby_uuid'] = entry['id'];
            entry['id'] = helpers.id_game(dice_duel_registry, entry['lobby_uuid']);
            callback(true);
          });
        }, function (games) {
          _.each(dice_duel_registry, function (value, key, list) {
            if (!_.find(games, function (game) {
                return game['lobby_uuid'] === key;
              })) {
              delete dice_duel_registry[key];
            }
          });
          if (!nickname) {
            return;
          }
          if (games.length === 0) {
            client.say(workingChannel.key, 'Sorry, there are no ongoing dice duel games.');
          } else {
            client.say(workingChannel.key, 'There are currently ' + games.length + ' dice duel games.');
            _.each(games, function (element, index, list) {
              client.notice(nickname, sprintf(
                '[%s] (%d/%d seats) %d credits (Players: %s)',
                element.id, element.players.length, element['seats'], element['buy_in'],
                element.players.toString().replace(/[,]/g, ', ')
              ));
            });
          }
        });
      });
    },
    create: function (nickname, seats, amount) {
      seats = parseInt(seats);
      amount = parseInt(amount);
      if (_.isNaN(seats) || _.isNaN(amount)) {
        return;
      }

      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/dd/create/' + seats + '/' + amount,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !response || !body) {
            return;
          }
          if (response.statusCode === 200) {
            var id = helpers.id_game(dice_duel_registry, body);
            client.say(workingChannel.key, nickname + ', I have created that game under the id `' + id + '`.');
          } else {
            client.say(workingChannel.key, 'Sorry, ' + nickname + ', I could not create that game.');
          }
        });
      });
    },
    join: function (game, nickname) {
      var game_uuid = helpers.game_by_id(dice_duel_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/dd/join/' + game_uuid,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }

          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to join that game.');
            return;
          }

          var obj = helpers.parseJson(body);
          if (!('state' in obj && 'players' in obj && _.isArray(obj['players']))) {
            return;
          }
          client.say(workingChannel.key, nickname + ', you joined the game ' + game + '.');
          if (obj.state == 'ready') {
            async.map(obj['players'], function (item, callback) {
              identityUtils.getAliasForUuid(item, function (value) {
                callback(null, value ? value : item);
              })
            }, function (err, results) {
              client.say(
                workingChannel.key,
                results.toString().replace(/[,]/g, ', ') + ' -- please roll your dice! Good luck.'
              );
            });
          }
        });
      });
    },
    leave: function (game, nickname) {
      var game_uuid = helpers.game_by_id(dice_duel_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/dd/leave/' + game_uuid,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }

          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to leave that game.');
            return;
          }

          client.say(workingChannel.key, nickname + ', you left game ' + game + '.');
        });
      });
    },
    roll: function (game, nickname) {
      var game_uuid = helpers.game_by_id(dice_duel_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/dd/roll/' + game_uuid,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }

          if (response.statusCode !== 200) {
            client.say(workingChannel.key, 'Sorry ' + nickname + ', you can not roll.');
            return;
          }
          var obj = helpers.parseJson(body);
          if (!('requested_roll' in obj)) {
            return;
          }
          client.say(workingChannel.key, nickname + ', you rolled a ' + parseInt(obj['requested_roll']) + ' on the two six-sided dice.');
          if (!('players' in obj && 'rolls' in obj)) {
            return;
          }
          if (obj['players'].length === _.keys(obj['rolls']).length) {
            var highest = [];
            var h_roll = 2;
            _.each(obj['rolls'], function (v, k) {
              if (v > h_roll) {
                h_roll = v;
                highest = [];
              }
              if (v === h_roll) {
                highest.push(k);
              }
            });

            if (highest.length === 1) {
              identityUtils.getAliasForUuid(highest[0], function (alias) {
                client.say(workingChannel.key, alias + ', you won the game!');
              });
            } else if (highest.length > 1) {
              async.map(highest, function (item, callback) {
                identityUtils.getAliasForUuid(item, function (value) {
                  callback(null, value ? value : item);
                })
              }, function (err, results) {
                client.say(
                  workingChannel.key,
                  results.toString().replace(/[,]/g, ', ') + ' -- you tied. Re-roll!'
                );
              });
            }
          }
        });
      });
    }
  };
  return funcs;
};
