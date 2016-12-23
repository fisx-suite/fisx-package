/**
 * @file 列出安装的包信息
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');
var assign = require('object-assign');
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
                if (found !== pkg) {
                    installedDeps.push(found);
                }
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

    var depInfo = initPkgDependencies(pkg, installedPkgs);
    if (depInfo.installs) {
        mergeManifestInfo([].concat(initedPkgs, depInfo.installs));
    }

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
 * @param {string=} options.name 要列出的指定包的名称，可选，默认全部
 * @param {boolean=} options.availableUpdate 是否显示可用的更新版本，默认 false
 * @param {number=} options.depth 要列出的包的依赖深度，可选
 * @param {style=} options.style 打印的组件的样式，可选，默认按 tree 形式，有效值：'tree'|'list'
 * @param {boolean=} options.openRepository 是否打开包的仓库 url
 * @return {Promise}
 */
function listInstalledComponents(options) {
    options || (options = {});

    var pkgName = options.name;
    var result = initInstallPkgs(options.root, pkgName);
    if (options.availableUpdate) {
        result = result.then(function (listPkgResult) {
            var fetchUpdatePkgs = [].concat(
                listPkgResult.installedPkgs, listPkgResult.installDeps || []
            );

            if (!fetchUpdatePkgs.length) {
                return listPkgResult;
            }

            // 创建加载指示器
            var Spinner = require('../spinner');
            var spinner = new Spinner({
                text: 'fetch update data...'.cyan
            });
            spinner.start();

            // 对于指定包的，获取其所有可用的版本信息
            var listPkg = pkgName ? listPkgResult.installedPkgs[0] : null;
            return fetchAvailableUpdate(listPkg ? [listPkg] : fetchUpdatePkgs).then(
                function () {
                    if (listPkg) {
                        var repos = listPkg.repos;
                        return repos.fetchReposMetaData().then(function (metaData) {
                            assign(listPkg.metaData, metaData || {});
                            return repos.fetchAllVersions();
                        });
                    }
                }
            ).then(
                function (data) {
                    data && (listPkgResult.allVersions = {
                        tags: data.tags,
                        versions: data.versions
                    });
                    return listPkgResult;
                }
            ).finally(function () {
                spinner.stop().clear();
            }).catch(function (err) {
                logger.warn(err.stack || err);
                return listPkgResult;
            });
        });
    }

    return result.then(function (listPkgInfo) {
        var print = require('../print');
        print.listPackages(listPkgInfo, options);

        var listPkg = options.name ? listPkgInfo.installedPkgs[0] : null;
        if (listPkg && options.openRepository) {
            var opn = require('opn');
            var url = listPkg.getRepositoryUrl();
            url && opn(url, {wait: false});
        }

        return listPkgInfo;
    });
}

module.exports = exports = listInstalledComponents;
