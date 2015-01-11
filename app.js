var request = require('request');
var underscore = require('underscore');
var async = require('async');
var moment = require('moment');

var config = require('./config');
var express = require('./express');

var jar = request.jar();
jar.setCookie(request.cookie('viewed_welcome_page=1'), 'http://play.esea.net');

express.get('/filters.json', function(req, res) {
    async.auto({
        "schedule": function(cb) {
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
                    cb(err || http.statusCode);
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

                    cb(null, filters);
                }
            });
        },
        "divisions": function(cb) {
            request({
                uri: 'http://play.esea.net/index.php',
                qs: {
                    's': 'league',
                    'd': 'standings',
                    'format': 'json'
                },
                json: true,
                jar: jar
            }, function(err, http, body) {
                if (err || http.statusCode != 200) {
                    cb(err || http.statusCode);
                }
                else {
                    var divisionIDs = underscore.flatten(underscore.map(underscore.flatten(underscore.map(underscore.values(body.select_division_id), underscore.values)), underscore.keys));

                    var minDivisionID = underscore.min(divisionIDs, Number);
                    var maxDivisionID = underscore.max(divisionIDs, Number);

                    cb(null, {'lowestDivision': minDivisionID, 'highestDivision': maxDivisionID});
                }
            });
        },
        "lowestDivision": ['divisions', function(cb, results) {
            request({
                uri: 'http://play.esea.net/index.php',
                qs: {
                    's': 'league',
                    'd': 'standings',
                    'division_id': results.divisions.lowestDivision,
                    'format': 'json'
                },
                json: true,
                jar: jar
            }, function(err, http, body) {
                if (err || http.statusCode != 200) {
                    cb(err || http.statusCode);
                }
                else {
                    cb(null, {'oldestDate': moment.unix(body.division.time_start)});
                }
            });
        }],
        "highestDivision": ['divisions', function(cb, results) {
            request({
                uri: 'http://play.esea.net/index.php',
                qs: {
                    's': 'league',
                    'd': 'standings',
                    'division_id': results.divisions.highestDivision,
                    'format': 'json'
                },
                json: true,
                jar: jar
            }, function(err, http, body) {
                if (err || http.statusCode != 200) {
                    cb(err || http.statusCode);
                }
                else {
                    cb(null, {'latestSeasonStartDate': moment.unix(body.division.time_start), 'latestSeasonStartDate': moment.unix(body.division.time_end)});
                }
            });
        }],
        "currentWeek": function(cb) {
            cb(null, {'weekBegin': moment().day(0), 'weekEnd': moment().day(6)});
        }
    }, function(err, results) {
        if (err) {
            console.log(err);
            res.status(500).end();
        }
        else {
            res.json(underscore.extend({}, results.schedule, results.lowestDivision, results.highestDivision, results.currentWeek));
        }
    });
});
