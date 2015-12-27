/**
 * @file 缓存信息的管理
 * @author sparklewhy@gmail.com
 */

var versionInfoCache = {};

function getCacheKey(repos) {
    return repos.type + '_' + repos.pkgName;
}

/**
 * 缓存包的可用版本信息
 *
 * @param {Repository} repos 仓库实例
 * @param {Object} data 要缓存的数据
 */
exports.cacheVersionInfo = function (repos, data) {
    versionInfoCache[getCacheKey(repos)] = data;
};

/**
 * 获取可用的版本信息
 *
 * @param {Repository} repos 仓库实例
 * @return {?Object}
 */
exports.getCacheVersionInfo = function (repos) {
    return versionInfoCache[getCacheKey(repos)];
};
