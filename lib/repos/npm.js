/**
 * @file npm 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var Promise = require('bluebird');
var config = require('../config');
var Repos = require('./repository');
var semver = require('./semver');
var helper = require('../helper');

/**
 * 创建 npm 仓库实例
 *
 * @constructor
 * @extends Repository
 * @param {Object} options 创建选项
 * @param {string} options.source npm 安装源
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function NPMRepos(options) {
    Repos.call(this, config.reposType.NPM, options);

    this.registry = options.source || config.defaultNPMRegistry;
    var pkgName = this.pkgName;
    pkgName && (this.metaDataUrl = this.registry + '/' + pkgName);
}

util.inherits(NPMRepos, Repos);

/**
 * 获取所有可用 版本 和 tag 信息
 *
 * @inner
 * @param {Object} data 版本号信息
 * @return {{allVersions: Array, allTags: Array}}
 */
function getAvailableVersionInfo(data) {
    var versionMap = data.versions || {};
    var availableVersions = Object.keys(versionMap).map(function (version) {
        return {
            version: version
        };
    });

    var tagVersions = data['dist-tags'] || {};
    var availableTags = Object.keys(tagVersions).map(function (tag) {
        return {
            tag: tag,
            version: tagVersions[tag]
        };
    });

    semver.sortVersions(availableVersions, true);
    semver.sortVersions(availableTags, true);

    return {
        allVersions: availableVersions,
        allTags: availableTags,
        versionMap: versionMap,
        tagMap: tagVersions
    };
}

/**
 * 获取要下载包的特定版本的元数据信息
 *
 * @override
 * @param {Object} option 选项
 * @param {string} option.version 获取特定版本的 metadata 信息
 * @return {Promise}
 */
NPMRepos.prototype.fetchVersionMetaData = function (option) {
    var me = this;
    var version = option.version;
    me.debug('fetch %s@%s meta data...', me.pkgName, version);
    return me.fetch.json([me.registry, me.pkgName, version].join('/')).then(
        function (data) {
            return {
                name: data.name,
                version: data.version,
                url: data.dist.tarball,
                shasum: data.dist.shasum
            };
        }
    );
};

/**
 * 获取要下载包的可用版本信息
 *
 * @override
 * @return {Promise}
 */
NPMRepos.prototype.fetchAvailableVersion = function () {
    var me = this;
    var fetchVersion = me.pkgVersion;
    return Repos.prototype.fetchAvailableVersion.apply(me, arguments).then(
        function (data) {
            me.debug('fetch the version %s to download...', fetchVersion);

            var avaliableInfo = getAvailableVersionInfo(data);
            var result = me.getFetchVersion(
                fetchVersion, avaliableInfo.allVersions, avaliableInfo.allTags
            );
            if (result.err) {
                return Promise.reject(result.err);
            }
            me.debug(JSON.stringify(result));
            return result.data;
        }
    );
};

/**
 * 获取要包的更新信息
 *
 * @override
 * @return {Promise}
 */
NPMRepos.prototype.fetchUpdateData = function (currVersion) {
    var me = this;
    var fetchVersion = me.pkgVersion;
    return Repos.prototype.fetchAvailableVersion.apply(me, arguments).then(
        function (data) {
            me.debug('expect %s version %s to install, current install version: %s',
                me.pkgName, fetchVersion, currVersion);

            var availableInfo = getAvailableVersionInfo(data);
            var allVersions = availableInfo.allVersions;
            var allTags = availableInfo.allTags;

            // 初始化最新可用版本
            var latestVersion = allVersions[0];
            if (!latestVersion) {
                latestVersion = allTags[0];
            }
            latestVersion && (latestVersion = latestVersion.version);

            // 初始化兼容版本
            var compatVersion;
            var tagVersion = availableInfo.tagMap[fetchVersion];
            if (tagVersion) {
                compatVersion = tagVersion;
            }
            else {
                compatVersion = semver.maxSatisfyVersion(
                    Object.keys(availableInfo.versionMap), fetchVersion
                );
            }

            return {
                latestVersion:
                    latestVersion && (latestVersion !== currVersion) ? latestVersion : null,
                compatVersion:
                    compatVersion && (compatVersion !== currVersion) ? compatVersion : null
            };
        }
    );
};

/**
 * 转成包数组集合
 *
 * @inner
 * @param {Object} data 数据对象
 * @return {Array.<Object>}
 */
function flatten(data) {
    var items = [];
    Object.keys(data).forEach(function (key) {
        if (key !== '_updated') {
            items.push(data[key]);
        }
    });

    return items;
}

/**
 * 过滤符合搜索条件的包
 *
 * @inner
 * @param {Array.<Object>} items 所有的包集合
 * @param {string} keyword 要搜索的关键词
 * @return {Array.<Object>}
 */
function filter(items, keyword) {
    if (!keyword) {
        return items;
    }

    var searchLen = keyword.length;
    return items.filter(function (item) {
        var name = item.name;
        var foundIdx = name.indexOf(keyword);
        if (foundIdx !== -1) {
            item.matchPos = foundIdx;
            item.matchScore = parseInt(searchLen / name.length * 100, 10);
            return true;
        }
    }).sort(function (a, b) {
        if (!a.time) {
            return 1;
        }
        if (!b.time) {
            return -1;
        }
        var am = new Date(a.time.modified);
        var bm = new Date(b.time.modified);

        return bm.getTime() - am.getTime();
    }).sort(function (a, b) {
        if (a.matchScore === 100) {
            return -1;
        }
        if (b.matchScore === 100) {
            return 1;
        }
        return a.matchPos - b.matchPos;
    });
}

/**
 * 搜索满足给定关键词的组件包，返回的包的数据结构：
 * {
 *    name: string, // 包名
 *    description: string, // 包描述
 *    versions: Array.<string> // 所有可用的版本
 *    time: string // 最后修改时间
 * }
 *
 * @param {string} key 搜索词
 * @param {Object=} option 搜索选项
 * @param {boolean=} option.useCache 是否使用上次搜索结果的缓存，默认 false
 * @return {Promise}
 */
NPMRepos.prototype.search = function (key, option) {
    var allUrl = this.registry + '/-/all';
    var me = this;
    return me.fetch.json(allUrl, {
        target: me.getDownloadCacheDir(),
        extName: 'json',
        useCache: option.useCache,
        promise: true
    }).then(function (data) {
        var result = filter(flatten(data), key).map(function (item) {
            item.time = helper.formatDate(new Date(item.time.modified));
            item.versions = Object.keys(item.versions);
            item.versions.sort(semver.rcompare);

            var repos = item.repository;
            item.url = repos && repos.url;
            return item;
        });
        return {
            count: result.length,
            list: result
        };
    });
};

module.exports = exports = NPMRepos;

