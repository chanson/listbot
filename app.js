var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var redis = require('redis');

// if (process.env.REDISTOGO_URL) {
//   var rtg   = require('url').parse(process.env.REDISTOGO_URL);
//   var client = redis.createClient(rtg.port, rtg.hostname);

//   client.auth(rtg.auth.split(':')[1]);
// } else {
//   var client = redis.createClient();
// }

// client.on('connect', function() {
//   console.log('connected to redis');
// });

var list = require('./routes/list');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', list);

// catch error and forward to handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log("ERROR=================================");
    console.log(err.message);
    console.log("======================================");
});

module.exports = app;
