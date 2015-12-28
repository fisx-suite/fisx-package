/**
 * @file 包管理
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var Promise = require('bluebird');
var _ = require('lodash');
var prompt = require('prompt');
var helper = require('./helper');
var Package = require('./package');
var project = require('./project');
var semver = require('./repos/semver');
var cache = require('./cache');
var debug = require('debug')('package-manage');
var logger = require('./config').log;

/**
 *  递归查找已经安装的包，如果当前存在包跟要找的包名不一样，则递归查找其依赖，直到找到或者所有依赖包
 *  都遍历过
 *
 * @inner
 * @param {string} pkgName 要查找的包名
 * @param {Package} existedPkg 存在的包
 * @return {?Package}
 */
function findPkgFromInstalled(pkgName, existedPkg) {
    if (pkgName === existedPkg.name) {
        return existedPkg;
    }

    var found;
    existedPkg.getDependencies().some(function (item) {
        found = findPkgFromInstalled(pkgName, item);
        return !!found;
    });
    return found;
}

/**
 * 确定给定的包是否被其它已经安装的包依赖
 *
 * @inner
 * @param {string} pkgName 要判断的包名
 * @param {Array.<Package>} installedPkgs 已经安装的包
 * @return {boolean}
 */
function isDepByInstalledPkgs(pkgName, installedPkgs) {
    return installedPkgs.some(function (item) {
        if (item.name === pkgName) { // 跳过自己
            return false;
        }
        return !!findPkgFromInstalled(pkgName, item);
    });
}

/**
 * 判断是否可以移除安装，默认如果该包在清单里定义或者是被其他包依赖则不允许移除。
 *
 * @inner
 * @param {Package} pkg 要移除安装的包
 * @return {boolean}
 */
function checkCanUninstall(pkg) {
    var pkgName = pkg.name;
    if (pkg.refer) {
        var manifestPkg = project.findPkgFromManifest(pkgName);
        var inManifest = !!manifestPkg;
        debug('uninstall %s is defined in manifest: %s', pkgName, inManifest);
        if (inManifest
            || isDepByInstalledPkgs(pkgName, project.installedPkgs)
        ) {
            logger.warn('exist reference to package %s, cancel uninstall', pkgName);
            return false;
        }
    }

    return true;
}

/**
 * 删除包的安装
 *
 * @inner
 * @param {Package} pkg 要删除的包
 * @param {function(Package):boolean} canUninstall 自定义判断包是否能 uninstall
 * @return {Promise}
 */
function uninstall(pkg, canUninstall) {
    return new Promise(function (resolve, reject) {
        var pkgName = pkg.name;

        var existedPkg = project.findInstalledPkg(pkgName);
        if (!existedPkg) {
            pkg.notExisted = true;
            return resolve(pkg);
        }

        // 更新实际安装的版本号
        existedPkg.refer = pkg.refer;
        pkg = existedPkg;

        canUninstall || (canUninstall = checkCanUninstall);
        if (!canUninstall(pkg)) {
            return reject(pkg);
        }

        var msg = util.format(
            'Confirm uninstall package %s [y/n]',
            pkg.name + '@' + pkg.installVersion
        );
        prompt.get([msg], function (err, result) {
            if (err) {
                logger.warn(err.stack || err);
                return reject(pkg);
            }

            var answer = result[msg];
            if (answer === 'y') {
                try {
                    debug('ready remove %s: %s', pkg, pkg.root);
                    project.removeInstalledPkg(pkg);
                    pkg.uninstalled = true;
                    debug('uninstall %s done', pkg);
                }
                catch (ex) {
                    logger.warn(ex.stack || ex);
                    return reject(pkg);
                }
            }
            else {
                debug('cancel uninstall package %s', pkgName);
            }

            resolve(pkg);
        });
    });
}

/**
 * 移除包的安装
 *
 * @param {Package|string} pkg 要移除的包实例或包名
 * @param {Object=} options 移除选项
 * @param {boolean=} options.removeDep 是否移除依赖，默认 false
 * @param {function(Package):boolean=} options.canUninstall 自定义是否能删除包
 * @return {Promise}
 */
function uninstallPkg(pkg, options) {
    debug('uninstall package: %s', pkg);

    options || (options = {});
    if (_.isString(pkg)) {
        var pkgName = pkg;
        pkg = project.findInstalledPkg(pkgName);
        if (!pkg) {
            return Promise.resolve([{name: pkgName, notExisted: true}]);
        }
    }

    var removePkgs = [pkg];
    if (options.removeDep) {
        removePkgs = flattenPkgs(removePkgs, true);
    }

    var result = [];
    var done = function (processPkg, uninstalledPkg) {
        uninstalledPkg && result.push(uninstalledPkg);
        if (processPkg) {
            return uninstall(processPkg, options.canUninstall);
        }

        return result;
    };

    debug('uninstall pkg number: %s', removePkgs.length);
    return removePkgs.reduce(function (previous, item) {
        var doneHandler = done.bind(this, item);

        return previous.then(doneHandler).catch(function () {
            result.push(item);
        });
    }, Promise.resolve()).then(function (uninstalledPkg) {
        return done(null, uninstalledPkg);
    });
}

/**
 * 安装包到项目的指定目录
 *
 * @param {Package} pkg 安装的包
 * @param {string} tempPkgDir 包的临时目录
 * @return {Promise}
 */
function installPkg(pkg, tempPkgDir) {
    return new Promise(function (resolve, reject) {
        pkg = pkg.getRealPackage();

        var pkgName = pkg.name;
        var handleInstall = function (existedPkg) {
            // 先删除已经安装的包
            if (existedPkg) {
                uninstallPkg(existedPkg, {
                    removeDep: true,
                    canUninstall: function (uninstallPkg) {
                        var uninstallPkgName = uninstallPkg.name;
                        debug('check refer: ' + uninstallPkgName);
                        var hasSelfRefer
                            = Package.find(uninstallPkgName, pkg.getDependencies());
                        if (hasSelfRefer) {
                            logger.warn('%s has self dependence', uninstallPkg);
                        }

                        return !hasSelfRefer;
                    }
                }).then(function () {
                    if (!existedPkg.uninstalled) {
                        return reject('uninstall existed package ' + existedPkg + ' fail');
                    }
                    project.addInstalledPkg(pkg, tempPkgDir);
                    resolve(pkg);
                }).catch(function (ex) {
                    return reject(ex);
                });
            }
            else {
                project.addInstalledPkg(pkg, tempPkgDir);
                resolve(pkg);
            }
        };

        var existedPkg = project.findInstalledPkg(pkgName);
        if (existedPkg) {
            prompt.start();

            var op = pkg.degrade ? 'Degrade' : 'Upgrade';
            var msg = util.format(
                '%s %s %s -> %s [y/n]', op,
                pkgName, existedPkg.installVersion, pkg.installVersion
            );
            prompt.get([msg], function (err, result) {
                if (err) {
                    return reject(err);
                }

                var answer = result[msg];
                if (answer !== 'y') {
                    return reject(util.format('skip package %s install', pkg));
                }

                handleInstall(existedPkg);
            });
        }
        else {
            handleInstall();
        }
    });
}

/**
 * 根据当前结果信息，确定要执行的安装动作
 *
 * @param {Package} pkg 要安装的包
 * @param {Object} options 安装选项
 * @param {Object} result 安装结果信息
 * @return {Promise|Object}
 */
function checkInstall(pkg, options, result) {
    var installVersion = result.version;
    var installName = result.name || pkg.name;
    var installedPkg = project.findInstalledPkg(installName);

    debug('check the package %s existed: %s', installName, installedPkg ? 'y' : 'n');

    if (!installedPkg) {
        return result;
    }

    var oldVersion = installedPkg.installVersion;
    var installedPkgStr = installedPkg.getNameVersionInfo()
        + '(' + installedPkg.installVersion + ')';
    var isSatisfy = semver.satisfies(oldVersion, installVersion);
    debug('%s -> %s - %s : %s', pkg, oldVersion, installVersion, isSatisfy);
    var forceLatest = options.forceLatest;

    var hasConflict = false;
    if (!isSatisfy || forceLatest) {
        hasConflict = semver.isConflict(oldVersion, installVersion);
        debug('version %s vs %s is conflict: %s', oldVersion, installVersion, hasConflict);
        var isToInstallNewer;
        try {
            isToInstallNewer = semver.gtr(installVersion, oldVersion);
            debug('%s is newer than %s: %s', installVersion, oldVersion, isToInstallNewer);
        }
        catch (ex) {
            isToInstallNewer = true; // 如果版本号不规范，那就当当前要安装版本最新好了。。
            installVersion && debug('compare %s - %s: %s', installVersion, oldVersion, ex);
        }

        if (isToInstallNewer) {
            if ((hasConflict && forceLatest) || !hasConflict || result.ignoreConflict) {
                // 要安装的版本更新（强制最新或者没有冲突）则忽略当前老的版本，尝试拉取最新的
                installVersion && !installedPkg.newInstalled
                    && (pkg.oldVersion = oldVersion);
                debug('%s replace old: %s use %s', pkg.name, oldVersion, installVersion);
                return result;
            }
        }

        if (hasConflict) {
            var pkgInfo = pkg.toString();
            if (pkg.refer) {
                pkgInfo += '(dependence of ' + pkg.refer.getRealPackage() + ')';
            }
            logger.warn('install %s version %s is conflict with installed package %s',
                pkgInfo, installVersion, installedPkgStr
            );
        }
        // else {
        //     logger.warn('package %s is already installed: %s',
        //         pkg.name, installedPkgStr
        //     );
        // }

        var isSpecifyPkg = cache.getInstallExpectVersion(pkg.name);
        if (isSpecifyPkg && installVersion !== oldVersion) {
            // 版本降级、升级处理：只有明确指定要安装的版本，才降级、升级处理
            pkg.degrade = !isToInstallNewer && isSpecifyPkg;
            pkg.oldVersion = oldVersion;

            debug('change %s using %s', installedPkg, installVersion);
            return result;
        }
    }

    // 继续使用老的版本，清空之前保留的要替换的老的版本
    pkg.oldVersion = null;

    return _.extend(result, {
        root: installedPkg.root,
        main: installedPkg.main,
        version: installedPkg.version,
        installVersion: installedPkg.installVersion,
        name: installedPkg.name,
        endPoint: installedPkg.endPoint,
        dep: installedPkg.dep,
        depEndPoints: installedPkg.depEndPoints,
        newInstalled: installedPkg.newInstalled, // 可能这个包之前先安装了，再安装的时候出现安装过了
        installed: true // 标识该包安装过
    });
}

/**
 * 添加包到集合里
 *
 * @inner
 * @param {Package} pkg 要添加的包
 * @param {Array.<Package>} pkgArr 要添加的目标集合
 * @param {Object} addedMap 已经添加过的包的 map 信息
 * @param {boolean} ignoreAlias 是否忽略别名
 */
function addPkg(pkg, pkgArr, addedMap, ignoreAlias) {
    var key = ignoreAlias ? pkg.name : (pkg.aliasName || pkg.name);
    if (addedMap[key]) {
        return;
    }

    pkgArr.push(pkg);
    addedMap[key] = 1;
    pkg.getRealPackage().getDependencies().forEach(function (item) {
        addPkg(item, pkgArr, addedMap, ignoreAlias);
    });
}

/**
 * 将树状的包展平
 *
 * @inner
 * @param {Array.<Package>} pkgs 要展平的包数组
 * @param {boolean} ignoreAlias 是否忽略别名
 * @return {Array.<Package>}
 */
function flattenPkgs(pkgs, ignoreAlias) {
    var newPkgs = [];
    var existedMap = {};
    pkgs.forEach(function (item) {
        addPkg(item, newPkgs, existedMap, ignoreAlias);
    });
    return newPkgs;
}

/**
 * 更新包集合
 *
 * @inner
 * @param {Array.<Package>} currPkgs 当前的包集合
 * @param {Array.<Package>} updatePkgs 要更新的包集合
 */
function updatePkgInfos(currPkgs, updatePkgs) {
    var toAddPkgs = [];
    updatePkgs.forEach(function (pkg) {
        pkg = pkg.getRealPackage();
        if (!pkg.installed) {
            return;
        }

        var pkgName = pkg.name;
        var found = false;
        for (var i = 0, len = currPkgs.length; i < len; i++) {
            var currItem = currPkgs[i];
            // 跳过执行过安装任务的组件包
            if (pkgName === currItem.name) {
                found = true;
                if (currItem === pkg) {
                    continue;
                }

                if (!pkg.alreadyInstalled && pkg.newInstalled
                    && !cache.getInstallExpectVersion(pkgName)
                ) {
                    // 依赖可能安装到最新版本，做个替换
                    debug('replace %s with %s', currItem, pkg);
                    currPkgs.splice(i, 1, pkg);
                }
            }
        }

        if (!found) {
            // 新增的包，从最后安装的包里读取，避免中间卸载安装反复过程导致信息不准确
            toAddPkgs.push(project.findInstalledPkg(pkgName));
            debug('add new pkg manifest: %s', pkg);
        }
    });

    // 如果不忽略新增的，则将新增的添加到当前包集合里
    Array.prototype.push.apply(currPkgs, toAddPkgs);
}

/**
 * 更新指定的安装的包信息
 *
 * @inner
 * @param {Array.<Package>} pkgs 原始包的列表
 * @param {Array.<Package>} replacePkgs 要替换的包
 * @param {boolean} ignoreNewAdd 是否忽略新增的包
 */
function updateSpecifyPkgs(pkgs, replacePkgs, ignoreNewAdd) {
    var toAddPkgs = [];

    replacePkgs.forEach(function (item) {
        item = item.getRealPackage();
        if (!item.installed) {
            item.installVersion = null;
            return;
        }

        var found = Package.find(item.name, pkgs, true);
        if (found === -1) {
            !ignoreNewAdd && toAddPkgs.push(item);
        }
        else if (pkgs[found] !== item) {
            debug('replace %s with %s', pkgs[found], item);
            var old = pkgs[found];
            if (!item.aliasName) {
                item.aliasName = old.aliasName;
            }
            pkgs.splice(found, 1, item);
        }
    });

    !ignoreNewAdd && Array.prototype.push.apply(pkgs, toAddPkgs);
}

/**
 * 安装包
 *
 * @param {Package} pkg 要安装的包
 * @param {Object} options 安装选项
 * @param {boolean=} options.forceLatest 强制安装最新版，当出现冲突的时候
 * @return {Promise}
 */
exports.install = function (pkg, options) {
    debug('begin install package %s...', pkg);
    pkg.emit('start');

    var repos = pkg.repos;
    var fetchVersion = cache.getInstallExpectVersion(pkg.name) || pkg.version;
    return Promise.try(function () {
        return checkInstall(pkg, options, {
            name: pkg.name,
            version: fetchVersion,
            ignoreConflict: !semver.valid(pkg.version)
        });
    }).then(function (result) {
        if (result.installed) {
            return result;
        }

        return repos.fetchAvailableVersion(fetchVersion).then(
            function (result) {
                debug('fetch %s meta data: ok', pkg);
                return checkInstall(pkg, options, result);
            }
        );
    }).then(function (result) {
        if (!result.installed) {
            return repos.fetchVersionMetaData(result);
        }
        return result;
    }).then(function (result) {
        return result.installed ? result : repos.download(result);
    }).then(
        function (result) {
            if (!result.installed) {
                var manifest = project.readPackageManifest(result.dir, null, true);
                _.extend(result, manifest);
                // 这里再做 check，避免出现包的名称跟已经存在的冲突
                return checkInstall(pkg, options, result);
            }
            return result;
        }
    ).then(
        function (result) {
            debug('install info: %s', JSON.stringify(result));

            if (result.installed) {
                // `initInstallInfo` 要初始化安装的版本信息，所以要重置下
                result.version = result.installVersion;
            }

            pkg.initInstallInfo(result);
            if (!result.installed) {
                return installPkg(pkg, result.root);
            }

            return result;
        }
    ).then(
        function () {
            pkg.setInstallState(true);
        }
    ).catch(
        function (err) {
            debug('install %s error happen: %s', pkg, err);
            var reason = err;
            if (err.hasNoMatchVersion) {
                reason = util.format('install package %s: %s', pkg, err.reason);
            }
            pkg.setInstallState(false, reason);
            throw reason;
        }
    ).finally(
        function () {
            debug('remove temp dir: %s', pkg.tempDir);
            try {
                pkg.tempDir && helper.rmDirSync(pkg.tempDir);
                pkg.tempDir = null;
            }
            catch (ex) {
                logger.warn(ex);
            }
        }
    );
};

/**
 * 移除安装包
 *
 * @param {Array.<string>} pkgNames 要移除的安装包
 * @param {Object} options 移除选项
 * @param {boolean} options.removeDep 是否依赖的组件也移除掉
 * @return {Promise}
 */
exports.uninstallPkg = function (pkgNames, options) {
    var result = [];
    // 确保包名为字符串
    pkgNames = pkgNames.map(function (item) {
        return String(item);
    });

    var push = Array.prototype.push;
    var done = function (name, pkgs) {
        pkgs && push.apply(result, pkgs);

        if (name) {
            return uninstallPkg(name, options);
        }

        return result;
    };

    return pkgNames.reduce(function (prev, name) {
        var doneHandler = done.bind(this, name);
        return prev.then(doneHandler);
    }, Promise.resolve()).then(function (pkgs) {
        return done(null, pkgs);
    });
};

/**
 * 保存安装的依赖信息
 *
 * @param {Array.<Package>} installPkgs 安装的包
 * @param {Object} options 安装的选项
 * @param {boolean} options.allDep 是否是全部安装清单文件的依赖
 * @param {boolean} options.allDevDep 是否是全部安装清单文件的开发依赖
 * @param {boolean} options.saveToDep 是否保存到清单的依赖信息里
 * @param {boolean} options.saveToDevDep 是否保存到清单的开发依赖信息里
 * @param {boolean} options.isUpdate 是否是更新操作
 */
exports.saveInstallInfo = function (installPkgs, options) {
    var saveToDep = options.saveToDep;
    var saveToDevDep = options.saveToDevDep;
    if ((!saveToDep && !saveToDevDep) || !installPkgs.length) {
        return;
    }

    var manifestInfo = project.manifest;
    var deps = manifestInfo.deps;
    var devDeps = manifestInfo.devDeps;

    if (saveToDep) {
        updateSpecifyPkgs(deps, installPkgs, options.isUpdate);
        updatePkgInfos(deps, flattenPkgs(deps));
    }
    if (saveToDevDep) {
        updateSpecifyPkgs(devDeps, installPkgs, options.isUpdate);
        updatePkgInfos(devDeps, flattenPkgs(devDeps));
    }

    project.saveManifestInfo(saveToDep && deps, saveToDevDep && devDeps);
};

/**
 * 保存删除安装包的信息
 *
 * @param {Array.<Package|Object>} uninstalledPkgs 移除的包的列表
 * @param {Object} options 移除选项
 * @param {boolean} options.saveToDep 是否保存到清单的依赖信息里
 * @param {boolean} options.saveToDevDep 是否保存到清单的开发依赖信息里
 */
exports.saveUninstallInfo = function (uninstalledPkgs, options) {
    var saveToDep = options.saveToDep;
    var saveToDevDep = options.saveToDevDep;
    if (!saveToDep && !saveToDevDep) {
        return;
    }

    var manifestInfo = project.manifest;
    var deps = flattenPkgs(manifestInfo.deps);
    var devDeps = flattenPkgs(manifestInfo.devDeps);

    var depInfo = '';
    deps.forEach(function (item) {
        depInfo += item + '; ';
    });
    debug('depInfo: %s', depInfo);

    depInfo = '';
    devDeps.forEach(function (item) {
        depInfo += item;
    });
    debug('devDepInfo: %s', depInfo);

    var hasUpdate;
    uninstalledPkgs.forEach(function (pkg) {
        if (!pkg.refer && (pkg.uninstalled || pkg.notExisted)) {
            var pkgName = pkg.name;
            var result = saveToDep && Package.remove(pkgName, deps);
            var result2 = saveToDevDep && Package.remove(pkgName, devDeps);
            hasUpdate = hasUpdate || result || result2;
        }
    });

    if (hasUpdate) {
        project.saveManifestInfo(deps, devDeps);
    }
};
