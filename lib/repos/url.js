/**
 * @file 指定 url 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var path = require('path');
var urlUtil = require('url');
var config = require('../config');
var Repos = require('./repository');

/**
 * 创建 url 仓库实例
 *
 * @constructor
 * @extends Repository
 * @param {Object} options 创建选项
 * @param {string} options.source 文件 url
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function URLRepos(options) {
    Repos.call(this, config.reposType.URL, options);

    this.url = options.source;
    this.pkgName = path.basename(urlUtil.parse(this.url).pathname || '');
}

util.inherits(URLRepos, Repos);

/**
 * 是否需要 resolve 要下载包的信息，确定下载路径
 *
 * @override
 * @return {boolean}
 */
URLRepos.prototype.needResolve = function () {
    return false;
};

/**
 * 获取仓库安装源
 *
 * @override
 * @return {Object}
 */
URLRepos.prototype.getInstallSource = function () {
    return {
        type: this.type,
        path: this.url
    };
};

/**
 * 获取仓库下载的依赖使用的 endpoint
 *
 * @override
 * @return {void}
 */
URLRepos.prototype.getDepEndPoint = function () {
    return;
};

module.exports = exports = URLRepos;
