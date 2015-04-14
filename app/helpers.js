'use strict';

var alphabet = [
  'a', 'b', 'c', 'd', 'e', 'f',
  'g', 'h', 'i', 'j', 'k', 'l',
  'm', 'n', 'o', 'p', 'q', 'r',
  's', 't', 'u', 'v', 'w', 'x',
  'y', 'z'
];

var _ = require('underscore');

module.exports = {
  parseJson: function (o) {
    var obj;
    try {
      obj = JSON.parse(o);
    } catch (e) {
      obj = {};
    }
    return obj;
  },
  id_game: function (game_registry, uuid) {
    var used_keys = _.values(game_registry);
    if (game_registry[uuid]) {
      return game_registry[uuid];
    } else {
      var cnt = 0;
      for (; ;) {
        var index = cnt % alphabet.length;
        var off = Math.floor(cnt / alphabet.length) - 1;
        var key = '';
        if (off > -1) {
          key += alphabet[off];
        }
        key += alphabet[index];
        if (_.indexOf(used_keys, key) === -1) {
          return game_registry[uuid] = key;
        }
        ++cnt;
      }
    }
  },
  game_by_id: function (game_registry, id) {
    var keys = _.keys(game_registry), values = _.values(game_registry);
    if (keys.length !== values.length) {
      return null;
    }
    for (var i = 0; i < keys.length; ++i) {
      if (id == values[i]) {
        return keys[i];
      }
    }
    return null;
  }
};
