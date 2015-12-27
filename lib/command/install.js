/**
 * @file 安装组件包
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');
var project = require('../project');
var Package = require('../package');
var progress = require('../progress');
var pkgManage = require('../pkgManage');
var cache = require('../cache');
var debug = require('debug')('install');
var logger = require('../config').log;

var installedMap = {};

/**
 * 递归安装包
 *
 * @inner
 * @param {Array.<Package>} waitingPkgs 等待安装包
 * @param {Object} options 安装选项
 * @param {Function} callback 安装完成回调
 * @return {void}
 */
function install(waitingPkgs, options, callback) {
    if (!waitingPkgs.length) {
        callback();
        return;
    }

    var pkg = waitingPkgs.shift();
    var key = Package.getKey(pkg, false);
    var installedPkg = installedMap[key];
    if (installedMap[key]) {
        pkg.mirror = installedPkg;
        debug('installing add mirror: %s -> %s', pkg, installedPkg);
        return install(waitingPkgs, options, callback);
    }
    installedMap[key] = pkg;
    pkg.hasInstalled = true; // 标识该组件包执行过安装

    var progressBar = progress(pkg);
    debug('install %s, have %s left to install...', pkg, waitingPkgs.length);
    pkgManage.install(pkg, options).then(function () {
        waitingPkgs.unshift.apply(waitingPkgs, pkg.getDependencies());
        install(waitingPkgs, options, callback);
    }, function (err) {
        progressBar.done(err);
        logger.warn(err.stack || err);
        install(waitingPkgs, options, callback);
    });
}

/**
 * 开始安装依赖包
 *
 * @inner
 * @param {Array.<Package>} toInstallPkgs 要安装的依赖包
 * @param {Object} options 安装选项
 * @return {Promise}
 */
function startInstall(toInstallPkgs, options) {
    var waitingInstallPkgs = [];
    [].push.apply(waitingInstallPkgs, toInstallPkgs);

    return new Promise(function (resolve, reject) {
        install(waitingInstallPkgs, options, function () {
            resolve(toInstallPkgs);
        });
    });
}

/**
 * 安装指定的组件包
 *
 * @param {Array.<string>} components 要安装的组件，支持如下语法：
 *        <name>[@version]
 *        <name>[@version range]
 *        <name>[@tag]
 *        <localfile> 要求 `.` 或者 `..` 开头，可以是文件夹或者压缩包
 *        <url> 压缩包 url
 *        <github username>/<github project>
 *        <endpoint>:<component path>
 *        <aliasName>=<component>
 * @param {Object=} options 安装选项，可选
 * @param {string=} options.root 安装的根目录，可选
 * @param {boolean=} options.saveToDep 把安装的组件保存到依赖信息里，可选
 * @param {boolean=} options.saveToDevDep 把安装的组件保存到开发依赖信息里，可选
 * @param {boolean=} options.forceLatest 是否强制安装最新的版本，当存在冲突的时候，可选
 * @param {boolean=} options.installAllDep 是否安装所有项目的依赖，可选，默认 false
 *        只有 `components` 为空时，该选项才有效
 * @param {boolean=} options.installAllDevDep 是否是安装所有项目开发依赖，可选，默认 false
 *        只有 `components` 为空时，该选项才有效
 * @param {boolean=} options.update 是否是更新操作
 * @return {Promise}
 */
function installComponents(components, options) {
    options || (options = {});
    project.initProject(options.root);

    var manifest = project.manifest;
    var saveToDep = options.saveToDep;
    var saveToDevDep = options.saveToDevDep;
    var installInfo = {
        saveToDep: saveToDep,
        saveToDevDep: saveToDevDep
    };
    var toInstallPkgs = [];
    var notExisteds = [];
    var isUpdate = options.update;
    if (components.length) {
        components.forEach(function (item, index) {
            var pkgInfo = Package.parse(item, true);

            if (isUpdate) {
                var found;
                var pkgName = pkgInfo.name;
                // 暂时不支持 saveToDep 和 saveToDevDep 都是 true/false 情况
                if (saveToDep) {
                    found = project.findDepPkgFromManifest(pkgName);
                }
                else if (saveToDevDep) {
                    found = project.findDevDepPkgFromManifest(pkgName);
                }

                if (found) {
                    // 对于更新的组件，如果没有指定的安装版本，用包清单文件里定义的更新
                    pkgInfo.version || (pkgInfo.version = found.version);
                }
                else {
                    return notExisteds.push(item);
                }
            }
            toInstallPkgs[index] = new Package(pkgInfo);
        });
    }
    else {
        var push = Array.prototype.push;

        if (options.installAllDep) {
            // 安装清单文件里的所有依赖组件
            push.apply(toInstallPkgs, manifest.deps);
            installInfo.allDep = true;
        }

        if (options.installAllDevDep) {
            push.apply(toInstallPkgs, manifest.devDeps);
            installInfo.allDevDep = true;
        }
    }

    toInstallPkgs = Package.removeDuplicate(toInstallPkgs);
    cache.initExpectInstallPkgVersion(toInstallPkgs);
    debug('to install pkgs number: %s', toInstallPkgs.length);

    return startInstall(toInstallPkgs, options).then(function (installPkgs) {
        installedMap = {};
        var print = require('../print');
        print.printInstallInfo(installPkgs, isUpdate);
        installInfo.isUpdate = isUpdate;
        if (notExisteds.length) {
            print.printUpdateFailInfo(notExisteds, installInfo);
        }
        pkgManage.saveInstallInfo(installPkgs, installInfo);
    }).catch(function (e) {
        logger.warn(e.stack || e);
    });
}

module.exports = exports = installComponents;
