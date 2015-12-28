/**
 * @file 安装结果信息的打印工具方法
 * @author sparklewhy@gmail.com
 */

require('colors');
var _ = require('lodash');
var util = require('util');
var project = require('./project');
var logger = require('./config').log;
var helper = require('./helper');
var colorize = helper.colorize;
var semver = require('./repos/semver');

/* eslint-disable no-console */

/**
 * 获取所有安装的包，不包含重复的包
 *
 * @inner
 * @param {Array.<Package>} installPkgs 安装的包
 * @return {Array.<Package>}
 */
function getAllInstallPkgs(installPkgs) {
    var flattenInstallPkgs = [];
    var addedMap = {};
    var initPkgs = [].concat(installPkgs);
    var push = Array.prototype.push;

    while (initPkgs.length) {
        var pkg = initPkgs.shift().getRealPackage();
        var key = pkg.name;
        if (addedMap[key]) {
            continue;
        }

        addedMap[key] = 1;
        flattenInstallPkgs.push(pkg);

        push.apply(initPkgs, pkg.getDependencies());
    }

    addedMap = null;
    return flattenInstallPkgs;
}

/**
 * 获取指定数量的空白字符串
 *
 * @param {number} num 空白数量
 * @return {string}
 */
function getSpaceStr(num) {
    var i = 0;
    var space = '';
    while (i < num) {
        space += ' ';
        i++;
    }
    return space;
}

/**
 * 获取依赖树前缀的字符串
 *
 * @inner
 * @param {number} deep 当前所处深度
 * @param {number} indent 缩进的空格数
 * @param {Array.<boolean>} parents 其所有父（祖父）节点是所在层级最后一个节点
 * @return {string}
 */
function getTreePrefixStr(deep, indent, parents) {
    var str = '';
    var i = 0;
    while (i < deep) {
        if (parents[i]) {
            str += getSpaceStr(indent);
        }
        else {
            str += '│' + getSpaceStr(indent - 1);
        }
        i++;
    }

    return str;
}

function getPkgInstallTitle(expectedPkg, installPkg) {
    var pkgName = installPkg.name;
    var pkgInfo = installPkg.endPoint.type + ':' + pkgName;

    // 安装过程可能会存在安装卸载再安装失败过程，所以统一从安装过的包获取安装信息
    var installedPkg = project.findInstalledPkg(pkgName);
    var pkgVersion = installedPkg && installedPkg.installVersion;
    if (!installPkg.installed && installPkg.oldVersion) {
        pkgVersion = installPkg.oldVersion;
    }

    pkgVersion && (pkgInfo += '@' + pkgVersion);

    var expectVersion = expectedPkg.version;
    if (expectVersion && expectVersion !== '*'
        && expectVersion !== 'latest' && expectVersion !== pkgVersion
    ) {
        var expectInfo = ' expect ' + expectVersion + ' ';
        if (semver.satisfies(pkgVersion, expectVersion)) {
            expectInfo = ''; // expectInfo.gray;
        }
        else {
            expectInfo = expectInfo.red;
        }
        pkgInfo += expectInfo;
    }
    return pkgInfo;
}

function getInstallCmdPkgInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();

    var pkgInfo = getPkgInstallTitle(rawPkg, pkg);
    var deep = option.deep;
    var isUpdate = option.update;
    var info;
    if (!deep) {
        // 第一层才显示安装结果信息
        if (pkg.installed) { // 如果已经成功安装了
            // if (pkg.useCache) {
            //    pkgInfo += ' use cache'.gray;
            // }
            if (pkg.alreadyInstalled && !pkg.newInstalled) {
                info = isUpdate ? ' update none' : ' installed';
                pkgInfo += info.gray;
            }

            // 安装过程中可以存在安装卸载再安装过程
            if (pkg.oldVersion) {
                var replaceInfo = ' replace ' + pkg.oldVersion;
                pkgInfo += replaceInfo.yellow;
            }
            else if (isUpdate && pkg.newInstalled) {
                pkgInfo += ' new'.yellow;
            }
        }
        else {
            var op = pkg.degrade ? ' degrade' : ' update';
            var installVersion = pkg.installVersion;
            var updateInfo;
            if (installVersion) {
                updateInfo = op + ' ' + installVersion + ' fail';
            }
            else {
                updateInfo = op + ' fail';
            }
            info = isUpdate
                ? updateInfo
                : ' install fail';
            pkgInfo += info.red;
        }
    }

    return pkgInfo;
}

function getListCmdPkgInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();

    var pkgInfo = '';
    var deep = option.deep;

    if (deep) {
        pkgInfo += (pkg.installed ? '' : 'UNMET DEPENDENCY ').red;
    }

    if (deep) {
        pkgInfo += getPkgInstallTitle(rawPkg, pkg);
    }
    else {
        // 项目包信息
        pkgInfo += (pkg.getNameVersionInfo() || '');
        option.rootInfo && (pkgInfo += ' ' + option.rootInfo);
    }

    if (pkg.installed && deep) {
        if (deep === 1) {
            if (pkg.isDevDep && !pkg.isDep) {
                pkgInfo += ' devDependencies'.green;
            }
            else if (!pkg.isDep && !pkg.isDevDep) {
                pkgInfo += ' extraneous'.red;
            }
        }

        var updateData = pkg.updateData;
        if (updateData) {
            if (updateData.err) {
                pkgInfo += ' fetch update info fail'.red;
            }
            else {
                var updateInfo = [];
                var compatVer = updateData.compatVersion;
                compatVer && (updateInfo.push('compatible: ' + compatVer));
                var latestVer = updateData.latestVersion;
                latestVer && (updateInfo.push('latest: ' + latestVer));
                updateInfo = updateInfo.length
                    ? updateInfo.join(', ').cyan.bold
                    : '';
                pkgInfo += ' ' + updateInfo;
            }
        }
    }

    return pkgInfo;
}

/**
 * 初始化包安装信息
 *
 * @inner
 * @param {Package} pkg 安装的包
 * @param {Object} option 打印信息的选项
 * @param {boolean=} option.update 是否是更新操作
 * @param {boolean=} option.ls 是否是 `list` 命令，可选，默认 false，即 `install` 命令
 * @param {number} option.deep 当前初始化的包的深度，根节点从 0 开始
 * @param {number=} option.allowDepth 允许打印的深度，可选，默认只打印两层
 * @param {Array.<string>} option.infos 初始化的包的信息
 * @param {number} option.totalIndent 打印信息的整体缩进
 * @param {number} option.indent 打印的树状结构的缩进
 * @param {boolean} option.isLast 是否是当层节点的最后一个节点
 * @param {Array.<boolean>} option.parents 其所有父（祖父）节点是所在层级最后一个节点
 * @param {string=} option.rootInfo 显示在根节点旁边的信息，可选，`option.ls` 为 `true` 时才有效
 */
function initPkgInstallInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();
    var deep = option.deep;
    var currParents = option.parents || [];
    var pkgInfo = getTreePrefixStr(deep, option.indent, currParents);

    pkgInfo += (option.isLast ? '└── ' : '├── ');
    pkgInfo += (option.ls
        ? getListCmdPkgInfo(rawPkg, option)
        : getInstallCmdPkgInfo(rawPkg, option));

    pkgInfo = getSpaceStr(option.totalIndent || 0) + pkgInfo;

    option.infos.push(pkgInfo);

    var isParentLast = option.isLast;
    if (deep <= (option.allowDepth || 0)) {
        var deps = pkg.getDependencies();
        var lastIdx = deps.length - 1;
        var parents = [].concat(currParents, isParentLast);
        deps.forEach(function (dep, index) {
            initPkgInstallInfo(dep, _.extend({}, option, {
                deep: deep + 1,
                isLast: index === lastIdx,
                parents: parents
            }));
        });
    }
}

/**
 * 打印安装结果信息
 *
 * @param {Array.<Package>} installPkgs 安装的包
 * @param {boolean} isUpdate 是否是更新操作
 */
exports.printInstallInfo = function (installPkgs, isUpdate) {
    installPkgs = getAllInstallPkgs(installPkgs);

    var infos = [];
    var lastIdx = installPkgs.length - 1;
    installPkgs.forEach(function (pkg, idx) {
        initPkgInstallInfo(pkg, {
            deep: 0,
            infos: infos,
            totalIndent: 2,
            indent: 4,
            isLast: idx === lastIdx,
            update: isUpdate
        });
    });

    var prefix = isUpdate ? 'Update' : 'Install';
    if (infos.length) {
        logger.info('%s done\n%s', prefix, infos.join('\n'));
    }
    else {
        logger.info('%s nothing', prefix);
    }
};

/**
 * 打印移除安装信息
 *
 * @param {Array.<Package|Object>} uninstallPkgs 移除安装的包
 */
exports.printUninstallInfo = function (uninstallPkgs) {
    var printInfo = [];

    uninstallPkgs.forEach(function (pkg) {
        var info;
        if (pkg.notExisted) {
            var reason = 'it is not installed in ' + project.getPkgInstallDir();
            info = 'uninstall ' + pkg.name.green + ' fail: ' + reason.red;
            logger.warn(info);
        }
        else {
            info = 'uninstall ' + pkg.getNameVersionInfo().green;
            var referPkg = pkg.refer;

            if (referPkg && !pkg.uninstalled) {
                return;
            }

            if (referPkg) {
                info += '(referred by ' + referPkg.getNameVersionInfo().yellow + ') ';
            }
            info += (pkg.uninstalled ? ' done' : ' fail'.red);
            logger[pkg.uninstalled ? 'info' : 'warn'](info);
        }
        printInfo.push(info);
    });

    logger.info('uninstall done');
};

/**
 * 打印更新失败的信息
 *
 * @param {Array.<string>} notExistedPkgs 不存在的包
 * @param {Object} options 更新选项
 */
exports.printUpdateFailInfo = function (notExistedPkgs, options) {
    var printInfo = [];
    var key = options.saveToDep ? 'dependencies' : 'devDependencies';
    notExistedPkgs.forEach(function (item, index) {
        var reason = item + ' is not defined in the key `' + key + '` of '
            + project.manifestFile;
        printInfo[index] = 'Update ' + item.green + ' fail: ' + reason.red;
    });
    logger.info(printInfo.join('\n'));
};

/**
 * 列出包的信息
 *
 * @param {Object} info 要列出的包的信息，结构如下：
 *        {
 *          installedPkgs: Array.<Package>, // 安装的包
 *          notInstallManifestPkgs: Array.<Package>, // 未安装的清单包
 *          notInstallDepPkgs: Array.<Package>, // 未安装的依赖包
 *        }
 */
exports.listPackages = function (info) {
    var projectPkg = project.getProjectPackage();
    var installedPkgs = info.installedPkgs;
    var notInstallManifestPkgs = info.notInstallManifestPkgs;
    projectPkg.setDependencies(
        installedPkgs.concat(notInstallManifestPkgs)
    );

    // 打印安装结果信息
    var infos = [];
    initPkgInstallInfo(projectPkg, {
        ls: true,
        deep: 0,
        allowDepth: 2,
        infos: infos,
        totalIndent: 2,
        indent: 4,
        isLast: true,
        rootInfo: projectPkg.root
    });
    logger.info('Install info:\n' + infos.join('\n'));

    // 打印项目清单文件里定义的依赖没有安装的信息
    var projectInfo = projectPkg.getNameVersionInfo() || projectPkg.root;
    notInstallManifestPkgs.forEach(function (pkg) {
        var info = pkg.getNameVersionInfo().green + ', required by ' + projectInfo.green;
        logger.warn('missing: ' + info);
    });

    // 打印项目安装的包丢失的依赖的信息
    info.notInstallDepPkgs.forEach(function (pkg) {
        var refer = pkg.refer;
        var info = pkg.getNameVersionInfo().green + ', required by '
            + refer.getNameVersionInfo().green;
        logger.warn('missing: ' + info);
    });
};

/**
 * 列出搜索到的包
 *
 * @param {{count: number, list: Array.<Object>}} result 要显示的搜索结果
 * @param {string} key 搜索词
 */
exports.listSearchPkgs = function (result, key) {
    var isGithub = result.github;
    var list = result.list;
    var sumInfo = 'Found ' + String(result.count).green + ' results';
    if (list.length !== result.count) {
        sumInfo += ', show top ' + String(list.length).green;
    }
    console.log(sumInfo + ':');
    list.forEach(function (pkg) {
        var pkgName = pkg.name;
        key && (pkgName = pkgName.replace(key, key.red));
        console.log(
            util.format('%s: %s', colorize(pkgName, 'success'),
                colorize(pkg.time, 'info'))
        );

        if (isGithub) {
            console.log('  stars: %s  forks: %s',
                colorize(pkg.stars, 'title'), colorize(pkg.forks, 'title')
            );
        }

        console.log('  %s', colorize(pkg.description, 'info'));

        if (pkg.versions) {
            var versions = [];
            pkg.versions.forEach(function (v) {
                versions.push(v.cyan);
            });
            console.log('  版本：%s', versions.join(', '));
        }

        if (pkg.url) {
            console.log('  仓库：%s', colorize(pkg.url, 'link'));
        }
    });
};

/* eslint-enable no-console */
