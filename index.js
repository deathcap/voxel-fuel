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

  this.rtcDebug = opts.rtcDebug === undefined ? true : opts.rtcDebug;
  this.rtcSwitchboard = opts.rtcSwitchboard === undefined ? 'http://rtc.io/switchboard/' : opts.rtcSwitchboard;
  this.rtcChannelName = opts.rtcChannelName === undefined ? 'test' : opts.rtcChannelName;
  this.rtcNamespace = opts.rtcNamespace == undefined ? 'dctest' : opts.rtcNamespace;

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
  this.clientOpts.overrideEngineOpts = this.clientOpts; // use local settings instead of from server, since not always serizable TODO

  if (opts.exposeGlobal) window.fuel = this;

  this.setup();
}

Fuel.prototype.connectPeer = function(cb) {
  var self = this;
  quickconnect(this.rtcSwitchboard, {ns: this.rtcNamespace, debug:this.rtcDebug})
    .createDataChannel(this.rtcChannelName)
    .on(this.rtcChannelName + ':open', function(channel, peerId) {
      console.log('data channel opened ',channel,peerId);
      var stream = rtcDataStream(channel);

      cb(stream);
    })
    .on('error', function(err) {
      console.log('rtc error', err);
      alert('Fatal RTC error connecting to '+self.rtcSwitchboard);
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
    this.connectPeer(function(stream) {
      if (self.client) return; // only create one client TODO: refactor, use .once() instead of .on()?

      self.clientOpts.serverStream = stream;

      console.log('client connectPeer stream',stream);
      self.client = Client(self.clientOpts);

      // received initial game settings from server
      self.client.connection.on('settings', function(settings) {
        self.setupPlugins(self.client.game); // sets self.client.game.plugins

        // post-plugin load setup
        
        var game = self.client.game;
        var registry = game.plugins.get('voxel-registry');
        var plugins = game.plugins;

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

    this.server.on('join', function(client) {
      console.log('server client join',client);
    });

    this.server.on('leave', function(client) {
      console.log('server client leave',client);
    });


    this.server.on('error', function(error) {
      console.log('server error',error);
    });

    this.setupPlugins(this.server.game); // sets self.server.game.plugins

    this.connectPeer(function(stream) {
      console.log('server connectPeer stream',stream);
      self.server.connectClient(stream);
    });
  }
};

