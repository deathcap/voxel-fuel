'use strict';

var Server = require('voxel-server');
var Client = require('voxel-client');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var engine = require('voxel-engine');
var extend = require('extend');
var createPlugins = require('voxel-plugins');
var createLocalMessenger = require('rtc-signaller-sw');

module.exports = function(opts) {
  return new Fuel(opts);
};

function Fuel(opts) {

  opts = opts || {};

  this.rtcDebug = opts.rtcDebug === undefined ? true : opts.rtcDebug;
  //this.createRtcMessenger = opts.createRtcMessenger === undefined ? function() { return 'http://rtc.io/switchboard/'; } : opts.createRtcMessenger;
  this.createRtcMessenger = opts.createRtcMessenger === undefined ? function() { return createLocalMessenger() } : opts.createRtcMessenger;
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
  if (typeof this.createRtcMessenger !== 'function') throw new Error('createRtcMessenger not a function: '+this.createRtcMessenger);
  var messenger = this.createRtcMessenger();
  quickconnect(messenger, {ns: this.rtcNamespace, debug:this.rtcDebug})
    .createDataChannel(this.rtcChannelName)
    .on(this.rtcChannelName + ':open', function(channel, peerId) {
      console.log('data channel opened ',channel,peerId);
      var stream = rtcDataStream(channel);

      cb(stream);
    })
    .on('error', function(err) {
      console.log('rtc error', err);
      alert('Fatal RTC error connecting to '+self.createRtcMessenger);
    });
};

Fuel.prototype.setupPlugins = function(plugins) {
  for (var name in this.pluginOpts) {
    plugins.add(name, this.pluginOpts[name]);
  }

  plugins.loadAll();
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
        console.log('** setting up client plugins');
        self.client.game.plugins = createPlugins(self.client.game, {require: self.require});
        self.client.game.plugins.all['voxel-client'] = self.client; // synthetic plugin for access

        self.setupPlugins(self.client.game.plugins);
        console.log('** finished setting up client plugins');

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

    console.log('** setting up server plugins');
    this.server.game.plugins = createPlugins(this.server.game, {require: this.require});
    this.server.game.plugins.all['voxel-server'] = this.server; // synthetic plugin for access
    this.setupPlugins(this.server.game.plugins);
    console.log('** finished setting up server plugins');

    this.connectPeer(function(stream) {
      console.log('server connectPeer stream',stream);
      self.server.connectClient(stream);
    });
  }
};

