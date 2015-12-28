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
        // 用 mirror 保存其引用的真实安装的包的信息，虽然跟实际该字段的定义不是特别相符
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

function initPkgDependencies(pkg, installedPkgs) {
    var notInstallPkgs = [];
    if (!pkg) {
        return {notInstalls: notInstallPkgs};
    }

    var initedPkgs = [pkg];
    var push = Array.prototype.push;
    var initedMap = {};
    var installedDeps = [];
    while (initedPkgs.length > 0) {
        var item = initedPkgs.shift();
        var name = item.name;
        var found = Package.find(name, installedPkgs);
        item.installed = !!found;
        item !== found && (item.mirror = found);

        if (!initedMap[name]) {
            if (found) {
                installedDeps.push(found);
                push.apply(initedPkgs, found.getDependencies());
            }
            else {
                notInstallPkgs.push(item);
            }
        }
        initedMap[name] = true;
    }

    return {
        notInstalls: notInstallPkgs,
        installs: installedDeps
    };
}

function initPkgInfo(pkgName) {
    var installedPkgs = project.installedPkgs;
    var pkg = Package.find(pkgName, installedPkgs);
    var initedPkgs = pkg ? [pkg] : [];
    mergeManifestInfo(initedPkgs);

    var depInfo = initPkgDependencies(pkg, installedPkgs);
    return {
        installedPkgs: initedPkgs,
        notInstallManifestPkgs: [],
        notInstallDepPkgs: depInfo.notInstalls,
        installDeps: depInfo.installs
    };
}

function initInstallPkgs(root, pkgName) {
    return new Promise(function (resolve, reject) {
        project.initProject(root);

        if (pkgName) {
            return resolve(initPkgInfo(pkgName));
        }

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
 * @param {string=} options.package 列出指定包的信息，可选，默认全部
 * @param {boolean=} options.availableUpdate 是否显示可用的更新版本，默认 false
 */
function listInstalledComponents(options) {
    options || (options = {});

    var result = initInstallPkgs(options.root, options.package);
    if (options.availableUpdate) {
        result = result.then(function (result) {
            var fetchUpdatePkgs = [].concat(
                result.installedPkgs, result.installDeps || []
            );

            if (!fetchUpdatePkgs.length) {
                return result;
            }

            var loading = require('../progress').show('fetch update information ');
            return fetchAvailableUpdate(fetchUpdatePkgs).then(
                function () {
                    return result;
                }
            ).finally(
                function () {
                    loading.hide();
                }
            );
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
