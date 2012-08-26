/**
 * Main applications
 * Manges rest
 */

var express = require('express'),
  config = require('../config');

var app = module.exports = express.createServer();

// Configuration

app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.set('view options', { pretty:true });
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.compiler({ src:__dirname + '/public', enable:['less']}));
  app.use(express.cookieParser());
  app.use(express.session({ secret:'your secret here' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

// Now less files with @import 'whatever.less' will work(https://github.com/senchalabs/connect/pull/174)
var TWITTER_BOOTSTRAP_PATH = './node_modules/twitter-bootstrap-node/vendor/bootstrap/less';
express.compiler.compilers.less.compile = function (str, fn) {
  try {
    var less = require('less');
    var parser = new less.Parser({paths:[TWITTER_BOOTSTRAP_PATH]});
    parser.parse(str, function (err, root) {
      fn(err, root.toCSS());
    });
  } catch (err) {
    fn(err);
  }
};

app.configure('development', function () {
  app.use(express.errorHandler({ dumpExceptions:true, showStack:true }));
});

app.configure('production', function () {
  app.use(express.errorHandler());
});


// API


// start the server
app.listen(config.webui.port, function () {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
