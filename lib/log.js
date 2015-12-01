/**
 * @file log 工具方法
 * @author sparklewhy@gmail.com
 */

/**
 * @file 日志模块
 * @author sparklewhy@gmail.com
 */

/* eslint-disable no-console */
/* eslint-disable fecs-camelcase */

var helper = require('./helper');
var colorize = helper.colorize;

/**
 * 打印的 log 层级定义
 *
 * @type {string}
 * @private
 */
var _logLevel = 'info';

/**
 * 打印的 log 显示的前缀信息
 *
 * @type {string}
 * @private
 */
var _logPrefix = 'fisx';

// 定义各个层级log配置
var LOG_LEVEL = {
    debug: {
        id: 0,
        logger: console.log,
        prefix: colorize('[DEBUG]', 'success')
    },
    info: {
        id: 1,
        logger: console.log,
        prefix: colorize('[INFO]', 'success')
    },
    warn: {
        id: 2,
        logger: console.warn,
        prefix: colorize('[WARN]', 'warning')
    },
    error: {
        id: 3,
        logger: console.error,
        prefix: colorize('[ERROR]', 'error')
    }
};


/**
 * 获取打印log的方法
 *
 * @inner
 * @param {string} logLevel 要打印的log层级
 * @return {Function}
 */
function getLogger(logLevel) {
    return function () {
        var logType = LOG_LEVEL[logLevel];
        if (logType.id < _logLevel) {
            return;
        }

        var args = Array.prototype.slice.apply(arguments);
        args[0] = colorize(_logPrefix, 'info')
            + (_logPrefix ? ' ' : '') + logType.prefix + ' ' + args[0];
        logType.logger.apply(console, args);
    };
}

/**
 * 设置打印 log 的层级，默认打印层级为 `info`
 * log层级大小定义：
 * debug > info > warn > error
 *
 * @param {string} level 要打印的层级，所有低于给定层级都不打印
 */
exports.setLogLevel = function (level) {
    level && (level = String(level).toLowerCase());
    if (!level || !LOG_LEVEL[level]) {
        level = 'info';
    }

    _logLevel = level;
};

/**
 * 设置 log 显示的前缀信息
 *
 * @param {string} prefix 显示的前缀
 */
exports.setLogPrefix = function (prefix) {
    _logPrefix = prefix;
};

/**
 * 显示debug信息
 */
exports.debug = getLogger('debug');

/**
 * 显示info信息
 */
exports.info = getLogger('info');

/**
 * 显示警告信息
 */
exports.warn = getLogger('warn');

/**
 * 显示错误信息
 */
exports.error = getLogger('error');

/* eslint-enable fecs-camelcase */
/* eslint-enable no-console */
