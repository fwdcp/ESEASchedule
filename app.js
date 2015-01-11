var request = require('request');
var underscore = require('underscore');
var async = require('async');
var moment = require('moment');

var config = require('./config');
var express = require('./express');

var jar = request.jar();
jar.setCookie(request.cookie('viewed_welcome_page=1'), 'http://play.esea.net');

express.get('/filters.json', function(req, res) {
    request({
        uri: 'http://play.esea.net/index.php',
        qs: {
            's': 'league',
            'd': 'schedule',
            'format': 'json'
        },
        json: true,
        jar: jar
    }, function(err, http, body) {
        if (err || http.statusCode != 200) {
            console.log(err);
            res.status(500).end();
        }
        else {
            var filters = {
                regions: [],
                games: [],
                divisions: []
            };

            underscore.each(body.select_region_id, function(value, key, list) {
                filters.regions.push({id: key, name: value});
            });

            underscore.each(body.select_game_id, function(value, key, list) {
                filters.games.push({id: key, name: value});
            });

            underscore.each(body.select_division_level, function(value, key, list) {
                filters.divisions.push({id: key, name: value});
            });

            res.json(filters);
        }
    });
});
