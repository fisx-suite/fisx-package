/**
 * @file 移除指定的安装包
 * @author sparklewhy@gmail.com
 */

var project = require('../project');
var pkgManage = require('../pkgManage');
var logger = require('../config').log;

/**
 * 移除指定的组件包
 *
 * @param {Array.<string>} components 要安装的组件名称
 * @param {Object=} options 移除选项，可选
 * @param {string=} options.root 安装的根目录，可选
 * @param {boolean=} options.saveToDep 更新项目依赖信息，可选
 * @param {boolean=} options.saveToDevDep 更新项目开发依赖信息，可选
 * @param {boolean=} options.confirm 是否需要确认，删除的时候，可选，默认 false
 * @param {boolean=} options.removeDep 是否依赖包也一起移除，可选，默认 true
 * @return {Promise}
 */
function uninstallComponents(components, options) {
    options || (options = {});
    project.initProject(options.root);

    var removeDep = options.removeDep == null ? true : !!options.removeDep;
    if (removeDep) {
        logger.warn('it\'ll remove the dependence packages of the given uninstall'
            + ' package in the same time, use `--ignore-dep` option to disable remove dependence.');
    }
    return pkgManage.uninstallPkg(components, {
        removeDep: removeDep,
        confirm: options.confirm
    }).then(function (result) {
        var print = require('../print');
        print.printUninstallInfo(result);
        pkgManage.saveUninstallInfo(result, options);
    }).catch(function (e) {
        logger.warn(e.stack || e);
    });
}

module.exports = exports = uninstallComponents;
