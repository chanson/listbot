var express = require('express');
var router = express.Router();
var request = require('request');

var redis = require('redis');

if (process.env.REDISTOGO_URL) {
  var rtg   = require('url').parse(process.env.REDISTOGO_URL);
  var client = redis.createClient(rtg.port, rtg.hostname);

  client.auth(rtg.auth.split(':')[1]);
} else {
  var client = redis.createClient();
}

client.on('connect', function() {
  console.log('connected to redis');
});

var listExists = false;

router.post('/', function(req, res) {

  var rbody = req.body,
    trigger = rbody.command,
    item = rbody.text.replace(new RegExp(trigger, 'gi'), '').trim(),
    channelId = rbody.channel_id,
    userId = rbody.user_id,
    userName = rbody.user_name,

    // Post item to list
    addItem = function(item) {
      text = item.replace(/^\s*add\s*/i, '') + " - " + userName;
      client.rpush(channelId, text, function(err, reply) {
        if(err) {
          endRequest('Something went wrong. Please try again.');
        } else {
          endRequest('Item added!');
        }
      });
    },

    // Clear all items in the channel's list
    clearList = function() {
      if(listExists) {
        client.del(channelId, function(err, reply) {
          if(err) {
            endRequest('Something went wrong. Please try again.');
          } else {
            endRequest('List cleared!');
          }
        });
      } else {
        endRequest('There is no list to clear.');
      }
    },

    // Move item to "Completed" list and set to delete after 24 hours
    completeItem = function(item) {
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        completedItem = client.lindex(channelId, index - 1, function(err, reply) {
          if(err || reply == null) {
            endRequest('That number is not associated with a list item.');
          } else {
            client.lset(channelId, index - 1, '~' + reply + '~', function(err, reply) {
              if(err) {
                endRequest('That number is not associated with a list item.');
              } else {
                endRequest('Item completed!');
              }
            });
          }
        });
      } else {
        endRequest('There are no items in the list to complete.');
      }
    },

    // End post and respond to Slack
    endRequest = function(result) {
      res.json({
        response_type: 'in_channel',
        text: result
      });
    },

    // Display all available commands
    help = function(){
      helpText = "* _" + trigger + " show all_ - Show all items in the list\n" +
        "* _" + trigger + " show [list item number]_ - Show the item specified\n" +
        "* _" + trigger + " add [new list item text]_ - Add a new item to the list\n" +
        "* _" + trigger + " support [list item number]_ - Add your name to the item specified\n" +
        "* _" + trigger + " remove [list item number]_ - Remote the item specified\n" +
        "* _" + trigger + " complete [list item number]_ - Complete the item.\n" +
        "* _" + trigger + " clear list_ - Clear all active list items\n" +
        "* _" + trigger + " help_ - show all available commands\n";

      endRequest(helpText);
    },

    // Remove item from list
    removeItem = function(item) {
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        client.lindex(channelId, index - 1, function(err, reply) {
          if(err || reply == null) {
            endRequest('That number is not associated with a list item.');
          } else {
            client.lrem(channelId, 1, reply);
            endRequest('Item removed.');
          }
        });
      } else {
        endRequest('There are no items in the list to remove.');
      }
    },

    // Show the requested list item
    showItem = function(item) {
      if(listExists) {
        itemIndex = parseInt(item.match(/(\d+)/)[0]);

        client.lindex(channelId, itemIndex - 1, function(err, reply) {
          if(err || reply == null) {
            endRequest('That number is not associated with a list item.');
          } else {
            endRequest("* " + reply);
          }
        });
      } else {
        endRequest('There are no items in the list to show.');
      }
    },

    // Show all items in the list, completed and incomplete
    showList = function(item) {
      if(listExists) {
        client.lrange(channelId, 0, -1, function(err, reply) {
          if(err || reply == null) {
            endRequest('There are no items in the list to show.');
          } else {
            var outputItem = '';
            var outputString = '';

            reply.forEach(function (item, index) {
              outputIndex = index + 1;
              outputItem = outputIndex + ') ' + item + "\n";
              outputString += outputItem;
            });

            endRequest(outputString);
          }
        });
      } else {
        endRequest('There are no items in the list to show.');
      }
    },

    // Add name of user to list of users who have requested the list item
    supportItem = function(item) {
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        client.lindex(channelId, index - 1, function(err, reply) {
          if(err || reply == null) {
            endRequest('That number is not associated with a list item');
          } else {
            client.lset(channelId, index - 1, reply + ", " + userName, function(err, reply) {
              if(err) {
                endRequest('That number is not associated with a list item');
              } else {
                endRequest('Great! Thanks for the support.');
              }
            });
          }
        });
      } else {
        endRequest('There are no items in the list to support.');
      }
    };

  client.exists(channelId, function(err, response) {
    listExists = response == 1;

    switch (true) {
      case /^\s*show all*/gi.test(item):
        showList(item);
        break;
      case /^\s*show\s*[\d]+/gi.test(item):
        showItem(item);
        break;
      case /^\s*add\s*/i.test(item):
        addItem(item);
        break;
      case /^\s*support\s*[\d]+/i.test(item):
        supportItem(item);
        break;
      case /^\s*remove\s*[\d]+/gi.test(item):
        removeItem(item);
        break;
      case /^\s*complete\s*[\d]+/gi.test(item):
        completeItem(item);
        break;
      case /^\s*clear list.*/gi.test(item):
        clearList();
        break;
      case /^\s*help*/gi.test(item):
        help();
        break;
      default:
        endRequest("That request is invalid. Type \`" + trigger + " help\` to see a list of valid commands");
    }
  });
});

module.exports = router;
