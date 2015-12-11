/**
 * @file github 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var Repos = require('./repository');
var semver = require('./semver');
var config = require('../config');
var helper = require('../helper');

/**
 * 创建 github 仓库实例
 *
 * @constructor
 * @extends Repository
 * @param {Object} options 创建选项
 * @param {string} options.source github 安装源
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function GithubRepos(options) {
    Repos.call(this, config.reposType.GITHUB, options);

    var source = options.source;
    if (!source) {
        source = config.defaultGitHubOwner;
    }
    this.owner = source || this.pkgName;
    this.extName = 'zip';

    var client = this.clientOAuth
        = 'client_id=afcf7c0f81ffecf6d894&client_secret=1bc98981703eaae3175ce7ab2d58f42b687da241';
    var metaDataUrlPrefix = 'https://api.github.com/repos/' + this.owner + '/' + this.pkgName;
    // /repos/:owner/:repo/tags
    this.allTagsUrl = metaDataUrlPrefix + '/tags?' + client;
    // /repos/:owner/:repo/branches
    this.allBranchUrl = metaDataUrlPrefix + '/branches?' + client;
}

util.inherits(GithubRepos, require('./repository'));

/**
 * 获取压缩包的下载链接
 *
 * @param {string} version 下载的版本
 * @param {string=} type 下载的文件类型，可选，支持 `zip`、`tar`，默认 `zip`
 * @return {string}
 */
GithubRepos.prototype.getDownloadUrl = function (version, type) {
    // GET /repos/:owner/:repo/:archive_format/:ref 重定向到如下形式链接
    // https://codeload.github.com/wuhy/edp-build-versioning/legacy.tar.gz/master
    // https://codeload.github.com/wuhy/edp-build-versioning/legacy.zip/master
    var archiveLink = 'https://codeload.github.com/' + this.owner + '/' + this.pkgName + '/';
    var typeMap = {
        tar: 'legacy.tar.gz',
        zip: 'legacy.zip'
    };
    type || (type = this.extName);
    return archiveLink + typeMap[type] + '/' + version + '?' + this.clientOAuth;
};

/**
 * 获取仓库前缀
 *
 * @override
 * @return {string}
 */
GithubRepos.prototype.getReposPrefix = function () {
    return this.type + ':' + this.owner + '/';
};

/**
 * 获取仓库下载的依赖使用的 endpoint
 *
 * @override
 * @return {{type: string, value: string}}
 */
GithubRepos.prototype.getDepEndPoint = function () {
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
    return repos.fetch.json(url).then(function (data) {
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
GithubRepos.prototype.fetchAvailableTags = function () {
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
GithubRepos.prototype.fetchAvailableBranch = function () {
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
 * @return {Promise}
 */
GithubRepos.prototype.fetchAvailableVersion = function () {
    var me = this;
    var fetchVersion = me.pkgVersion;
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

        return result.data;
    });
};

/**
 * 获取要包的更新信息
 *
 * @override
 * @return {Promise}
 */
GithubRepos.prototype.fetchUpdateData = function (currVersion) {
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

function getQuery(key, condition) {
    var result = [];
    Object.keys(condition).forEach(function (key) {
        var value = condition[key];
        value && result.push(key + ':' + value);
    });
    result.unshift(encodeURIComponent(key));
    return result.join('+');
}

function getSearchStr(condition) {
    var queryArr = [];
    Object.keys(condition).forEach(function (key) {
        var value = condition[key];
        if (value) {
            queryArr.push(key + '=' + value);
        }
    });
    return queryArr.join('&');
}

/**
 * 搜索满足给定关键词的组件包，返回的包的数据结构：
 * {
 *    name: string, // 包名
 *    description: string, // 包描述
 *    versions: Array.<string> // 所有可用的版本
 *    time: string // 最后修改时间
 * }
 * Refer:
 * https://developer.github.com/v3/search/
 *
 * @param {string} key 搜索词
 * @param {Object=} option 搜索选项
 * @param {string=} option.sort 指定要排序的维度，可选，有效值：`stars`、`forks`、`updated`
 * @param {string=} option.order 排序方式，有效值 `asc`、`desc`，可选，默认 `desc`
 * @param {string=} option.in 搜索词要匹配的地方，默认仓库名称 `name` ，有效值：
 *        `name`, `description`, `readme`, 或者这几种结合：`name,description`
 * @param {string=} option.owner 限定搜索的 owner（user）
 * @param {string=} option.stars 限定要满足 star 数量的条件，比如 10..20, >=500
 * @param {string=} option.language 限定要满足的实现语言，默认 `javascript`
 * @return {Promise}
 */
GithubRepos.prototype.search = function (key, option) {
    option || (option = {});
    var queryStr = getSearchStr({
        q: getQuery(key, {
            'user': option.owner,
            'in': option.in || 'name',
            'language': option.language || 'javascript',
            'stars': option.stars
        }),
        sort: option.sort,
        order: option.order
    });

    var me = this;
    var searchUrl = 'https://api.github.com/search/repositories?' + queryStr
        + '&' + this.clientOAuth;
    return me.fetch.json(searchUrl, {
        promise: true
    }).then(function (data) {
        if (data.errors) {
            throw new Error(data.message + ': ' + JSON.stringify(data.errors));
        }

        return {
            github: true,
            count: data.total_count,
            list: data.items.map(function (item) {
                return {
                    name: item.name,
                    fullName: item.full_name,
                    description: item.description,
                    url: item.html_url,
                    time: helper.formatDate(new Date(item.updated_at)),
                    forks: item.forks_count,
                    stars: item.stargazers_count
                };
            })
        };
    });
};

module.exports = exports = GithubRepos;
