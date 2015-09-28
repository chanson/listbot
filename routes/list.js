var express = require('express');
var router = express.Router();
var request = require('request');

var redis = require('redis');

if (process.env.REDISTOGO_URL) {
  var rtg   = require('url').parse(process.env.REDISTOGO_URL);
  var client = redis.createClient(rtg.port, rtg.hostname), multi;

  client.auth(rtg.auth.split(':')[1]);
} else {
  var client = redis.createClient(), multi;
}

client.on('connect', function() {
  console.log('connected to redis');
});

router.post('/', function(req, res) {
  var rbody = req.body,
    trigger = rbody.trigger_word,
    item = rbody.text.replace(new RegExp(trigger, 'gi'), '').trim(),
    channelId = rbody.channel_id,
    userId = rbody.user_id,
    userName = rbody.user_name,
    listExists = !!client.exists(channelId),

    // Post item to list
    addItem = function(item) {
      text = item.replace(/add\s*/gi, '') + " - " + userName;
      client.rpush(channelId, text, function(err, reply) {
        if(err) {
          endRequest('Something went wrong. Please try again.');
        } else {
          endRequest('Item added!');
        }
      });
    },

    // Clear all items in the completed list
    clearCompleted = function() {
      if(!!client.exists(channelId + "_complete")) {
        client.del(channelId + "_complete", function(err, reply) {
          if(err) {
            endRequest('Something went wrong. Please try again.');
          } else {
            endRequest('List cleared!');
          }
        });
      } else {
        endRequest('There are no completed items to clear.');
      }
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
      // index = item.replace(/complete\s*/gi, '');
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        completedItem = client.lindex(channelId, index - 1, function(err, reply) {
          if(err) {
            endRequest('That number is not associated with a list item.');
          } else {
            client.rpush(channelId + "_complete", reply);
            client.lrem(channelId, 1, reply);
            endRequest('Item completed!');
          }
        });
      } else {
        endRequest('There are no items in the list to complete.');
      }
    },

    // End post and respond to Slack
    endRequest = function(result) {
      res.end(JSON.stringify({ text: result }));
    },

    // Display all available commands
    help = function(){
      helpText = "* _" + trigger + " show all_ - Show all items in the list\n" +
        "* _" + trigger + " show [list item number]_ - Show the item specified\n" +
        "* _" + trigger + " add [new list item text]_ - Add a new item to the list\n" +
        "* _" + trigger + " support [list item number]_ - Add your name to the item specified\n" +
        "* _" + trigger + " remove [list item number]_ - Remote the item specified\n" +
        "* _" + trigger + " complete [list item number]_ - Complete the item.\n" +
        "* _" + trigger + " clear active_ - Clear all active list items\n" +
        "* _" + trigger + " clear complete_ - Clear all completed list items\n" +
        "* _" + trigger + " help_ - show all available commands\n";

      endRequest(helpText);
    },

    // Remove item from list
    removeItem = function(item) {
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        client.lindex(channelId, index - 1, function(err, reply) {
          if(err) {
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
          if(err) {
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
      var listsToShow = [];

      if(listExists){
        listsToShow.push(['lrange', channelId, 0, -1]);
      }

      if(!!client.exists(channelId + '_complete')) {
        listsToShow.push(['lrange', channelId + '_complete', 0, -1]);
      }

      multi = client.multi(listsToShow).exec(function (err, replies) {
        if(replies) {
          var activeString = '';
          var completedString = '';

          // Active Items
          if(replies[0].length) {
            activeString += 'Active Items:\n';
            replies[0].forEach(function (reply, index) {
              outputIndex = index + 1;
              outputString = outputIndex + ') ' + reply + "\n";
              activeString += outputString;
            });
          }

          // Completed Items
          if(replies[1].length) {
            completedString += 'Complete Items:\n';
            replies[1].forEach(function (reply, index) {
              outputIndex = index + 1;
              outputString = outputIndex + ') ' + reply + "\n";
              completedString += outputString;
            });
          }


          if(!activeString.length && !completedString.length) {
            endRequest('There are no list items to show.');
          } else {
            endRequest(activeString + '\n' + completedString);
          }
        } else {
          endRequest('There are no list items to show.');
        }
      });
    },

    // Add name of user to list of users who have requested the list item
    supportItem = function(item) {
      if(listExists) {
        index = parseInt(item.match(/(\d+)/)[0]);
        client.lindex(channelId, index - 1, function(err, reply) {
          if(err) {
            endRequest('That number is not associated with a list item');
          } else {
            client.lset(channelId, index - 1, reply + ", " + userName);
            endRequest('Great! Thanks for the support.');
          }
        });
      } else {
        endRequest('There are no items in the list to support.');
      }
    };

  switch (true) {
    case /show all*/gi.test(item):
      showList(item);
      break;
    case /show\s*[\d]+/gi.test(item):
      showItem(item);
      break;
    case /add.*/gi.test(item):
      addItem(item);
      break;
    case /support\s*[\d]+/gi.test(item):
      supportItem(item);
      break;
    case /remove\s*[\d]+/gi.test(item):
      removeItem(item);
      break;
    case /complete\s*[\d]+/gi.test(item):
      completeItem(item);
      break;
    case /clear active.*/gi.test(item):
      clearList();
      break;
    case /clear complete.*/gi.test(item):
      clearCompleted();
      break;
    case /help*/gi.test(item):
      help();
      break;
    default:
      endRequest("That request is invalid. Type \`" + trigger + " help\` to see a list of valid commands");
  }
});

module.exports = router;
