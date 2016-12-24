/**
 * @file 助手工具方法定义
 * @author sparklewhy@gmail.com
 */

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var colors = require('colors');

/**
 * 递归的遍历目录文件
 *
 * @param {string} dir 扫描初始目录
 * @param {function(string):boolean} callback 回调函数，只有扫描到文件才触发回调
 */
exports.scanDir = function (dir, callback) {
    fs.readdirSync(dir).forEach(
        function (file) {
            var fullPath = path.join(dir, file);
            var stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                exports.scanDir(fullPath, callback);
            }
            else if (stat.isFile()) {
                var rv = callback(fullPath);
                if (rv === false) {
                    return false;
                }
            }
        }
    );
};

/**
 * 获取给定的文件路径的状态信息
 *
 * @inner
 * @param {string} target 文件的目标路径
 * @return {?Object}
 */
function getFileState(target) {
    try {
        var state = fs.statSync(target);
        return state;
    }
    catch (ex) {
    }
}

/**
 * 判断给定的文件路径是否存在
 *
 * @param {string} target 要判断的目标路径
 * @return {boolean}
 */
exports.isPathExists = function (target) {
    return !!getFileState(target);
};

/**
 * 判断给定的目录路径是否存在
 *
 * @param {string} target 要判断的目标路径
 * @return {boolean}
 */
exports.isDirectoryExists = function (target) {
    var state = getFileState(target);
    return state && state.isDirectory();
};

/**
 * 判断给定的文件路径是否存在
 *
 * @param {string} target 要判断的目标路径
 * @return {boolean}
 */
exports.isFileExists = function (target) {
    var state = getFileState(target);
    return state && state.isFile();
};

/**
 * 拷贝目录到目标目录
 *
 * @param {string} from 源目录
 * @param {string} to 目标目录
 * @param {boolean=} override 是否存在同名文件覆盖，可选，默认 false
 */
exports.copyDirectory = function (from, to, override) {
    var mkdirp = require('mkdirp');

    exports.scanDir(from, function (fullPath) {
        var file = path.relative(from, fullPath);
        var target = path.join(to, file);

        if (exports.isPathExists(target) && !override) {
            return;
        }

        mkdirp.sync(path.dirname(target));
        fs.writeFileSync(target, fs.readFileSync(fullPath));
    });
};

/**
 * 将给定的源目录移动到目标目录
 * a/b -> c/d
 *
 * @param {string} source 源目录
 * @param {string} target 目标目录
 */
exports.moveDirSync = function (source, target) {
    mkdirp.sync(target);

    // XXX: node 0.1.x 版本下 windows 下会报错
    fs.renameSync(source, target);
};

/**
 * 删除目录
 *
 * @param {string} dir 要删除的目录
 */
exports.rmDirSync = function (dir) {
    require('rimraf').sync(dir);
};

/**
 * 删除文件
 *
 * @param {string} file 删除的文件路径
 * @return {boolean}
 */
exports.rmFile = function (file) {
    if (exports.isFileExists(file)) {
        fs.unlinkSync(file);
        return true;
    }
    return false;
};

/**
 * 获取给定文件路径的扩展名称，不包含 `.`
 *
 * @param  {string} filePath 文件路径
 * @return {string}
 */
exports.getFileExtName = function (filePath) {
    return path.extname(filePath).slice(1);
};

/**
 * 判断给定 url 是否是绝对的 url
 *
 * @param {string} url 要判断的 url
 * @return {boolean}
 */
exports.isAbsoluteURL = function (url) {
    return /^[a-z][a-z0-9\+\-\.]+:/i.test(url);
};

/**
 * 判断给定的路径是不是本地路径
 *
 * @param {string} filePath 要判断的文件路径
 * @return {boolean}
 */
exports.isLocalPath = function (filePath) {
    return !(/^\/\//.test(filePath) || exports.isAbsoluteURL(filePath));
};

/**
 * 同步读取文件内容
 *
 * @param {string} filePath 读取文件路径
 * @return {{err: *, data: Buffer}}
 */
exports.readFileSync = function (filePath) {
    try {
        return {data: fs.readFileSync(filePath)};
    }
    catch (ex) {
        return {err: ex};
    }
};

/**
 * 判断给定的路径是否是空目录
 *
 * @param {string} path 要判断的路径
 * @param {Function=} filter 自定义的路径过滤方法，可选
 * @return {boolean}
 */
exports.isEmptyDirSync = function (path, filter) {
    if (!exports.isDirectoryExists(path)) {
        return false;
    }

    try {
        var files = fs.readdirSync(path);

        if (typeof filter === 'function') {
            files = files.filter(filter);
        }
        return files.length === 0;
    }
    catch (err) {
        // do nothing
    }

    return false;
};

/**
 * 生成给定数据的 md5 摘要
 *
 * @param {string|Object} data 要生成摘要的数据
 * @return {string}
 */
exports.md5 = function (data) {
    var crypto = require('crypto');
    var md5 = crypto.createHash('md5');
    var encoding = typeof data === 'string' ? 'utf8' : 'binary';
    md5.update(data, encoding);
    return md5.digest('hex');
};

/**
 * 检查文件的摘要值
 *
 * @param {string} file 要校验的文件
 * @param {string} sha sha 值
 * @param {Function} callback 回调函数
 * @return {void}
 */
exports.checkShasum = function (file, sha, callback) {
    if (!exports.isFileExists(file) || !sha) {
        return process.nextTick(function () {
            callback(new Error('not the same'));
        });
    }

    sha = sha.toLowerCase();
    var chunks = [];
    var size = 0;
    var crypto = require('crypto');
    var hash = crypto.createHash('sha1');
    var stream = fs.createReadStream(file);
    stream.on('data',
        function (chunk) {
            size += chunk.length;
            chunks.push(chunk);
            hash.update(chunk);
        }
    ).on('end',
        function () {
            var actual = hash.digest('hex').toLowerCase().trim();
            var error = sha === actual
                ? null
                : new Error('[shasum]expect ' + sha + ', actual ' + actual);
            callback(error, Buffer.concat(chunks, size));
        }
    ).on('error',
        function (error) {
            callback(error);
        }
    );
};

/**
 * 处理事件代理
 *
 * @param  {EventEmitter} source 被代理的源对象
 * @param  {EventEmitter} target 要转发给的目标对象
 * @param  {string} eventName 要代理的事件名称
 * @inner
 */
function handleProxyEvent(source, target, eventName) {
    source.on(eventName, function () {
        var newArgs = Array.prototype.slice.apply(arguments);
        newArgs.unshift(eventName);
        target.emit.apply(target, newArgs);
    });
}

/**
 * 代理给定的源对象的事件，并将其转发给目标对象
 *
 * @param  {EventEmitter} source 被代理的源对象
 * @param  {EventEmitter} target 要转发给的目标对象
 * @param  {string|Array.<string>} events 要代理的事件名称
 * @example
 *     // 代理一个事件
 *     proxyEvents(source, target, 'change');
 *
 *     // 代理多个事件
 *     proxyEvents(source, target, ['change', 'add']);
 */
exports.proxyEvents = function (source, target, events) {
    if (!Array.isArray(events)) {
        events = [events];
    }

    events.forEach(function (e) {
        handleProxyEvent(source, target, e);
    });
};

/**
 * 根据功能将文字色彩化
 *
 * @param {string} text 源文字
 * @param {string} type 功能类型
 * @return {string}
 */
exports.colorize = function (text, type) {
    if (text == null) {
        return text;
    }

    var colorBrushes = {
        info: colors.grey,
        success: colors.green,
        warning: colors.yellow,
        error: colors.red,
        title: colors.cyan.bold,
        link: colors.magenta.underline
    };
    var fn = colorBrushes[type];
    return fn ? fn(text) : text;
};

/**
 * 将给定的数字补前导零，确保其满足给定的长度值
 *
 * @param {number} num 数字
 * @param {number=} length 补充后的长度值，可选，默认 2
 * @return {string}
 */
exports.paddingZero = function (num, length) {
    length || (length = 2);

    var tmp = String(num);
    var padBitNum = length - tmp.length;
    if (padBitNum > 0) {
        tmp = String(Math.pow(10, padBitNum)).substring(1) + tmp;
    }
    return tmp;
};

/**
 * 格式化日期： xxxx/xx/xx xx:xx:xx
 *
 * @param {Date} date 要格式化的日期
 * @return {string}
 */
exports.formatDate = function (date) {
    var pad = exports.paddingZero;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();

    return year + '/' + pad(month) + '/' + pad(day) + ' '
        + pad(hour) + ':' + pad(minute) + ':' + pad(second);
};

/**
 * 命令行输入交互
 *
 * @param {Object} schema 输入信息 schema
 * @param {Function=} callback 交互完成的回调
 * @return {Object}
 */
exports.prompt = function (schema, callback) {
    var logger = require('./config').log;
    var prompt = require('prompt');
    prompt.delimiter = ' ';
    prompt.message = '>' + (logger.emoji('question') || colors.grey('?'));

    process.stdout.write('\n');
    return prompt.get(schema, function (err, result) {
        if (err) {
            // logger.warn(err.stack || err);
            process.stdout.write('\n');
        }

        callback && callback(err, result);
    });
};
