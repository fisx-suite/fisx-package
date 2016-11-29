/**
 * @file 解压缩工具方法
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');
var helper = require('../helper');
var debug = require('debug')('decompress');

/**
 * 解压给定的文件到目标目录
 *
 * @param {string} processFile 要解压的文件
 * @param {string} target 要解压到的目标目录
 * @param {Object=} extra 要附加回传的数据
 * @return {Promise}
 */
function decompress(processFile, target, extra) {
    debug('file: %s...', processFile);
    // decompress 模块解压一些文件经常出现权限问题。。
    // var Decompress = require('decompress');
    // return new Promise(function (resolve, reject) {
    //    new Decompress()
    //        .src(processFile)
    //        .dest(target)
    //        .run(function (err) {
    //            if (err) {
    //                debug('file %s fail: %s', processFile, err);
    //                return reject(err);
    //            }
    //
    //            debug('file %s ok: %s', processFile, target);
    //            resolve({
    //                decompressFile: processFile,
    //                decompressDir: target,
    //                extra: extra
    //            });
    //        });
    // });

    var extName = helper.getFileExtName(processFile).toLowerCase();
    var extractor;
    switch (extName) {
        case 'gz':
        case 'tgz':
            extractor = exports.tar;
            break;
        case 'zip':
            extractor = exports.zip;
            break;
    }

    if (!extractor) {
        extractor = exports.tar;
        // return Promise.reject('unknown compress file type: ' + processFile);
    }

    return new Promise(function (resolve, reject) {
        extractor(processFile, target, function (err) {
            if (err) {
                debug('file %s fail: %s', processFile, err);
                return reject(err);
            }

            if (helper.isEmptyDirSync(target)) {
                debug('decompress file %s fail, maybe the file is not complete: %s',
                    processFile);
                return reject({
                    file: processFile,
                    target: target,
                    toString: function () {
                        return 'decompress file fail: ' + processFile;
                    }
                });
            }

            debug('file %s ok: %s', processFile, target);
            resolve({
                decompressFile: processFile,
                decompressDir: target,
                extra: extra
            });
        });
    });
}

module.exports = exports = decompress;

/**
 * 解压 zip 文件到目标目录
 *
 * @param {string} processFile 要解压的文件
 * @param {string} target 要解压到的目标目录
 * @param {Function} cb 解压完成的回调
 */
exports.zip = function (processFile, target, cb) {
    try {
        var AdmZip = require('adm-zip');
        var zipFile = new AdmZip(processFile);
        debug('extract zip file %s to %s', processFile, target);
        zipFile.extractAllTo(target, true);
        cb(null, target);
    }
    catch (ex) {
        cb(ex, target);
    }
};

/**
 * 解压 tar 包到目标目录
 *
 * @param {string} processFile 要解压的文件
 * @param {string} target 要解压到的目标目录
 * @param {Function} cb 解压完成的回调
 */
exports.tar = function (processFile, target, cb) {
    var zlib = require('zlib');
    var fs = require('fs');
    var extractTar = require('tar').Extract;
    fs.createReadStream(processFile)
        .pipe(zlib.createGunzip())
        .pipe(extractTar({path: target}))
        .on('error', function (err) {
            cb(err, target);
        })
        .on('end', function () {
            cb(null, target);
        });
};
