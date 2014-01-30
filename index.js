'use strict';

var Server = require('voxel-server');
var Client = require('voxel-client');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var duplexEmitter = require('duplex-emitter');
var engine = require('voxel-engine');
var extend = require('extend');

module.exports = function(opts) {
  return new Fuel(opts);
};

function Fuel(opts) {

  opts = opts || {};

  this.enableServer = opts.remoteHost === undefined;  // local server unless connecting remotely
  this.enableClient = process.browser; // always have client if running in browser

  this.commonOpts = opts.commonOpts || {};

  this.serverOpts = extend(extend({
    engine: engine,
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['attack', 'chat']
  }, opts.serverOpts), this.commonOpts);

  this.clientOpts = extend(extend({engine: engine}, opts.clientOpts), this.commonOpts);
  this.setup();
}

var connectPeer = function(cb) {
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

      cb(stream);
    });
};

Fuel.prototype.setup = function() {
  var self = this;

  if (this.enableClient) {
    connectPeer(function(stream) {
      self.clientOpts.serverStream = stream;

      console.log('client connectPeer stream',stream);
      self.client = Client(self.clientOpts);
    });
  }

  if (this.enableServer) {
    this.server = Server(this.serverOpts);

    this.server.on('missingChunk', function(chunk) {
      console.log('server missingChunk',chunk);
    });

    this.server.on('client.join', function(client) {
      console.log('server client.join',client);
    });

    this.server.on('error', function(error) {
      console.log('server error',error);
    });

    connectPeer(function(stream) {
      console.log('server connectPeer stream',stream);
      //self.server.connectClient(emitter); // Uncaught TypeError: Object #<DuplexEmitter> has no method 'pipe' 
      self.server.connectClient(stream);
    });
  }
};

