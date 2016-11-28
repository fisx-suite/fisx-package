/**
 * @file 搜索组件包
 * @author sparklewhy@gmail.com
 */

var config = require('../config');
var reposManage = require('../reposManage');
var logger = config.log;

/**
 * 搜索组件包
 *
 * @param {string} key 搜索的组件包名称
 * @param {Object=} options 搜索选项，更多选项参考仓库类型的定义
 * @return {Promise}
 */
function searchComponents(key, options) {
    // 初始化搜索的 endpoint type
    var type;
    var parts = key.split(':');
    if (parts.length > 1) {
        type = parts.shift();
    }
    key = parts.join(':');

    // 初始化 github 搜索的 owner
    var owner;
    parts = key.split('/');
    if (parts.length > 1) {
        owner = parts.shift();
    }
    key = parts.join('/');
    options = options || {};
    owner && (options.owner = owner);

    type || (type = config.defaultEndPoint.type);
    var Repos = reposManage.repos[type];
    var repos = Repos && (new Repos({}));
    if (!repos || !repos.search) {
        logger.warn('The search for %s repository is not available', type || 'unknown');
        return;
    }


    // 创建加载指示器
    var Spinner = require('../spinner');
    var spinner = new Spinner({
        text: 'searching...'.cyan
    });
    spinner.start();

    return repos.search(key, options).finally(function () {
        spinner.stop().clear();
    }).then(function (result) {
        var print = require('../print');
        print.listSearchPkgs(result, key);
    }).catch(function (err) {
        logger.warn(err.stack || err);
    });
}

module.exports = exports = searchComponents;
