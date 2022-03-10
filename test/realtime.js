
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')
// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var replicate = require('../plugins/replicate')
var gossip    = require('../plugins/gossip')
var friends   = require('../plugins/friends')
var logging   = require('../plugins/logging')

tape('replicate between 3 peers', function (t) {

  var u = require('./util')

  var bobDb = u.createDB('test-bob', {
      port: 45452, host: 'localhost', timeout: 2001
    }).use(friends).use(replicate)

  var bob = bobDb.feed

  bobDb.on('rpc:authorized', function (_, req) {
    console.log('AUTH', req)
  })

  var aliceDb = u.createDB('test-alice', {
      port: 45451, host: 'localhost', timeout: 2001,
      seeds: [{port: 45452, host: 'localhost', key: bob.keys.public}]
    }).use(gossip).use(friends).use(replicate)

  var alice = aliceDb.feed

  cont.para([
    alice.add({type: 'contact', contact: {feed: bob.id}, following: true}),
    bob.add({type: 'contact', contact: {feed: alice.id}, following: true})
  ])(function () {

    var ary = []
    pull(
      bobDb.ssb.createHistoryStream({id: alice.id, seq: 0, keys: false, live: true}),
      pull.through(function (data) {
        console.log(data)
        ary.push(data);
      }),
      pull.drain()
    )
    var l = 11
    var int = setInterval(function () {
      if(!--l) {
        clearInterval(int)
        var _ary = []
          pull(
            bobDb.ssb.createHistoryStream({id: alice.id, sequence: 0, keys: false, live: true}),
            pull.through(function (msg) {
              _ary.push(msg)
              if(_ary.length < 12) return

              bobDb.close()
              aliceDb.close()

              t.equal(_ary.length, 12)
              t.deepEqual(ary,_ary)
              t.end()
            }),
            pull.drain()
          )
      }
      else
        alice.add({type: 'test', value: new Date()},
          function (err, msg){
            console.log('added', msg.key, msg.value.sequence)
          })
    }, 200)

  })
})
