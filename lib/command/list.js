/**
 * @file 列出安装的包信息
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');
var project = require('../project');
var Package = require('../package');
var logger = require('../config').log;

function mergeManifestInfo(installedPkgs) {
    var depPkgs = project.manifest.deps;
    var notInstalledPkgs = [];
    depPkgs.forEach(function (pkg) {
        var found = Package.find(pkg.name, installedPkgs);
        if (found) {
            found.isDep = true;
        }
        else {
            pkg.installed = false;
            notInstalledPkgs.push(pkg);
        }
    });

    project.manifest.devDeps.forEach(function (pkg) {
        var found = Package.find(pkg.name, installedPkgs);
        found && (found.isDevDep = true);
    });

    return notInstalledPkgs;
}

function initDependencies(pkg, installedPkgs, notInstallPkgs) {
    pkg.getDependencies().forEach(function (dep) {
        var found = Package.find(dep.name, installedPkgs);
        dep.installed = !!found;
        dep.mirror = found;
        found || notInstallPkgs.push(dep);
    });
}

function initInstalledPkgDeps(installedPkgs) {
    var notInstallPkgs = [];
    installedPkgs.forEach(function (pkg) {
        initDependencies(pkg, installedPkgs, notInstallPkgs);
    });
    return notInstallPkgs;
}

function initInstallPkgs(root) {
    return new Promise(function (resolve, reject) {
        project.initProject(root);

        var installedPkgs = project.installedPkgs;
        var notInstallManifestPkgs = mergeManifestInfo(installedPkgs);
        var notInstallDepPkgs = initInstalledPkgDeps(installedPkgs);

        resolve({
            installedPkgs: installedPkgs,
            notInstallManifestPkgs: notInstallManifestPkgs,
            notInstallDepPkgs: notInstallDepPkgs
        });
    });
}

function fetchAvailableUpdate(installedPkgs) {
    return new Promise(function (resolve, reject) {
        var counter = 0;
        var total = installedPkgs.length;
        var fetchDone = function (pkg, result) {
            pkg.updateData = result;
            counter++;
            if (total === counter) {
                resolve(installedPkgs);
            }
        };

        installedPkgs.map(function (pkg) {
            return pkg.repos.fetchUpdateData(pkg.installVersion).then(function (data) {
                fetchDone(pkg, data);
            }).catch(function (err) {
                fetchDone(pkg, {err: err});
            });
        });
    });
}

/**
 * 列出安装包的信息
 *
 * @param {Object=} options 选项定义
 * @param {string=} options.root 安装的根目录，可选
 * @param {boolean=} options.availableUpdate 是否显示可用的更新版本，默认 false
 */
function listInstalledComponents(options) {
    options || (options = {});

    var result = initInstallPkgs(options.root);
    if (options.availableUpdate) {
        result = result.then(function (result) {
            var loading = require('../progress').show('fetch update information ');
            return fetchAvailableUpdate(result.installedPkgs).then(function () {
                return result;
            }).finally(function () {
                loading.hide();
            });
        });
    }
    result.then(function (result) {
        var print = require('../print');
        print.listPackages(result, options);
    }).catch(function (err) {
        logger.debug(err.stack || err);
    });
}

module.exports = exports = listInstalledComponents;
