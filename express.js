var express = require('express');
var fs = require('fs');
var path = require('path');

var config = require('./config');

var app = express();

app.enable('trust proxy');

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

if (fs.existsSync(config.get('app:listen'))) {
    fs.unlinkSync(config.get('app:listen'));
}

app.listen(config.get('app:listen'));

fs.chmodSync(config.get('app:listen'), 0770);

module.exports = app;
