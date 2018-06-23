var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var frontend = require('rn-bridge');
// const myaddon = require('myaddon')

console.log('Jim process.versions.modules', process.versions.modules)

const sodiumNativePrebuildsDir = path.resolve(
  __dirname, 'node_modules/sodium-native-prebuilds-nodejs-mobile'
)
console.log('Jim1 sodiumNativePrebuildsDir', sodiumNativePrebuildsDir)
console.log('Jim2', fs.readdirSync(sodiumNativePrebuildsDir))
process.env.SODIUM_NATIVE_PREBUILD = sodiumNativePrebuildsDir

var cabal;

frontend.channel.send(
  JSON.stringify({type: 'init', text: 'Node was initialized.'}),
);

frontend.channel.on('message', raw => {
  var msg = JSON.parse(raw);
  if (msg.type === 'join') return startOrJoin(msg.key, msg.nick);
  if (msg.type === 'enter') return enterChannel(msg.channel);
  if (msg.type === 'exit') return exitChannel(msg.channel);
  if (msg.type === 'publish') return publish(msg.channel, msg.text, msg.nick);
});

function startOrJoin(key, nick) {
  var starting = !key;
  var dbPath = process.env.DB_PATH ? process.env.DB_PATH :
    path.resolve(__dirname, '..', 'db');
  var dir = path.resolve(dbPath, starting ? 'myinstance' : key);

  // /private/var/containers/Bundle/Application/66D9B3C1-609B-4F8F-8DB9-015E62A78261/cabalmobile.app/
  var Cabal = require('cabal-node');
  var cabalSwarm = require('cabal-node/swarm.js');
  const hypercore = require('hypercore')
  const ram = require('random-access-memory')
  const hyperdiscovery = require('hyperdiscovery')
  const pump = require('pump')
  const through2 = require('through2')

  // console.log('Jim1 myaddon', myaddon.length('testtest'))
  /*
  if (fs.existsSync(dir)) rimraf.sync(dir);
  key = '4d88ea1069d52badf29494b2029e5ec078f8b63a1b6d0fc18f5edaf86668e613'
  const feed = hypercore(ram, key)
  const sw = hyperdiscovery(feed, {
    port: 0,
    connect: (connection, wire) => {
      pump(
        wire,
        through2(function (chunk, enc, cb) {
          console.log('From swarm', chunk)
          this.push(chunk)
          cb()
        }),
        connection,
        through2(function (chunk, enc, cb) {
          console.log('To swarm', chunk)
          this.push(chunk)
          cb()
        }),
        wire,
        err => {
          console.log('pipe to swarm finished', err && err.message)
        }
      )
    }
  })
  sw.on('connection', (stream, info) => {
    console.log('Connection', info)
    stream.on('error', err => {
      console.error('Error', err)
    })
    stream.on('close', () => {
      console.log('Closed')
    })
  })
  feed.on('ready', () => {
    console.log('Discovery Key', feed.discoveryKey.toString('hex'))
    console.log('Ready', feed.length)
    feed.on('sync', () => {
      console.log('sync', feed.length)
      onSync()
    })
    feed.on('append', () => { console.log('append', feed.length) })
  })

  function onSync () {
    printChanges(0, done)

    function printChanges (from, cb) {
      if (from >= feed.length) return cb()
      feed.get(from, (err, data) => {
        if (err) {
          console.error('Error', err)
          process.exit(1)
        }
        console.log(from, data.toString())
        printChanges(from + 1, cb)
      })
    }
  }

  function done () {
    console.log('Done.')
  }
  */

  if (starting && fs.existsSync(dir)) rimraf.sync(dir);
  cabal = Cabal(dir, starting ? null : key, {username: nick});
  cabal.db.on('ready', function() {
    if (starting) cabal.joinChannel('default');
    const key = cabal.db.key.toString('hex');
    frontend.channel.send(JSON.stringify({type: 'ready', key}));
    cabalSwarm(cabal);
    cabal.getChannels(sendChannels);
  });
}

function sendChannels(err, channels) {
  if (err) return console.error(err);
  if (cabal) {
    cabal.channels.forEach(c => {
      if (channels.indexOf(c) === -1) channels.push(c);
    });
  }
  frontend.channel.send(JSON.stringify({type: 'channels', channels}));
}

function sendMessages(err, msgs) {
  if (err) return console.error(err);
  const payload = msgs.filter(msg => msg.length > 0).map(msg => ({
    _id: `${msg[0].feed}.${msg[0].seq}`,
    author: msg[0].value.author,
    authorId: msg[0].feed,
    type: msg[0].value.type,
    createdAt: msg[0].value.time,
    text: msg[0].value.content,
  }));
  frontend.channel.send(JSON.stringify({type: 'many', payload}));
}

function enterChannel(channel) {
  if (!cabal) return;
  cabal.joinChannel(channel);
  cabal.getMessages(channel, 100, (err, msgs) => {
    sendMessages(err, msgs);
    cabal.watch(channel, () => {
      cabal.getMessages(channel, 1, sendMessages);
    });
  });
}

function exitChannel(channel) {
  if (!cabal) return;
  cabal.leaveChannel(channel);
}

function publish(channel, text, nick) {
  if (!cabal) return;
  cabal.message(channel, text, {username: nick, type: 'chat/text'});
}
