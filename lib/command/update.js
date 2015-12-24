/**
 * @file 更新安装包
 * @author sparklewhy@gmail.com
 */

var _ = require('lodash');
var install = require('./install');

/**
 * 更新指定的组件包
 *
 * @param {Array.<string>} components 要更新的组件名称
 * @param {Object=} options 更新选项，可选
 * @param {string=} options.root 安装的根目录，可选
 * @param {boolean=} options.saveToDep 更新项目依赖信息，可选
 * @param {boolean=} options.saveToDevDep 更新项目开发依赖信息，可选
 * @param {boolean=} options.forceLatest 是否强制安装最新的版本，当存在冲突的时候，可选
 * @return {Promise}
 */
function updateComponents(components, options) {
    var opts = _.extend({}, options, {update: true, forceLatest: true});
    var saveDep = opts.saveToDep;
    var saveDevDep = opts.saveToDevDep;
    var noSave = !saveDep && !saveDevDep;
    if (components.length) {
        // 确保 saveToDep 跟 saveDevDep 只有一个是 true
        opts.saveToDep = !saveDevDep;
    }
    else {
        if (noSave) {
            opts.saveToDep = opts.saveToDevDep = true;
        }
        opts.installAllDep = opts.saveToDep;
        opts.installAllDevDep = opts.saveToDevDep;
    }

    return install(components, opts);
}

module.exports = exports = updateComponents;

