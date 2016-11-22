/**
 * @file 缓存信息的管理
 * @author sparklewhy@gmail.com
 */

var path = require('path');
var semver = require('./semver');
var config = require('../config');
var helper = require('../helper');

var versionInfoCache = {};
var reposCacheData = null;
var debug = require('debug')('repos-cache');

function getVersionCacheKey(repos, type) {
    if (type) {
        type = '_' + type;
    }
    else {
        type = '';
    }

    return repos.type + '_' + repos.pkgName + type;
}

function getReposCacheKey(uri) {
    return helper.md5(uri).substr(0, 8);
}

function getCacheTargetKey(isComponent) {
    return isComponent ? 'components' : 'scaffold';
}

function findCacheItemByVersion(versionList, version) {
    var existIndex = -1;
    versionList.some(function (item, index) {
        if (item.version === version) {
            existIndex = index;
            return true;
        }
        return false;
    });
    return existIndex;
}

/**
 * 获取 repository 下载的 URI，用于缓存的 key
 *
 * @param {Repository} repos 仓库实例
 * @return {string}
 */
exports.getDownloadURI = function (repos) {
    if (!repos.needResolve()) {
        return repos.getResolvedUrl();
    }

    var reposPath = repos.getInstallSource().path || repos.pkgName || '';
    return repos.type + ':' + reposPath;
};

/**
 * 保存 repository 缓存信息
 */
exports.saveReposCacheInfo = function () {
    if (!reposCacheData) {
        return;
    }

    var cacheMetaFile = exports.getReposCacheManifestFile();

    var mkdirp = require('mkdirp');
    mkdirp.sync(path.dirname(cacheMetaFile));

    debug('save repos cache file: ', cacheMetaFile);
    // debug('save repos cache content:', JSON.stringify(reposCacheData));

    // 持久化
    var fs = require('fs');
    fs.writeFileSync(
        cacheMetaFile, JSON.stringify(reposCacheData, null, 2), 'UTF-8'
    );
};

/**
 * 缓存 Repository 信息
 *
 * @param {Object} info 要缓存信息
 * @param {boolean=} persistence 是否立刻持久化，默认 false，可选
 */
exports.cacheReposInfo = function (info, persistence) {
    var cacheMetaData = exports.getReposCacheDetail();
    var target = getCacheTargetKey(info.component);
    var version = semver.normalizeVersion(info.version || '');
    var cacheKey = getReposCacheKey(info.uri);

    var cacheData = cacheMetaData[target] || {};
    cacheMetaData[target] = cacheData;

    if (!cacheData[cacheKey]) {
        cacheData[cacheKey] = [];
    }

    var versionList = cacheData[cacheKey];
    var existIndex = findCacheItemByVersion(versionList, version);
    if (existIndex !== -1) {
        versionList.splice(existIndex, 1);
    }
    versionList.push({
        name: info.name,
        uri: info.uri,
        resolved: info.resolved,
        version: info.version,
        file: info.file
    });

    if (persistence) {
        exports.saveReposCacheInfo();
    }
};

/**
 * 获取 repository 下载缓存的目录
 *
 * @param {boolean=} isComponent 是否是组件缓存目录，可选，若未传，返回缓存根目录
 * @param {string=} dirName 缓存的目录名，可选
 * @return {string}
 */
exports.getReposCacheDir = function (isComponent, dirName) {
    if (isComponent === undefined) {
        return config.cacheDir;
    }

    return path.join(config.cacheDir, getCacheTargetKey(isComponent), dirName || '');
};

/**
 * 获取 repository 下载缓存的清单文件
 *
 * @return {string}
 */
exports.getReposCacheManifestFile = function () {
    return path.join(exports.getReposCacheDir(), 'cache.json');
};

/**
 * 获取 repository 缓存详情
 *
 * @param {boolean=} isComponent 是否是获取组件的缓存还是脚手架缓存，可选，默认返回全部
 * @param {string=} uri 仓库 uri，可选，默认返回所有的详情
 * @param {string|boolean=} version 要查找的缓存的版本，可选，如果传 true，则返回最新的版本
 * @return {?Object}
 */
exports.getReposCacheDetail = function (isComponent, uri, version) {
    try {
        if (!reposCacheData) {
            var cacheMetaFile = exports.getReposCacheManifestFile();
            reposCacheData = require(cacheMetaFile);
        }
    }
    catch (ex) {
        // do nothing
    }

    if (!reposCacheData) {
        reposCacheData = {};
    }

    if (isComponent === undefined) {
        return reposCacheData;
    }

    debug('isComponent: %s, uri: %s, version: %s', isComponent, uri, version);
    var target = getCacheTargetKey(isComponent);
    var cacheData = reposCacheData[target] || {};
    if (uri) {
        var versionList = cacheData[getReposCacheKey(uri)] || [];
        if (version === true) {
            var result = semver.sortVersions(versionList, 'version', true);
            return result[0];
        }

        if (version != null) {
            var found = findCacheItemByVersion(versionList, version);
            return found === -1 ? null : versionList[found];
        }

        return versionList;
    }

    return cacheData;
};

/**
 * 获取缓存的 Repository 信息
 *
 * @param {Repository} repos 仓库实例
 * @param {boolean=} latest 是否返回最新的版本，可选，默认 false
 * @return {boolean|Object}
 */
exports.getCacheReposInfo = function (repos, latest) {
    var downloadUri = exports.getDownloadURI(repos);
    var version = latest
        ? true
        : (semver.normalizeVersion(repos.pkgVersion) || null);

    debug('get cache repos: %s, %s', downloadUri, version);
    if (repos.needResolve() && !version) {
        return;
    }
    else if (!version) {
        version = '';
    }

    return exports.getReposCacheDetail(repos.component, downloadUri, version);
};

/**
 * 移除 Repository 缓存
 *
 * @param {Repository} repos 仓库实例
 * @param {boolean=} persistence 是否立刻持久化，默认 false，可选
 */
exports.removeReposInfoCache = function (repos, persistence) {
    var downloadUri = exports.getDownloadURI(repos);
    var versionList = exports.getReposCacheDetail(repos.component, downloadUri);
    if (!versionList.length) {
        return;
    }

    var version = repos.pkgVersion || '';
    var found = findCacheItemByVersion(versionList, version);
    if (found !== -1) {
        versionList.splice(found, 1);
    }

    if (persistence) {
        exports.saveReposCacheInfo();
    }
};

/**
 * 清空 repository 缓存信息
 *
 * @param {Object} options 清空选项
 * @param {boolean=} options.all 是否全部清空，可选，默认 false
 * @param {boolean=} options.component 是否清空 component，可选，默认 false
 * @param {boolean=} options.scaffold 是否清空脚手架缓存，可选，默认 false
 * @param {string=} options.uri 要清空的组件 uri，可选
 */
exports.clearReposCache = function (options) {
    var removeVersions = [];
    if (options.all) {
        // 清空缓存的清单文件
        reposCacheData = {};
    }
    else {
        var cacheData = exports.getReposCacheDetail();
        var target;
        if (options.component) {
            target = getCacheTargetKey(true);
            delete cacheData[target];
        }

        if (options.scaffold) {
            target = getCacheTargetKey(false);
            delete cacheData[target];
        }

        var uri = options.uri;
        if (uri) {
            cacheData = exports.getReposCacheDetail(true);
            var cacheKey = getReposCacheKey(uri);
            removeVersions = cacheData[cacheKey] || [];
            delete cacheData[cacheKey];

            cacheData = exports.getReposCacheDetail(false);
            cacheKey = getReposCacheKey(uri);
            removeVersions = removeVersions.concat(cacheData[cacheKey] || []);
            delete cacheData[cacheKey];
        }
    }

    exports.saveReposCacheInfo();

    // 删除下载的所有文件
    if (options.all) {
        helper.rmDirSync(exports.getReposCacheDir());
    }
    else {
        if (options.component) {
            helper.rmDirSync(exports.getReposCacheDir(true));
        }

        if (options.scaffold) {
            helper.rmDirSync(exports.getReposCacheDir(false));
        }

        removeVersions.forEach(function (item) {
            // 删除文件
            helper.rmFile(item.file);
        });
    }
};

/**
 * 缓存包的可用版本信息
 *
 * @param {Repository} repos 仓库实例
 * @param {Object} data 要缓存的数据
 * @param {string=} type 要缓存的特定类型缓存的版本信息
 */
exports.cacheVersionInfo = function (repos, data, type) {
    versionInfoCache[getVersionCacheKey(repos, type)] = data;
};

/**
 * 获取可用的版本信息
 *
 * @param {Repository} repos 仓库实例
 * @param {string=} type 获取的特定类型缓存的版本信息
 * @return {?Object}
 */
exports.getCacheVersionInfo = function (repos, type) {
    return versionInfoCache[getVersionCacheKey(repos, type)];
};
