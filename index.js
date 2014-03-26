'use strict';

var Server = require('voxel-server');
var Client = require('voxel-client');
var rtcDataStream = require('rtc-data-stream');
var quickconnect = require('rtc-quickconnect');
var extend = require('extend');
var createPlugins = require('voxel-plugins');
var createLocalMessenger = require('rtc-signaller-sw');
var createMemoryMessenger = require('messenger-memory');

module.exports = function(opts) {
  return new Fuel(opts);
};

function Fuel(opts) {

  opts = opts || {};

  if (opts.logLoadTime) {
    if (typeof window !== 'undefined' && window.performance && window.performance.timing) {
      var loadingTime = Date.now() - window.performance.timing.navigationStart;
      console.log("User-perceived page loading time: " + (loadingTime / 1000) + "s");
    }
  }

  this.rtcDebug = opts.rtcDebug === undefined ? true : opts.rtcDebug;
  //this.createRtcMessenger = opts.createRtcMessenger === undefined ? function() { return 'http://rtc.io/switchboard/'; } : opts.createRtcMessenger;
  //this.createRtcMessenger = opts.createRtcMessenger === undefined ? function() { return createLocalMessenger() } : opts.createRtcMessenger;
  this.createRtcMessenger = opts.createRtcMessenger === undefined ? function() { return createMemoryMessenger() } : opts.createRtcMessenger;
  this.rtcChannelName = opts.rtcChannelName === undefined ? 'test' : opts.rtcChannelName;
  this.rtcNamespace = opts.rtcNamespace == undefined ? 'dctest' : opts.rtcNamespace;

  this.enableClient = process.browser; // always have client if running in browser
  this.enableServer = this.needServer();
  console.log('enableServer = ',this.enableServer);
  if (this.enableClient && !this.enableServer) this.setupClientWaitingUI();

  this.pluginOpts = opts.pluginOpts || {};
  this.require = opts.require || require;

  this.commonOpts = opts.commonOpts || this.pluginOpts['voxel-engine'] || {};
  
  var engine = opts.engine;
  if (!engine) throw new Error('voxel-fuel requires engine option set to voxel-engine module');

  this.serverOpts = extend(extend({
    engine: engine,
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['attack', 'chat']
  }, opts.serverOpts), this.commonOpts);

  this.clientOpts = extend(extend({engine: engine}, opts.clientOpts), this.commonOpts);
  this.clientOpts.overrideEngineOpts = this.clientOpts; // use local settings instead of from server, since not always serizable TODO

  if (opts.exposeGlobal) window.fuel = this;

  if (engine.prototype.notCapable()) { // TODO: refactor?
    console.log('[voxel-fuel] FATAL ERROR: system not capable (missing WebGL?); aborting');
    document.body.appendChild(engine.prototype.notCapableMessage()); // TODO: why doesn't notCapable() append?
    return;
  }

  if (this.enableClient) this.createClient();
  if (this.enableServer) this.createServer();
}

Fuel.prototype.setupClientWaitingUI = function() {
  var button = document.createElement('button');

  // http://www.tipue.com/blog/center-a-button/ centering a button in a page, horizontally and vertically
  button.style.position = 'absolute';
  button.style.margin = 'auto';
  button.style.top = '0';
  button.style.right = '0';
  button.style.bottom = '0';
  button.style.left = '0';
  button.style.width = '30%';
  button.style.height = '100px';
  button.style.backgroundColor = '#ccc';
  
  // TODO: detect if no server is found, then host one? consider page refresh
  var message = document.createTextNode('Waiting for server '+window.location.hash+'... (click to host)'); // TODO: animate ellipsis
  button.appendChild(message);

  var self = this;
  button.addEventListener('click', function() {
    if (!self.enableServer) {
      self.createServer();
      self.enableServer = true;

      self.removeClientWaitingUI();
    }
  });

  this.hostButton = button;
  document.body.appendChild(button);
};

Fuel.prototype.removeClientWaitingUI = function() {
  console.log('removeClientWaitingUI');
  if (this.hostButton) {
    this.hostButton.parentElement.removeChild(this.hostButton);
    delete this.hostButton;
  }
};

Fuel.prototype.needServer = function() {
  if (!this.enableClient) return true; // if aren't running a client, we have to run something.. run only a server

  // self-host server unless user explicitly selected room to join
  return this.getRoomName() === undefined;
};

// Get name of 'room' hosting/joining; rtc-quickconnect uses '#id' hash
Fuel.prototype.getRoomName = function() {
  return window.location.hash || undefined; // '' -> undefined
};

Fuel.prototype.connectPeer = function(cb) {
  var self = this;
  if (typeof this.createRtcMessenger !== 'function') throw new Error('createRtcMessenger not a function: '+this.createRtcMessenger);
  var messenger = this.createRtcMessenger();
  quickconnect(messenger, {ns: this.rtcNamespace, debug:this.rtcDebug})
    .createDataChannel(this.rtcChannelName)
    .on(this.rtcChannelName + ':open', function(channel, peerId) {
      console.log('data channel opened ',channel,peerId);
      var stream = rtcDataStream(channel);

      cb(stream, peerId);
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

Fuel.prototype.createClient = function() {
  var self = this;

  console.log('creating client');
  this.connectPeer(function(stream) {
    if (self.client) return; // only create one client TODO: refactor, use .once() instead of .on()?

    self.clientOpts.serverStream = stream;

    console.log('client connectPeer stream',stream);
    self.client = Client(self.clientOpts);

    // received initial game settings from server
    self.client.connection.on('settings', function(settings) {
      console.log('** setting up client plugins');
      self.removeClientWaitingUI();

      self.client.game.plugins = createPlugins(self.client.game, {require: self.require});
      self.client.game.plugins.all['voxel-client'] = self.client; // synthetic plugin for access

      self.setupPlugins(self.client.game.plugins);
      console.log('** finished setting up client plugins');

      // post-plugin load setup
      
      var game = self.client.game;
      var registry = game.plugins.get('voxel-registry');
      var plugins = game.plugins;

      game.materials.load(registry.getBlockPropsAll('texture'));   // TODO: have voxel-registry do this? on post-plugin load

      // TODO: this doesn't really belong here. move into respective plugins? https://github.com/deathcap/voxel-fuel/issues/12
      game.buttons.down.on('pov', function() { plugins.get('voxel-player').toggle(); });
      game.buttons.down.on('home', function() { plugins.get('voxel-player').home(); });
    });
  });
};

Fuel.prototype.createServer = function() {
  var self = this;

  console.log('creating server');
  this.server = Server(this.serverOpts);
  if (this.server.game.notCapable()) return false;

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

  this.connectPeer(function(stream, peerId) {
    console.log('server connectPeer stream',stream,peerId);
    self.server.connectClient(stream, peerId);
  });

  return true;
};

