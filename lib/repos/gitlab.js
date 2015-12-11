/**
 * @file gitlab 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var GitRepos = require('./git');
var config = require('../config');

/**
 * 创建 gitlab 仓库实例
 *
 * @constructor
 * @extends GitRepos
 * @param {Object} options 创建选项
 * @param {string} options.source gitlab 安装源
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 * @param {string=} options.token 请求 token
 * @param {string=} options.reposDomain gitlab domain
 *        属性名 `domain` 跟 EventEmitter 有冲突，因此这里换下
 */
function GitlabRepos(options) {
    GitRepos.call(this, config.reposType.GITLAB, options);

    var source = options.source;
    if (!source) {
        source = config.defaultGitlabOwner;
    }
    this.owner = source || this.pkgName;
    this.extName = 'tar.gz';

    this.token = options.token || config.defaultGitlabToken;
    var domain = options.domain || config.defaultGitlabDomain;
    if (domain.charAt(domain.length - 1) !== '/') {
        domain += '/';
    }
    this.reposDomain = domain;

    this.reqHeaders = {
        'PRIVATE-TOKEN': this.token
    };
    this.pkgId = this.owner + '/' + this.pkgName;

    var metaDataUrlPrefix = domain + 'api/v3/projects/'
        + encodeURIComponent(this.pkgId) + '/repository/';

    // GET /projects/:id/repository/tags
    this.allTagsUrl = metaDataUrlPrefix + 'tags';

    // GET /projects/:id/repository/branches
    this.allBranchUrl = metaDataUrlPrefix + '/branches';
}

util.inherits(GitlabRepos, GitRepos);

/**
 * 获取压缩包的下载链接
 *
 * @param {string} version 下载的版本
 * @return {string}
 */
GitlabRepos.prototype.getDownloadUrl = function (version) {
    // GET /projects/:id/repository/archive
    // http://xx.gitlab.com/xx/xx/repository/archive.tar.gz?ref=xx
    // XXX: 本来可以不加 private_token 这个参数，直接通过 header 发送，
    // 但发现有些情况下还是 401。。。
    return this.reposDomain + this.owner + '/' + this.pkgName
        + '/repository/archive.tar.gz?ref=' + version
        + '&private_token=' + this.token;
};

module.exports = exports = GitlabRepos;
