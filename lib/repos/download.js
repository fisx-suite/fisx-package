/**
 * @file 下载工具方法
 * @author sparklewhy@gmail.com
 */

var fs = require('fs');
var path = require('path');
var request = require('request');
var Promise = require('bluebird');
var EventEmitter = require('events');
var mkdirp = require('mkdirp');
var helper = require('../helper');
var debug = require('debug')('download');

/**
 * 开始下载文件
 *
 * @inner
 * @param {EventEmitter} emitter 下载监听器
 * @param {string} url 下载的 url
 * @param {Object} options 下载选项
 * @param {Object=} options.headers 下载定制的头信息
 * @param {string} options.target 下载缓存的文件
 * @param {Function} cb 下载完成执行的回调
 */
function startDownload(emitter, url, options, cb) {
    var size;
    var type;
    var receiveSize = 0;
    var target = options.target;

    debug('request %s%s...', url, target ? (', cache to: ' + target) : '');

    var reqHeaders = {
        'User-Agent': 'request',
        'Accept-Encoding': 'gzip'
    };
    var headers = options.headers || {};
    Object.keys(headers).forEach(function (k) {
        reqHeaders[k] = headers[k];
    });
    var method = (options.method || 'get').toLowerCase();
    var downloadStream = request[method]({
            url: url,
            gzip: true,
            headers: reqHeaders
        },
        function (err, res, body) {
            var statusCode = res && res.statusCode;
            if (err || parseInt(statusCode / 100, 10) !== 2) {
                err || (err = url + ' response with statuscode ' + statusCode);
            }

            if (!err) {
                emitter.downloadData = {
                    data: body,
                    url: url,
                    tempFile: target
                };
            }

            cb(err);
        }
    ).on('response',
        function (res) {
            type = res.headers['content-type'];
            size = +res.headers['content-length'];
            debug('response %s, %s, %s', type, size, res.headers.filename || '');
        }
    ).on('data',
        function (data) {
            if (emitter.hasErrorHappen) {
                return;
            }
            receiveSize += data.length;
            emitter.emit('progress', {
                total: size,
                receive: receiveSize,
                percent: size ? receiveSize / size : 0
            });
        }
    );

    if (target) {
        mkdirp.sync(path.dirname(target));
        var writeStream = fs.createWriteStream(target);
        writeStream.on('close', function () {
            emitter.writeDone = true;
            cb();
        }).on('error', cb);
        writeStream && downloadStream.pipe(writeStream);
    }
}

/**
 * 下载完成处理器
 *
 * @inner
 * @param {EventEmitter} emitter 下载监听器
 * @param {Function} cb 下载完成执行的回调
 * @param {string} url 请求 url
 * @param {?Object} err 下载失败的错误对象
 */
function downloadDone(emitter, cb, url, err) {
    if (emitter.hasErrorHappen) {
        return;
    }

    if (err) {
        debug('request %s, error happen: %s', url, err);
        emitter.hasErrorHappen = true;
        emitter.emit('end', err);
        cb && cb(err);
    }
    else if (emitter.downloadData && emitter.writeDone) {
        var data = emitter.downloadData;
        debug('ok');
        emitter.emit('end', null, data);
        cb && cb(null, data);
        emitter.downloadData = null;
    }
}

/**
 * 读取缓存结束处理器
 *
 * @inner
 * @param {Object} option 选项
 * @param {?Object} err 错误对象
 * @param {?Object} data 读取的数据
 * @return {void}
 */
function readCacheDone(option, err, data) {
    var emitter = option.emitter;
    var tempFile = option.target;
    var url = option.url;
    var doneHandler = option.doneHandler;

    if (err) {
        return startDownload(emitter, url, option, doneHandler);
    }

    debug('use cache: %s', tempFile);
    emitter.writeDone = true;
    emitter.downloadData = {
        cache: true,
        data: data,
        url: url,
        tempFile: tempFile
    };
    doneHandler();
}

/**
 * 下载文件
 *
 * @param {string} url 下载文件 url
 * @param {?Object} option 下载选项
 * @param {string} option.target 下载缓存目标目录
 * @param {string} option.extName 缓存文件扩展名
 * @param {string=} option.shasum 下载内容的摘要
 * @param {Object=} option.proxyTarget 事件代理的目标对象
 * @param {boolean=} option.promise 是否返回 promise，可选，默认返回 `EventEmitter`
 * @param {string=} option.method 可选，默认 'get'
 * @param {Function=} cb 下载完成执行回调
 * @return {EventEmitter|Promise}
 */
function download(url, option, cb) {
    var emitter = new EventEmitter();
    var doneHandler = downloadDone.bind(this, emitter, cb, url);

    option || (option = {});
    var target = option.target;
    if (target) {
        debug('url: %s , %s', url, option.extName);
        var tempFile = path.join(
            target, helper.md5(url) + '.' + option.extName.toLowerCase()
        );
        var readCacheDoneHandler = readCacheDone.bind(this, {
            target: tempFile,
            headers: option.headers,
            url: url,
            emitter: emitter,
            doneHandler: doneHandler
        });

        if (option.useCache) {
            // 强制使用缓存
            fs.readFile(tempFile, readCacheDoneHandler);
        }
        else {
            // 如果缓存文件跟要下载一样，则直接用缓存
            helper.checkShasum(tempFile, option.shasum, readCacheDoneHandler);
        }
    }
    else {
        emitter.writeDone = true;
        startDownload(emitter, url, option, doneHandler);
    }

    if (!option.promise) {
        return emitter;
    }

    var proxyTarget = option.proxyTarget;
    proxyTarget && helper.proxyEvents(emitter, proxyTarget, ['end', 'progress']);
    return new Promise(function (resolve, reject) {
        emitter.on('end', function (err, data) {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    });
}

/**
 * 下载 JSON 数据
 *
 * @param {string} url 下载 url
 * @param {Object=} option 下载选项
 * @return {Promise}
 */
download.json = function (url, option) {
    option || (option = {});
    option.promise = true;
    return download(url, option).then(function (result) {
        var data = JSON.parse(result.data);
        return data;
    });
};

module.exports = exports = download;
