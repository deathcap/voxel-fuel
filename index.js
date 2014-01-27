'use strict';

var Server = require('voxel-server');
var Client = require('voxel-client');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var duplexEmitter = require('duplex-emitter');

module.exports = function(game, opts) {
  return new CSPlugin(game, opts);
};

function CSPlugin(game, opts) {

  opts = opts || {};

  this.enableServer = opts.remoteHost === undefined;  // local server unless connecting remotely
  this.enableClient = process.browser; // always have client if running in browser


  this.serverOpts = {
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['attack', 'chat']
  };

  this.clientOpts = {}
    //serverStream:  TODO

  if (this.enableServer)
    this.server = Server(this.serverOpts);

  /* TODO: need to pass serverStream
  if (this.enableClient)
    this.client = Client(this.clientOpts);
    */

  this.enable();
}

CSPlugin.prototype.enable = function() {
  if (this.server) {
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
    var self = this;

    quickconnect('http://rtc.io/switchboard/', {ns: 'dctest', debug:true})
      .createDataChannel('test')
      .on('test:open', function(channel, peerId) {
        console.log('data channel opened ',channel,peerId);
        var stream = rtcDataStream(channel);
        var emitter = duplexEmitter(stream);

        emitter.emit('ready');
        emitter.on('ready', function() {
          console.log('emitter ready');
        });

        //self.server.connectClient(emitter); // Uncaught TypeError: Object #<DuplexEmitter> has no method 'pipe' 
        self.server.connectClient(stream);
    });
  }
  //if (this.client) // TODO
};

CSPlugin.prototype.disable = function() {
};
