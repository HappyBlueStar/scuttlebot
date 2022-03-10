var sbot = require('../')
var ssbKeys = require('ssb-keys')
var tape = require('tape')
var explain = require('explain-error')
var pull = require('pull-stream')
var capClient = require('../cap-client')
tape('test invite api', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice', {
    port: 45451, host: '127.0.0.1',
    timeout: 200,
    allowPrivate: true
  })

  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  var server = sbotA
    .use(require('../plugins/invite'))
    .use(require('../plugins/friends'))

  //request a secret that with particular permissions.

  var manf = server.getManifest()
  var client = sbot.createClient(alice.keys, manf)

  console.log(alice.keys.public)
  console.log(ssbKeys.hash(alice.keys.public))
  client({port: 45451, host: 'localhost', key: alice.keys.public},
    function (err, aliceC) {
    if(err) throw err

    aliceC.invite.create(1, function (err, invite) {
      if(err) throw explain(err, 'cannot create invite code')

      capClient(invite, manf, function (err, capC) {
        if(err) throw err

        capC.invite.use({
          feed: bob.id
        }, function (err, msg) {
            if(err) throw explain(err, 'bob cannot use invite code')

          pull(
            aliceC.feedsLinkedToFeed({id: bob.id, rel: 'contact'}),
            pull.collect(function (err, ary) {
              if(err) throw err

              var followed = ary[0]
              delete followed.message

              t.deepEqual(
                {source: alice.id, dest: bob.id, rel: 'contact'},
                ary[0]
              )

              capC.close()
              aliceC.close()
              server.close()
              console.log('done')
              t.end()

            })
          )
        })
      })
    })
  })
})

tape('test invite.accept api', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice2', {
    port: 45451, host: '127.0.0.1',
    timeout: 100,
    allowPrivate: true
  })

  var sbotB = u.createDB('test-invite-bob2', {
    port: 45452, host: '127.0.0.1',
    timeout: 100,
  })

  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  sbotA
    .use(require('../plugins/invite'))
    .use(require('../plugins/friends'))

  sbotB.use(require('../plugins/invite')).use(require('../plugins/friends'))

  //request a secret that with particular permissions.

  sbotA.invite.create(1, function (err, invite) {
    if(err) throw err
    sbotB.invite.accept(invite, function (err) {
      if(err) throw err
      sbotA.friends.hops(sbotA.feed.id, function (err, hops) {
        console.log(hops)
        t.equal(hops[sbotB.feed.id], 1)
        sbotA.close()
        sbotB.close()
        t.end()
      })
    })
  })
})


tape('test invite.accept doesnt follow if already followed', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice3', {
    port: 45451, host: '127.0.0.1',
    timeout: 100,
    allowPrivate: true
  })

  var sbotB = u.createDB('test-invite-bob3', {
    port: 45452, host: '127.0.0.1',
    timeout: 100,
  })

  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  sbotA
    .use(require('../plugins/invite'))
    .use(require('../plugins/friends'))

  sbotB.use(require('../plugins/invite')).use(require('../plugins/friends'))

  //request a secret that with particular permissions.

  sbotA.invite.create(2, function (err, invite) {
    if(err) throw err
    sbotB.invite.accept(invite, function (err) {
      if(err) throw err
      sbotA.friends.hops(sbotA.feed.id, function (err, hops) {
        console.log(hops)
        t.equal(hops[sbotB.feed.id], 1)
        sbotB.invite.accept(invite, function (err) {
          t.ok(err)
          sbotA.friends.hops(sbotA.feed.id, function (err, hops) {
            console.log(hops)
            t.equal(hops[sbotB.feed.id], 1)
            sbotA.close()
            sbotB.close()
            t.end()
          })
        })
      })
    })
  })
})
