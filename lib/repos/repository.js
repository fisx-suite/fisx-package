/**
 * @file 组件包安装仓库
 * @author spakrlewhy@gmail.com
 */

var util = require('util');
var Promise = require('bluebird');
var path = require('path');
var EventEmitter = require('events');
var debug = require('debug');

var semver = require('./semver');
var download = require('./download');
var decompress = require('./decompress');
var config = require('../config');
var helper = require('../helper');
var cache = require('./cache');

/**
 * 创建仓库实例
 *
 * @constructor
 * @extends EventEmitter
 * @param {string} type 仓库类型
 * @param {Object} options 创建选项
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 * @param {string=} options.resolvedUrl 解析的下载 url
 * @param {boolean=} options.useCache 是否强制使用缓存，默认 true
 */
function Repository(type, options) {
    EventEmitter.call(this);

    this.type = type;
    this.pkgName = options.name;
    this.pkgVersion = options.version;
    this.resolvedUrl = options.resolvedUrl;
    this.useCache = options.useCache === undefined ? true : options.useCache;
    this.debug = debug(type + '-repos');
}

util.inherits(Repository, EventEmitter);

/**
 * 获取仓库安装源
 *
 * @return {Object}
 */
Repository.prototype.getInstallSource = function () {
    return {
        type: this.type
    };
};

/**
 * 获取仓库下载的依赖使用的 endpoint
 *
 * @return {?{type: string, value: ?string}}
 */
Repository.prototype.getDepEndPoint = function () {
    return {
        type: this.type
    };
};

/**
 * 获取下载的缓存目录
 *
 * @return {string}
 */
Repository.prototype.getDownloadCacheDir = function () {
    return path.join(config.cacheDir, this.type);
};

/**
 * 获取下载的文件的扩展名
 *
 * @param {string} url 下载的 url
 * @return {string}
 */
Repository.prototype.getDownloadFileExtName = function (url) {
    return this.extName || helper.getFileExtName(url);
};

/**
 * 获取解压的临时目录
 *
 * @param {string} decompressFile 要解压的文件
 * @return {string}
 */
Repository.prototype.getDecompressTempDir = function (decompressFile) {
    return path.resolve(decompressFile, '..', '' + Date.now());
};

/**
 * 获取解析后源的 url
 *
 * @return {?string}
 */
Repository.prototype.getResolvedUrl = function () {
    return this.resolvedUrl || this.url;
};

/**
 * 下载包
 *
 * @param {Object} option 下载选项
 * @param {string=} option.name 包的名称
 * @param {string=} option.version 包的版本
 * @param {string} option.url 下载文件 url
 * @param {string=} option.shasum 下载文件摘要
 * @param {Object=} option.headers 下载请求头
 * @return {Promise}
 */
Repository.prototype.download = function (option) {
    option || (option = {});

    var me = this;
    var url = option.url || this.resolvedUrl || this.url;

    // 保存当前下载的包的 url
    this.resolvedUrl = url;

    if (!url) {
        return Promise.reject('unknown download url');
    }

    me.debug('begin download package %s...', url);

    var useCache = option.useCache;
    if (useCache === undefined) {
        useCache = this.useCache;
    }

    return download(url, {
        target: me.getDownloadCacheDir(),
        extName: me.getDownloadFileExtName(url),
        shasum: option.shasum,
        useCache: !!useCache,
        proxyTarget: me,
        promise: true,
        headers: option.headers || this.reqHeaders
    }).then(function (data) {
        var tempDir = me.getDecompressTempDir(data.tempFile);
        return decompress(data.tempFile, tempDir, data);
    }).then(function (result) {
        var data = result.extra;
        return {
            cache: data.cache,
            name: option.name,
            version: option.version,
            dir: result.decompressDir,
            resolvedUrl: url
        };
    });
};

/**
 * 获取要下载包的可用版本信息
 *
 * @return {Promise}
 */
Repository.prototype.fetchAvailableVersion = function () {
    var metaDataUrl = this.metaDataUrl;
    this.debug('fetch meta data: %s...', metaDataUrl);
    if (!metaDataUrl) {
        return Promise.reject('unknown meta data');
    }

    var me = this;
    var versionInfo = cache.getCacheVersionInfo(me);
    if (versionInfo) {
        return Promise.resolve(versionInfo);
    }

    return this.fetch.json(metaDataUrl).then(function (result) {
        cache.cacheVersionInfo(me, result);
        return result;
    });
};

/**
 * 获取所有可用版本
 *
 * @return {Promise}
 */
Repository.prototype.fetchAllVersions = function () {
    return Promise.reject('not support');
};

/**
 * 获取要下载包的特定版本的元数据信息
 *
 * @param {Object} option 选项
 * @param {string} option.version 获取特定版本的 metadata 信息
 * @return {Promise}
 */
Repository.prototype.fetchVersionMetaData = function (option) {
    return Promise.resolve(option);
};

/**
 * 获取要包的更新信息
 *
 * @param {string} currVersion 当前版本
 * @return {Promise}
 */
Repository.prototype.fetchUpdateData = function (currVersion) {
    return Promise.reject(new Error('update is not avaliable'));
};

/**
 * 获取要下载的版本
 *
 * @param {string} fetchVersion 期望下载的版本
 * @param {Array} allVersions 所有可用版本
 * @param {Array} allTags 所有可用的 tag
 * @return {Object}
 */
Repository.prototype.getFetchVersion = function (fetchVersion, allVersions, allTags) {
    var versionMap = {};
    allVersions.forEach(function (item) {
        versionMap[item.version] = item;
    });

    var tagMap = {};
    allTags.forEach(function (branch) {
        tagMap[branch.tag] = branch;
    });

    if (versionMap[fetchVersion]) {
        return {data: versionMap[fetchVersion]};
    }
    if (tagMap[fetchVersion]) {
        return {data: tagMap[fetchVersion]};
    }

    var validVersion;
    var candidates = Object.keys(versionMap);
    if (fetchVersion) {
        this.debug('fetch %s from %s', fetchVersion, JSON.stringify(candidates));
        validVersion = semver.maxSatisfyVersion(candidates, fetchVersion);
        validVersion && (validVersion = versionMap[validVersion]);
    }
    else {
        validVersion = allVersions[0];
        validVersion || (validVersion = allTags[0]);
    }

    if (!validVersion) {
        var pkgInfo = this.pkgName;
        fetchVersion && (pkgInfo += '@' + fetchVersion);
        var reasonStr = 'No matched version for ' + pkgInfo
            + ', candidates = ' + (candidates.join(', ') || 'n/a')
            + ', tags = ' + (Object.keys(tagMap).join(', ') || 'n/a');

        return {
            err: {
                hasNoMatchVersion: true,
                reason: reasonStr,
                toString: function () {
                    return reasonStr;
                }
            }
        };
    }

    return {data: validVersion};
};

/**
 * 拉取数据
 *
 * @return {Object}
 */
Repository.prototype.fetch = download;

module.exports = exports = Repository;
