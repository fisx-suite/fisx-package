/**
 * @file edp 仓库
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var config = require('../config');
var Repos = require('./repository');
var NPMRepos = require('./npm');

/**
 * 创建 edp 仓库实例
 *
 * @constructor
 * @extends NPMRepos
 * @param {Object} options 创建选项
 * @param {string} options.source edp 安装源
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function EDPRepos(options) {
    Repos.call(this, config.reposType.EDP, options);

    this.registry = options.source || config.defaultEDPRegistry;
    var pkgName = this.pkgName;
    pkgName && (this.metaDataUrl = this.registry + '/' + pkgName);
}

util.inherits(EDPRepos, NPMRepos);

module.exports = exports = EDPRepos;

