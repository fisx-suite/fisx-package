/**
 * @file 缓存信息的管理
 * @author sparklewhy@gmail.com
 */

var versionInfoCache = {};

function getCacheKey(repos, type) {
    if (type) {
        type = '_' + type;
    }
    else {
        type = '';
    }

    return repos.type + '_' + repos.pkgName + type;
}

/**
 * 缓存包的可用版本信息
 *
 * @param {Repository} repos 仓库实例
 * @param {Object} data 要缓存的数据
 * @param {string=} type 要缓存的特定类型缓存的版本信息
 */
exports.cacheVersionInfo = function (repos, data, type) {
    versionInfoCache[getCacheKey(repos, type)] = data;
};

/**
 * 获取可用的版本信息
 *
 * @param {Repository} repos 仓库实例
 * @param {string=} type 获取的特定类型缓存的版本信息
 * @return {?Object}
 */
exports.getCacheVersionInfo = function (repos, type) {
    return versionInfoCache[getCacheKey(repos, type)];
};
