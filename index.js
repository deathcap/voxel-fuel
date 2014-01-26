'use strict';

var Server = require('voxel-server');

module.exports = function(game, opts) {
  return new CSPlugin(game, opts);
};

function CSPlugin(game, opts) {

  this.serverOpts = {
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['attack', 'chat']
  };

  this.server = Server(this.serverOpts);

  this.enable();
}

CSPlugin.prototype.enable = function() {
  this.server.on('missingChunk', function(chunk) {
    console.log('server missingChunk',chunk);
  });

  this.server.on('client.join', function(client) {
    console.log('server client.join',client);
  });

  this.server.on('error', function(error) {
    console.log('server error',error);
  });

};

CSPlugin.prototype.disable = function() {
};
