'use strict';

var Server = require('voxel-server');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var duplexEmitter = require('duplex-emitter');

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

  //this.rtcConnection = quickconnect({signalhost: 'http://rtc.io/switchboard/', ns: 'dctest', data:true}); // ~0.7
  quickconnect('http://rtc.io/switchboard/', {ns: 'dctest'})
    .createDataChannel('test')
    .on('test:open', function(channel, peerId) {
      console.log('data channel opened ',channel,peerId);
      var stream = rtcDataStream(channel);
      var emitter = duplexEmitter(stream);

      emitter.emit('ready');
      emitter.on('ready', function() {
        console.log('emitter ready');
      });

      server.connectClient(emitter);
  });
};

CSPlugin.prototype.disable = function() {
};
