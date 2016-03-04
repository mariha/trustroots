'use strict';

var should = require('should'),
    async = require('async'),
    request = require('supertest'),
    path = require('path'),
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    Message = mongoose.model('Message'),
    Thread = mongoose.model('Thread'),
    express = require(path.resolve('./config/lib/express'));

/**
 * Globals
 */
var app, agent, credentials, userFrom, userTo, userFromId, userToId, message, thread;

/**
 * Message routes tests
 */
describe('Message CRUD tests', function() {

  before(function(done) {
    // Get application
    app = express.init(mongoose);
    agent = request.agent(app);

    done();
  });

  beforeEach(function(done) {
    // Create userFrom credentials
    credentials = {
      username: 'username1',
      password: 'password123'
    };

    // Create a new user
    userFrom = new User({
      firstName: 'Full',
      lastName: 'Name',
      displayName: 'Full Name',
      email: 'test1@test.com',
      username: credentials.username,
      password: credentials.password,
      provider: 'local',
      public: true
    });

    userTo = new User({
      firstName: 'Full',
      lastName: 'Name',
      displayName: 'Full Name',
      email: 'test2@test.com',
      username: 'username2',
      password: 'password123',
      provider: 'local',
      public: true
    });

    // Save users to the test db and create new message
    userFrom.save(function() {
      userTo.save(function() {
        // Check id for userTo
        User.findOne({'username': userTo.username}, function(err, userTo) {

          // Get id
          userToId = userTo._id;

          // Create message
          message = {
            content: 'Message content',
            userTo: userToId
          };
          return done();
        });

      });
    });
  });

  it('should not be able to read inbox if not logged in', function(done) {
    agent.get('/api/messages')
      .expect(403)
      .end(function(messageSaveErr, messageSaveRes) {

        messageSaveRes.body.message.should.equal('Forbidden.');

        // Call the assertion callback
        return done(messageSaveErr);
      });
  });

  it('should not be able to send message if not logged in', function(done) {
    agent.post('/api/messages')
      .send(message)
      .expect(403)
      .end(function(messageSaveErr, messageSaveRes) {

        messageSaveRes.body.message.should.equal('Forbidden.');

        // Call the assertion callback
        return done(messageSaveErr);
      });
  });

  it('should be able to send an message if logged in', function(done) {
    agent.post('/api/auth/signin')
      .send(credentials)
      .expect(200)
      .end(function(signinErr, signinRes) {
        // Handle signin error
        if (signinErr) done(signinErr);

        // Get user id
        var userFromId = signinRes.body._id;

        // Save a new message
        agent.post('/api/messages')
          .send(message)
          .expect(200)
          .end(function(messageSaveErr, messageSaveRes) {
            // Handle message save error
            if (messageSaveErr) done(messageSaveErr);

            // Get a list of messages
            agent.get('/api/messages/' + userToId)
              .end(function(messagesGetErr, messagesGetRes) {
                // Handle message save error
                if (messagesGetErr) done(messagesGetErr);

                // Get messages list
                var thread = messagesGetRes.body;

                if(!thread[0] || !thread[0].content) {
                  return done(new Error('Missing messages from the message thread.'));
                }
                else {

                  // Set assertions
                  (thread[0].userFrom._id.toString()).should.equal(userFromId.toString());
                  (thread[0].userTo._id.toString()).should.equal(userToId.toString());
                  (thread[0].content).should.equal('Message content');
                  (thread[0].notified).should.equal(false);
                  (thread[0].read).should.equal(false);

                  // Call the assertion callback
                  return done();
                }

              });
          });
      });
  });

  it('should be able to send 25 messages and reading them should return messages in paginated order', function(done) {
    agent.post('/api/auth/signin')
      .send(credentials)
      .expect(200)
      .end(function(signinErr, signinRes) {
        // Handle signin error
        if (signinErr) done(signinErr);

        // Get user id
        var userFromId = signinRes.body._id;

            // Now loop 25 messages in...
            // "Older" messages will have smaller numbers
            // @link https://github.com/caolan/async#whilsttest-fn-callback
            var count = 0;
            async.whilst(
              function () { return count < 25; },
              function (callback) {

                count++;
                var newMessage = message;
                newMessage.content = 'Message content ' + count;

                agent.post('/api/messages')
                  .send(newMessage)
                  .expect(200)
                  .end(function(messageSaveErr, messageSaveRes) {
                    // Handle message save error
                    if (messageSaveErr) done(messageSaveErr);

                    // This message was saved okay, continue to the next one...
                    callback(null, count);
                  });
              },
              // All messages sent, continue.
              function (err, totalCount) {

                // Get a list of messages
                agent.get('/api/messages/' + userToId)
                  .expect(200)
                  .end(function(messagesGetErr, messagesGetRes) {
                    // Handle message read error
                    if (messagesGetErr) done(messagesGetErr);

                    // Get messages list
                    var thread = messagesGetRes.body;

                    // Response header should inform about pagination
                    //console.log(messagesGetRes.res.headers.link);

                    if(!thread[0] || !thread[0].content) {
                      return done(new Error('Missing messages from the message thread.'));
                    }
                    else {
                      // Pagination gives 20 messages at once
                      thread.length.should.equal(20);

                      // Set assertions for first and last message
                      (thread[0].content).should.match('Message content 25');
                      (thread[19].content).should.match('Message content 6');

                      // Get the 2nd page
                      agent.get('/api/messages/' + userToId + '?page=2')
                        .expect(200)
                        .end(function(messagesGetErr, messagesGetRes) {
                          // Handle message read error
                          if (messagesGetErr) done(messagesGetErr);

                          // Get messages list
                          var thread = messagesGetRes.body;

                          // Response header should inform about pagination
                          //console.log(messagesGetRes.res.headers.link);

                          if(!thread[0] || !thread[0].content) {
                            return done(new Error('Missing messages from the message thread.'));
                          }
                          else {

                             // Pagination gives 20 messages at once but there are only 5 left for the 2nd page
                             thread.length.should.equal(5);

                             // Set assertions for first and last message
                             (thread[0].content).should.match('Message content 5');
                             (thread[4].content).should.match('Message content 1');

                            // Call the assertion callback
                            return done();
                          }
                        });

                    }
                  });

                }
            );

      });
  });

  it('should not be able to send a message to myself', function(done) {
    agent.post('/api/auth/signin')
      .send(credentials)
      .expect(200)
      .end(function(signinErr, signinRes) {
        // Handle signin error
        if (signinErr) done(signinErr);

        // Get user id
        var userFromId = signinRes.body._id;

        var messageToMyself = message;
        messageToMyself.userTo = userFromId;

        // Save a new message
        agent.post('/api/messages')
          .send(messageToMyself)
          .expect(403)
          .end(function(messageSaveErr, messageSaveRes) {

            messageSaveRes.body.message.should.equal('Recepient cannot be currently authenticated user.');

            // Call the assertion callback
            return done(messageSaveErr);
          });
      });
  });

  afterEach(function(done) {
    // Uggggly pyramid revenge!
    User.remove().exec(function() {
      Message.remove().exec(function() {
        Thread.remove().exec(done);
      });
    });
  });
});
