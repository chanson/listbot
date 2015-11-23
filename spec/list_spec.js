'use strict';
var request = require("request");
var redis = require('redis');

var app = require('../app.js');
var server;
var client;

var baseUrl = "http://localhost:3333/";
var channelId = '12345';
var command = '/listbot';
var userId = '1';
var userName = 'Chip';

var postData = function(text) {
  var data = {
    form: {
      channel_id: channelId,
      text: text,
      command: command,
      user_id: userId,
      user_name: userName
    }
  };

  return data;
};

var addToList = function(text) {
  client.rpush(channelId, text + ' - ' + userName);
};

var assertItem = function(index, response, done) {
  client.lindex(channelId, index - 1, function(err, reply) {
    expect(response).toBe(reply);
    if (done) return done();
  });
};

describe("list route", function() {
  beforeAll(function() {
    server = app.listen(3333);
    client = redis.createClient();
  });

  afterAll(function() {
    server.close();
    client.quit();
  });

  afterEach(function(done) {
    client.flushdb();
    done();
  });

  describe("POST /", function() {
    afterEach(function() {
      client.flushdb();
    });

    it("returns a 200", function(done) {
      request.post(baseUrl, { form: { text: 'something' } }, function(error, response, body) {
        expect(response.statusCode).toBe(200);
        done();
      });
    });

    it("returns default text for invalid inputs", function(done) {
      request.post(baseUrl, { form: { text: 'something' } }, function(error, response, body) {
        expect(JSON.parse(response.body).text).toBe("That request is invalid. Type `undefined help` to see a list of valid commands");
        done();
      });
    });

    describe('show all', function() {
      it("informs that there are not items present when the list is empty", function(done) {
        request.post(baseUrl, postData(command + " show all"), function(error, response, body) {
          expect(JSON.parse(response.body).text).toBe('There are no items in the list to show.');
          done();
        });
      });

      it('returns all items in the list when there are items present', function(done) {
        addToList('list item 1');
        addToList('list item 2');

        request.post(baseUrl, postData(command + " show all"), function(error, response, body) {
          expect(JSON.parse(response.body).text).toBe("1) list item 1 - " + userName + '\n' + "2) list item 2 - " + userName + '\n');
          done();
        });
      });
    });

    describe('show [item index]', function() {
      it('returns the item at the specified index or no-item-found text', function(done) {
        addToList('list item 1');
        addToList('list item 2');

        request.post(baseUrl, postData(command + ' show 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('* list item 1 - ' + userName);
          done();
        });

        request.post(baseUrl, postData(command + ' show 2'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('* list item 2 - ' + userName);
          done();
        });

        request.post(baseUrl, postData(command + ' show 9999'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('That number is not associated with a list item.');
          done();
        });
      });

      it('returns no item found text if no item is present in the list', function(done) {
        request.post(baseUrl, postData(command + 'show 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('There are no items in the list to show.');
          done();
        });
      });
    });

    describe('add [item text]', function() {
      it('stores the text in redis under the channelId, with the user name appended to the text', function(done) {
        request.post(baseUrl, postData(command + ' add list item 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('Item added!');
          assertItem(1, 'list item 1 - ' + userName, done);
          done();
        });
      });

      it('correctly stores text that contains the add keyword', function(done) {
        var itemText = 'item with word add and add ad addd';

        request.post(baseUrl, postData(command + 'add ' + itemText), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('Item added!');
          assertItem(1, itemText + ' - ' + userName, done);
          done();
        });
      });
    });

    describe('support [item index]', function() {
      it('adds the supporting users name to the item stored at the index', function(done) {
        var text = 'list item 1 - Mitch';
        client.rpush(channelId, text);

        request.post(baseUrl, postData(command + ' support 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('Great! Thanks for the support.');
          assertItem(1, text + ', ' + userName, done);
          done();
        });
      });

      it('informs that the list is empty when the list is empty', function(done) {
        request.post(baseUrl, postData(command + ' support 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('There are no items in the list to support.');
          done();
        });
      });

      it('informs that there is no item at the given index when there is no item stored', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' support 2'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('That number is not associated with a list item');
          done();
        });
      });
    });

    describe('remove [item index]', function() {
      it('removes the item stored at the index - 1 from the list', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' remove 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('Item removed.');

          client.keys('*', function(err, rows) {
            expect(rows.length).toBe(0);
          });
          done();
        });
      });

      it('informs that the list is empty when the list is empty', function(done) {
        request.post(baseUrl, postData(command + ' remove 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('There are no items in the list to remove.');
          done();
        });
      });

      it('informs that there is no item at the given index when there is no item stored', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' remove 2'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('That number is not associated with a list item.');
          done();
        });
      });
    });

    describe('complete [item index]', function() {
      it('marks the item stored at the index as complete by surrounding it in strikethrough markdown', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' complete 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('Item completed!');
          assertItem(1, '~item 1 - ' + userName + '~');
          done();
        });
      });

      it('informs that the list is empty when the list is empty', function(done) {
        request.post(baseUrl, postData(command + ' complete 1'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('There are no items in the list to complete.');
          done();
        });
      });

      it('informs that there is no item at the given index when there is no item stored', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' complete 2'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('That number is not associated with a list item.');
          done();
        });
      });
    });

    describe('clear list', function() {
      it('removes the item stored in the list', function(done) {
        addToList('item 1');

        request.post(baseUrl, postData(command + ' clear list'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('List cleared!');

          client.keys('*', function(err, rows) {
            expect(rows.length).toBe(0);
          });
          done();
        });
      });

      it('informs that the list is empty when the list is empty', function(done) {
        request.post(baseUrl, postData(command + ' clear list'), function(err, response, body) {
          expect(JSON.parse(response.body).text).toBe('There is no list to clear.');
          done();
        });
      });
    });

    describe('help', function() {
      it('returns a string of all the commands', function(done) {
        var expectedResponse = "* _" + command + " show all_ - Show all items in the list\n" +
          "* _" + command + " show [list item number]_ - Show the item specified\n" +
          "* _" + command + " add [new list item text]_ - Add a new item to the list\n" +
          "* _" + command + " support [list item number]_ - Add your name to the item specified\n" +
          "* _" + command + " remove [list item number]_ - Remote the item specified\n" +
          "* _" + command + " complete [list item number]_ - Complete the item.\n" +
          "* _" + command + " clear list_ - Clear all active list items\n" +
          "* _" + command + " help_ - show all available commands\n";

        request.post(baseUrl, postData(command + ' help'), function(error, response, body) {
          expect(JSON.parse(response.body).text).toBe(expectedResponse);
          done();
        });
      });
    });
  });
});
