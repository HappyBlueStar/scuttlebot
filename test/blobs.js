var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var u         = require('./util')
var cont      = require('cont')
var Hasher    = require('multiblob/util').createHash
var createClient = require('../client')
var ssbKeys   = require('ssb-keys')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var gossip    = require('../plugins/gossip')
var blobs     = require('../plugins/blobs')
var friends   = require('../plugins/friends')
var replicate = require('../plugins/replicate')

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}

tape('a client can request a blob', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-blobs-alice0', {
      port: 45450, host: 'localhost', timeout: 1000,
    }).use(blobs)

  var alice = sbotA.feed

  pull(
    read(path.join(__filename)),
    sbotA.blobs.add(function (err, hash) {
      if(err) throw err
      createClient(sbotA.feed.keys, sbotA.manifest)({
        port: 45450, key: sbotA.feed.keys.public
      }, function (err, rpc) {

        rpc.blobs.has(hash, function (err) {
          if(err) throw err
          pull(
            rpc.blobs.get(hash),
            pull.collect(function (err, ary) {
              if(err) throw err
              var data = Buffer.concat(ary.map(function (e) {
                return new Buffer(e, 'base64')
              }))
              sbotA.close()
              t.equal(ssbKeys.hash(data), hash)
              t.end()
            })
          )
        })
      })
    })
  )
})

tape('replicate blobs between 2 peers - explicit want request', function (t) {
  var u = require('./util')

  var sbotA = u.createDB('test-blobs-alice1', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob1', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost', key: sbotA.feed.keys.public}]
    }).use(gossip).use(blobs)

  var bob = sbotB.feed

  pull(
    read(path.join(__filename)),
    sbotA.blobs.add(function (err, hash) {
      if(err) throw err
    })
  )

  sbotA.on('blobs:got', function (hash) {
    console.log('BLOBS', hash)
    console.log('added', hash)
    sbotB.blobs.want(hash, function (err) {
      if(err) throw err
      sbotB.blobs.has(hash, function (err, has) {
        if(err) throw err
        t.ok(has)
        t.end()
        sbotA.close()
        sbotB.close()
        console.log('TEST ENDED')
      })
    })

  })

})

tape('replicate published blobs between 2 peers', function (t) {
  var sbotA = u.createDB('test-blobs-alice2', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob2', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost', key: sbotA.feed.keys.public}]
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var bob = sbotB.feed


  pull(
    read(__filename),
    sbotA.blobs.add(null, function (err, hash) {
      if(err) throw err
      cont.para([
        alice.add({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.add({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.add({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
        console.log(data)
      })

      // bob should request the blob,
      // and then emit this event.

      sbotB.on('blobs:got', function (_hash) {
        console.log("BLOBS GOT", _hash)
        t.equal(_hash, hash)
        sbotB.blobs.has(hash, function (err, okay) {
          t.ok(okay, 'file replicated:' + hash)
          t.end()
          sbotA.close()
          sbotB.close()
        })
      })
    })
  )
})


