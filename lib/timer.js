/**
 * @file 计时器对象
 * @author sparklewhy@gmail.com
 */

var prettyMs = require('pretty-ms');

function Timer() {

}

Timer.prototype = {
    constructor: Timer,

    start: function () {
        if (this._started) {
            return;
        }

        this._started = true;
        this._time = Date.now();
    },

    restart: function () {
        this._started = false;
        this.start();
    },

    getTotalTime: function (format) {
        var diff = Date.now() - this._time;
        if (format) {
            return this.formatTime(diff);
        }
        return diff;
    },

    formatTime: function (ms) {
        var prettyMs = require('pretty-ms');
        return prettyMs(ms);
    }
};

/**
 * 计时器对象
 *
 * @type {Object}
 */
module.exports = exports = Timer;
