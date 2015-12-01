/**
 * @file 仓库管理
 * @author sparklewhy@gmail.com
 */

var config = require('./config');
var REPOS_TYPE = config.reposType;

/**
 * 注册预定义的仓库类型
 *
 * @type {Object}
 */
var reposTypeMap = {};
reposTypeMap[REPOS_TYPE.EDP] = require('./repos/edp');
reposTypeMap[REPOS_TYPE.GITHUB] = require('./repos/github');
reposTypeMap[REPOS_TYPE.LOCAL] = require('./repos/local');
reposTypeMap[REPOS_TYPE.URL] = require('./repos/url');
reposTypeMap[REPOS_TYPE.NPM] = require('./repos/npm');

exports.repos = reposTypeMap;

