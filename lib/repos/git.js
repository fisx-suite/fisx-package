/**
 * @file git 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var Promise = require('bluebird');
var Repos = require('./repository');
var semver = require('./semver');
var cache = require('./cache');

/**
 * 创建 git 仓库实例
 *
 * @constructor
 * @extends Repository
 * @param {string} type git 类型
 * @param {Object} options 创建选项
 * @param {string} options.source git 安装源
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function GitRepos(type, options) {
    Repos.call(this, type, options);
}

util.inherits(GitRepos, Repos);

/**
 * 获取仓库前缀
 *
 * @override
 * @return {string}
 */
GitRepos.prototype.getReposPrefix = function () {
    return this.type + ':' + this.owner + '/';
};

/**
 * 获取仓库下载的依赖使用的 endpoint
 *
 * @override
 * @return {{type: string, value: string}}
 */
GitRepos.prototype.getDepEndPoint = function () {
    return {
        type: this.type,
        value: this.owner
    };
};

/**
 * 获取所有可用的版本
 *
 * @inner
 * @param {Repository} repos 仓库实例
 * @param {string} url 请求 url
 * @return {Promise}
 */
function fetchAvailableVersions(repos, url) {
    return repos.fetch.json(url, {headers: repos.reqHeaders}).then(function (data) {
        return data.map(function (item) {
            var version = item.name;
            return {
                version: version,
                // shasum: item.commit.sha,
                url: repos.getDownloadUrl(version)
            };
        });
    });
}

/**
 * 获取所有可用 tags
 *
 * @return {Promise}
 */
GitRepos.prototype.fetchAvailableTags = function () {
    return fetchAvailableVersions(this, this.allTagsUrl).then(
        function (data) {
            data = data.map(function (item) {
                item.version = semver.normalizeVersion(item.version);
                return item;
            });

            return semver.sortVersions(data, true);
        }
    );
};

/**
 * 获取所有可用分支
 *
 * @return {Promise}
 */
GitRepos.prototype.fetchAvailableBranch = function () {
    return fetchAvailableVersions(this, this.allBranchUrl).then(
        function (data) {
            data = data.map(function (item) {
                item.tag = item.version;
                return item;
            });
            var masterBranch = 'master';
            return data.sort(function (a, b) {
                a = a.version;
                b = b.version;
                if (a === masterBranch) {
                    return -1;
                }
                if (b === masterBranch) {
                    return 1;
                }
                return b.localeCompare(a);
            });
        }
    );

};

/**
 * 获取要下载包的可用版本信息
 *
 * @override
 * @param {string=} fetchVersion 期待获取的版本
 * @return {Promise}
 */
GitRepos.prototype.fetchAvailableVersion = function (fetchVersion) {
    var me = this;
    fetchVersion || (fetchVersion = me.pkgVersion);

    var versionInfo = cache.getCacheVersionInfo(me);
    if (versionInfo) {
        return Promise.try(function () {
            return versionInfo;
        });
    }

    var allVersions;
    var result;
    return me.fetchAvailableTags().then(function (data) {
        me.debug(data);
        result = me.getFetchVersion(fetchVersion, data, []);
        if (result && !result.err) {
            return result;
        }

        allVersions = data;
        return me.fetchAvailableBranch();
    }).then(function (data) {
        if (result && !result.err) {
            return result;
        }

        me.debug(data);
        return me.getFetchVersion(fetchVersion, allVersions, data);
    }).then(function (result) {
        if (result.err) {
            throw result.err;
        }

        cache.cacheVersionInfo(me, result.data);
        return result.data;
    });
};

/**
 * 获取包的更新信息
 *
 * @override
 * @return {Promise}
 */
GitRepos.prototype.fetchUpdateData = function (currVersion) {
    var me = this;
    var fetchVersion = me.pkgVersion;
    return me.fetchAvailableTags().then(
        function (data) {
            me.debug('expect %s version %s to install, current install version: %s',
                me.pkgName, fetchVersion, currVersion);

            // 初始化最新可用版本
            var latestVersion = data[0];
            latestVersion && (latestVersion = latestVersion.version);

            // 初始化兼容版本
            var candidates = data.map(function (item) {
                return item.version;
            });
            var compatVersion = semver.maxSatisfying(
                candidates, fetchVersion
            );

            return {
                latestVersion:
                    latestVersion && (latestVersion !== currVersion) ? latestVersion : null,
                compatVersion:
                    compatVersion && (compatVersion !== currVersion) ? compatVersion : null
            };
        }
    );
};

module.exports = exports = GitRepos;
