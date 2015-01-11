var request = require('request');
var underscore = require('underscore');
var async = require('async');
var moment = require('moment');
var Cacheman = require('cacheman');

var config = require('./config');
var express = require('./express');

var jar = request.jar();
jar.setCookie(request.cookie('viewed_welcome_page=1'), 'http://play.esea.net');

var scheduleCache = new Cacheman('schedule');

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
                    cb(null, {'latestSeasonStartDate': moment.unix(body.division.time_start), 'latestSeasonEndDate': moment.unix(body.division.time_end)});
                }
            });
        }],
        "currentWeek": function(cb) {
            cb(null, {'weekBegin': moment().day(0).startOf('day'), 'weekEnd': moment().day(6).endOf('day'), 'nextWeekEnd': moment().day(14).startOf('day')});
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

express.get('/matches/:start/:end/list.json', function(req, res) {
    async.auto({
        "dates": function(cb) {
            var dates = [];
            var currentDate = moment(req.params.start);
            var endDate = moment(req.params.end);

            while (currentDate <= endDate) {
                dates.push(currentDate.format('YYYY-MM-DD'));
                currentDate.add(1, 'days');
            }

            cb(null, dates);
        },
        "mostRecentDivision": function(cb) {
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

                    cb(null, underscore.max(divisionIDs, Number));
                }
            });
        },
        "seasonDates": ['mostRecentDivision', function(cb, results) {
            request({
                uri: 'http://play.esea.net/index.php',
                qs: {
                    's': 'league',
                    'd': 'standings',
                    'division_id': results.mostRecentDivision,
                    'format': 'json'
                },
                json: true,
                jar: jar
            }, function(err, http, body) {
                if (err || http.statusCode != 200) {
                    cb(err || http.statusCode);
                }
                else {
                    cb(null, {'start': moment.unix(body.division.time_start), 'end': moment.unix(body.division.time_end)});
                }
            });
        }],
        "matches": ['dates', 'seasonDates', function(cb, results) {
            async.map(results.dates, function(date, cb) {
                scheduleCache.get(date, function(err, info) {
                    if (err) {
                        cb(err);
                    }
                    else {
                        if (!info) {
                            request({
                                uri: 'http://play.esea.net/index.php',
                                qs: {
                                    's': 'league',
                                    'd': 'schedule',
                                    'date': date,
                                    'region_id': 'all',
                                    'game_id': 'all',
                                    'division_level': 'all',
                                    'format': 'json'
                                },
                                json: true,
                                jar: jar
                            }, function(err, http, body) {
                                if (err || http.statusCode != 200) {
                                    cb(err || http.statusCode);
                                }
                                else {
                                    // CACHE EXPIRY:
                                    // today: 15 sec
                                    // yesterday/tomorrow: 5 minutes
                                    // this week: 30 minutes
                                    // last/next week: 1 hour
                                    // remainder of season: 3 hours
                                    // everything else: 24 hours

                                    var ttl;

                                    if (moment(date).isSame(moment(), 'day')) {
                                        ttl = '15s';
                                    }
                                    else if (moment(date).isBetween(moment().subtract(1, 'days'), moment().add(1, 'days'), 'day')) {
                                        ttl = '5m';
                                    }
                                    else if (moment(date).isBetween(moment().day(0), moment().day(6), 'day')) {
                                        ttl = '30m';
                                    }
                                    else if (moment(date).isBetween(moment().day(-7), moment().day(13), 'day')) {
                                        ttl = '1h';
                                    }
                                    else if (moment(date).isBetween(moment(results.seasonDates.start), moment(results.seasonDates.end), 'day')) {
                                        ttl = '3h';
                                    }
                                    else {
                                        ttl = '24h';
                                    }

                                    schedule.set(date, body, ttl, function(err, info) {
                                        cb(null, underscore.values(info.matches));
                                    });
                                }
                            });
                        }
                        else {
                            cb(null, underscore.values(info.matches));
                        }
                    }
                });
            }, function(err, results) {
                if (err) {
                    cb(err);
                }
                else {
                    cb(null, underscore.flatten(results.matches));
                }
            });
        }]
    }, function(err, results) {
        if (err) {
            console.log(err);
            res.status(500).end();
        }
        else {
            res.json(results.matches);
        }
    });
});
