'use strict';

var helpers = require('./helpers');
var request = require('request'),
  async = require('async'),
  _ = require('underscore'),
  sprintf = require("sprintf-js").sprintf;

module.exports = function (client, workingChannel, identityUtils) {
  var bj_registry = {};
  var bj_started = {};
  var funcs = {
    list: function (nickname) {
      request({
        url: 'http://arcade.invokestatic.com/api/public/bj/list',
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
        var props = ['id', 'players', 'seats', 'state', 'action_timeout', 'start_after'];
        async.filter(obj['games'], function (entry, callback) {
          for (var i = 0; i < props.length; ++i) {
            if (!_.has(entry, props[i])) {
              callback(false);
              return;
            }
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
            entry['social_uuid'] = entry['id'];
            entry['id'] = helpers.id_game(bj_registry, entry['social_uuid']);
            callback(true);
          });
        }, function (games) {
          _.each(bj_registry, function (value, key, list) {
            if (!_.find(games, function (game) {
                return game['social_uuid'] === key;
              })) {
              delete bj_registry[key];
              delete bj_started[key];
            }
          });
          _.each(games, function (element, index, list) {
            if (element.state == 'playing') {
              if (!(element.social_uuid in bj_started)) {
                bj_started[element.social_uuid] = 'playing';
                client.say(workingChannel.key,
                  'Game `' + element.id +
                  '` has started, with the dealer up card of ' + element.dealer[0] + '. Players: ' +
                  element.players.toString().replace(/[,]/g, ', ') + '.'
                );
                _.each(element.hands, function (hands, player_uuid) {
                  identityUtils.getAliasForUuid(player_uuid, function (player) {
                    client.say(workingChannel.key, player + ': Your cards are: ' +
                      hands['0']['cards'].toString().replace(/[,]/g, ', ') + '.');
                  });
                });
              }
            } else if (element.state == 'declared') {
              if (element.social_uuid in bj_started) {
                delete  bj_started[element.social_uuid];
                client.say(workingChannel.key, 'The dealers\'s hand is ' + element['dealer'].toString().replace(/[,]/g, ', ') +
                  ' (' + element['dealer_sum'] + ').');
                _.each(element.hands, function (hands, player_uuid) {
                  identityUtils.getAliasForUuid(player_uuid, function (player) {
                    var player_game_state = hands['0']['state'];//lost won push blackjack
                    var msg = player + ', ';
                    switch (player_game_state) {
                    case 'won':
                      msg += 'you won your hand in game `' + element.id + '`!';
                      break;
                    case 'lost':
                      msg += 'you lost your hand to the dealer in game `' + element.id + '`.';
                      break;
                    case 'push':
                      msg += 'you tied the dealer in game `' + element.id + '`.';
                      break;
                    case 'blackjack':
                      msg += 'you got a blackjack in game `' + element.id + '`!';
                      break;
                    default:
                      msg += 'I don\'t know the result of that hand in game `' + element.id + '`.';
                      break;
                    }
                    client.say(workingChannel.key, msg);
                  });
                });
              }
            }
          });
          if (!nickname) {
            return;
          }
          if (games.length === 0) {
            client.say(workingChannel.key, 'There are no blackjack socials.');
            return;
          }
          client.say(workingChannel.key, 'There are some open blackjack socials.');
          _.each(games, function (element, index, list) {
            if (element.state == 'declared') {
              return;
            }
            element.state = element.state.charAt(0).toUpperCase() + element.state.slice(1);
            client.notice(nickname, sprintf(
              '[%s] Players (%d/%d): %s | State: %s',
              element.id, element.players.length, element.seats,
              element.players.length > 0 ? element.players.toString().replace(/[,]/g, ', ') : 'none',
              element['state']
            ));
          });
        });
      });
    },
    create: function (nickname, seats, start_after, action_timeout) {
      seats = parseInt(seats);
      start_after = parseInt(start_after);
      action_timeout = parseInt(action_timeout);
      if (_.isNaN(seats) || _.isNaN(start_after) || _.isNaN(action_timeout)) {
        return;
      }

      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/bj/create/' + seats + '/' + start_after + '/' + action_timeout,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !response || !body) {
            return;
          }
          if (response.statusCode === 200) {
            var id = helpers.id_game(bj_registry, body);
            client.say(workingChannel.key, nickname + ', I have created that game under the id `' + id + '`.');
          } else {
            client.say(workingChannel.key, 'Sorry, ' + nickname + ', I could not create that game.');
          }
        });
      });
    },
    join: function (game, wager, nickname) {
      wager = parseInt(wager);
      if (_.isNaN(wager)) {
        return;
      }
      var game_uuid = helpers.game_by_id(bj_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/bj/join/' + game_uuid + '/' + wager,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }
          var o = helpers.parseJson(body);
          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to join that blackjack table.');
          } else if (o.joined) {
            client.say(workingChannel.key, nickname + ', you joined the social blackjack table `' + game + '`.');
          }
        });
      });
    },
    leave: function (game, nickname) {
      var game_uuid = helpers.game_by_id(bj_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/bj/leave/' + game_uuid,
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }
          var o = helpers.parseJson(body);
          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to leave that table.');
          } else if (o.success) {
            client.say(workingChannel.key, nickname + ', you left the social table `' + game + '`.');
          }
        });
      });
    },
    hit: function (game, nickname) {
      var game_uuid = helpers.game_by_id(bj_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/bj/hit/' + game_uuid + '/0',
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }
          var o = helpers.parseJson(body);
          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to hit on your hand.');
          } else if ('cards' in o && 'state' in o) {
            client.say(workingChannel.key, nickname + ', your hand is now: ' + o.cards.toString().replace(/[,]/g, ', ')
              + ' in game `' + game + '`.');
            if (o.state == 'stood') {
              if (o.sum > 21) {
                client.say(workingChannel.key, nickname + '... you busted in game `' + game + '`.');
              } else {
                client.say(workingChannel.key, nickname + '... your hand has been automatically stood in game `' + game + '`.');
              }
            }
          }
        });
      });
    },
    stand: function (game, nickname) {
      var game_uuid = helpers.game_by_id(bj_registry, game);
      if (!game_uuid) {
        return;
      }
      identityUtils.getUserToken(nickname, function (token) {
        if (!token) {
          return;
        }
        request({
          url: 'http://arcade.invokestatic.com/api/' + token + '/bj/stand/' + game_uuid + '/0',
          timeout: 5000
        }, function (error, response, body) {
          if (error || !body) {
            return;
          }
          var o = helpers.parseJson(body);
          if (response.statusCode !== 200) {
            client.say(workingChannel.key, nickname + ', you failed to stand on your hand.');
          } else if (o.stood) {
            client.say(workingChannel.key, nickname + ', you stood on your hand in `' + game + '`.');
          }
        });
      });
    }
  };
  setInterval(funcs.list, 1000);
  return funcs;
};
