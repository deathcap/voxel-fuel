'use strict';

var Server = require('voxel-server');
var Client = require('voxel-client');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var engine = require('voxel-engine');
var extend = require('extend');
var createPlugins = require('voxel-plugins');

module.exports = function(opts) {
  return new Fuel(opts);
};

function Fuel(opts) {

  opts = opts || {};

  this.rtcDebug = opts.rtcDebug === undefined ? false : opts.rtcDebug;

  this.enableServer = opts.remoteHost === undefined;  // local server unless connecting remotely
  this.enableClient = process.browser; // always have client if running in browser

  this.pluginOpts = opts.pluginOpts || {};
  this.require = opts.require || require;

  this.commonOpts = opts.commonOpts || this.pluginOpts['voxel-engine'] || {};

  this.serverOpts = extend(extend({
    engine: engine,
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['attack', 'chat']
  }, opts.serverOpts), this.commonOpts);

  this.clientOpts = extend(extend({engine: engine}, opts.clientOpts), this.commonOpts);

  this.setup();
}

var connectPeer = function(cb) {
  quickconnect('http://rtc.io/switchboard/', {ns: 'dctest', debug:this.rtcDebug})
    .createDataChannel('test')
    .on('test:open', function(channel, peerId) {
      console.log('data channel opened ',channel,peerId);
      var stream = rtcDataStream(channel);

      cb(stream);
    });
};

Fuel.prototype.setupPlugins = function(game) {
  console.log('setupPlugins for',game);
  game.plugins = createPlugins(game, {require: this.require});

  for (var name in this.pluginOpts) {
    game.plugins.add(name, this.pluginOpts[name]);
  }

  game.plugins.loadAll();
  console.log('setupPlugins finished for',game);
};

Fuel.prototype.setup = function() {
  var self = this;

  if (this.enableClient) {
    console.log('creating client');
    connectPeer(function(stream) {
      self.clientOpts.serverStream = stream;

      console.log('client connectPeer stream',stream);
      self.client = Client(self.clientOpts);

      // received initial game settings from server
      self.client.connection.on('settings', function(settings) {
        self.setupPlugins(self.client.game); // sets self.client.game.plugins

        // post-plugin load setup
        
        var game = self.client.game;
        var registry = game.plugins.get('voxel-registry');

        game.materials.load(registry.getBlockPropsAll('texture'));   // TODO: have voxel-registry do this? on post-plugin load

        // TODO: this doesn't really belong here. move into respective plugins?
        game.buttons.down.on('pov', function() { plugins.get('voxel-player').toggle(); });
        game.buttons.down.on('vr', function() { plugins.toggle('voxel-oculus'); });
        game.buttons.down.on('home', function() { plugins.get('voxel-player').home(); });
        game.buttons.down.on('inventory', function() { plugins.get('voxel-inventory-dialog').open(); });
      });
    });
  }

  if (this.enableServer) {
    console.log('creating server');
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

    this.setupPlugins(this.server.game); // sets self.server.game.plugins

    connectPeer(function(stream) {
      console.log('server connectPeer stream',stream);
      //self.server.connectClient(emitter); // Uncaught TypeError: Object #<DuplexEmitter> has no method 'pipe' 
      self.server.connectClient(stream);
    });
  }
};

