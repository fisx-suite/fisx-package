/**
 * @file 加载中状态，修改自 Ora 模块，使其能支持 node 1.0 以下 版本
 * @author sparklewhy@gmail.com
 */

var chalk = require('chalk');
var cliCursor = require('cli-cursor');
var cliSpinners = require('cli-spinners');
var logSymbols = require('log-symbols');
var ProgressBar = require('progress');

/**
 * Spinner 构造函数
 *
 * @param {Object} options 选项
 * @constructor
 */
function Spinner(options) {
    if (typeof options === 'string') {
        options = {
            text: options
        };
    }

    this.options = Object.assign({
        text: '',
        color: 'cyan',
        stream: process.stderr
    }, options);

    var sp = this.options.spinner;
    this.spinner = typeof sp === 'object'
        ? sp
        : (process.platform === 'win32'
        ? cliSpinners.line
        : (cliSpinners[sp] || cliSpinners.dots));

    if (this.spinner.frames === undefined) {
        throw new Error('Spinner must define `frames`');
    }

    var opts = this.options;
    this.text = opts.text;
    this.color = opts.color;
    this.interval = opts.interval || this.spinner.interval || 100;
    this.stream = opts.stream;
    this.id = null;
    this.frameIndex = 0;
    this.enabled = opts.enabled
        || ((this.stream && this.stream.isTTY) && !process.env.CI);

    if (opts.showProgress) {
        this.bar = new ProgressBar(
            opts.fmt || ':bar :percent :etas - :elapseds',
            {
                complete: opts.complete || '=',
                incomplete: opts.incomplete || ' ',
                width: opts.width || 20,
                total: opts.total || 0,
                clear: opts.clear === undefined ? true : opts.clear,
                stream: this.stream
            }
        );
        this.percent = 0;
    }
}

Spinner.prototype.frame = function () {
    var frames = this.spinner.frames;
    var frame = frames[this.frameIndex];

    if (this.color) {
        frame = chalk[this.color](frame);
    }

    this.frameIndex = ++this.frameIndex % frames.length;
    return frame + ' ' + this.text;
};

Spinner.prototype.clear = function () {
    if (!this.enabled) {
        return this;
    }

    this.stream.clearLine();
    this.stream.cursorTo(0);

    return this;
};

Spinner.prototype.updateProgress = function (percent) {
    this.percent = percent;
    this.render();
};

Spinner.prototype.render = function () {
    if (this.bar && this.percent && this.stream.isTTY) {
        this.bar.update(this.percent);
    }
    else {
        this.clear();
        this.stream.write(this.frame());
    }

    return this;
};

Spinner.prototype.start = function () {
    if (!this.enabled || this.id) {
        return this;
    }

    cliCursor.hide();
    this.render();
    this.id = setInterval(this.render.bind(this), this.interval);

    return this;
};

Spinner.prototype.stop = function () {
    if (!this.enabled) {
        return this;
    }

    clearInterval(this.id);

    this.id = null;
    this.frameIndex = 0;
    this.clear();

    cliCursor.show();

    return this;
};

Spinner.prototype.succeed = function () {
    return this.stopAndPersist(logSymbols.success);
};

Spinner.prototype.fail = function () {
    return this.stopAndPersist(logSymbols.error);
};

Spinner.prototype.stopAndPersist = function (symbol) {
    this.stop();
    this.stream.write((symbol || ' ') + ' ' + this.text + '\n');

    return this;
};

module.exports = exports = Spinner;
