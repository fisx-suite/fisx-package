/**
 * @file 组件包类
 * @author sparklewhy@gmail.com
 */

var path = require('path');
var EventEmitter = require('events');
var _ = require('lodash');
var util = require('util');
var helper = require('./helper');
var config = require('./config');
var semver = require('./repos/semver');
var reposManage = require('./reposManage');
var REPOS_TYPE = config.reposType;

// var debug = require('debug')('package');

/**
 * 创建包实例
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} options 包的选项
 * @param {string} options.name 包的名称
 * @param {string} options.version 包期待的版本号
 * @param {string=} options.installVersion 包实际安装的版本
 * @param {string=} options.main 包的入口文件，对于样式模块可能没有
 * @param {string=} options.root 安装过的包的根目录
 * @param {Object=} options.dep 包的依赖
 * @param {Object=} options.depEndPoints 依赖的 endpoint 信息
 * @param {Object=} options.endPoint 包的安装源
 * @param {string} options.endPoint.type 安装源类型
 * @param {string=} options.endPoint.value 安装源类型值
 * @param {string=} options.aliasName 包的别名，可选
 */
function Package(options) {
    EventEmitter.call(this);

    // debug('create package: %s', JSON.stringify(options));

    _.extend(this, options);

    this.initRepository(this.endPoint);
    this.initDependencies(this.dep, this.depEndPoints);
}

util.inherits(Package, EventEmitter);

/**
 * 初始化包下载仓库
 *
 * @param {?Object} endPoint 仓库源类型信息
 */
Package.prototype.initRepository = function (endPoint) {
    if (this.repos) {
        this.repos.removeAllListeners();
    }

    endPoint || (endPoint = config.defaultEndPoint);
    this.endPoint = endPoint;

    var Repos = reposManage.repos[endPoint.type];
    if (!Repos) {
        throw new Error('unknown endpoint ' + endPoint.type);
    }
    this.repos = new Repos({
        source: endPoint.value,
        name: this.name,
        version: this.version
    });
    helper.proxyEvents(this.repos, this, ['end', 'progress']);
};

/**
 * 初始化依赖信息
 *
 * @param {Object} depMap 依赖 map
 * @param {Object=} depEndPoints 依赖的 endpoint 信息
 */
Package.prototype.initDependencies = function (depMap, depEndPoints) {
    this.dep = depMap;

    var deps = [];
    depEndPoints || (depEndPoints = {});
    Object.keys(depMap || {}).forEach(function (name) {
        var pkg = new Package({
            name: name,
            version: depMap[name],
            endPoint: depEndPoints[name] || this.repos.getDepEndPoint()
        });
        deps.push(pkg);
    }, this);

    this.setDependencies(deps);
};

/**
 * 设置包的依赖
 *
 * @param {Package|Array.<Package>} dependencies 设置包的依赖
 */
Package.prototype.setDependencies = function (dependencies) {
    if (!Array.isArray(dependencies)) {
        dependencies = [dependencies];
    }

    dependencies.forEach(function (item) {
        item.refer = this;
    }, this);
    this.deps = dependencies;
};

/**
 * 获取包的依赖
 *
 * @return {Array.<Package>}
 */
Package.prototype.getDependencies = function () {
    return this.deps || [];
};

/**
 * 初始化安装信息
 *
 * @param {Object|string} info 安装信息 或 安装失败原因
 * @param {string=} info.version 安装的版本
 * @param {string} info.name 安装的包名称
 * @param {Object} info.dep 包的依赖信息
 * @param {string} info.main 包的入口文件
 * @param {Object=} info.endPoint 包的 endPoint 类型
 * @param {Object=} info.depEndPoints 依赖的 endpoint 信息
 * @param {boolean} info.installed 是否之前已经安装过的
 * @param {boolean} info.cache 是否使用缓存安装
 * @param {string} info.tempDir 安装的临时目录
 * @param {string} info.root 包安装的根目录
 */
Package.prototype.initInstallInfo = function (info) {
    this.installVersion = info.version;
    this.name = info.name;
    this.main = info.main;

    if (info.endPoint) {
        this.initRepository(info.endPoint);
    }

    this.initDependencies(info.dep, info.depEndPoints);
    this.alreadyInstalled = info.installed;
    this.useCache = info.cache;
    this.tempDir = info.dir;
    this.root = info.root;
    this.conflict = info.conflict;
};

/**
 * 设置安装状态
 *
 * @param {boolean} successful 是否安装成功
 * @param {string=} reason 安装失败原因，可选
 */
Package.prototype.setInstallState = function (successful, reason) {
    this.installed = successful;
    this.failReason = successful ? '' : reason;
};

/**
 * 获取包的安装源路径
 *
 * @inner
 * @param {Package} pkg 包实例
 * @return {string}
 */
function getPkgInstallSourcePath(pkg) {
    var repos = pkg.repos;
    var pkgPath = repos.getReposPrefix() || '';

    var versionRange;
    var allowVersion = pkg.version;
    if (allowVersion) {
        if (semver.valid(allowVersion)) {
            versionRange = '^' + allowVersion;
        }
        else {
            versionRange = allowVersion;
        }
    }
    else {
        versionRange = '^' + pkg.installVersion;
    }

    return pkgPath + pkg.name + '@' + versionRange;
}

/**
 * 获取安装信息，返回信息如下：
 * {
 *   name: 'er',
 *   path: 'edp:er@2.2.1' 或 'github:ecome/er@2.1.1'
 *          或 'file:../a.zip er@2.1.1'
 *          或 'url:http://xx/a.zip er@2.1.1'
 * }
 *
 * @return {{name: string, path: string}}
 */
Package.prototype.getInstallInfo = function () {
    var realPkg = this.getRealPackage();
    return {
        name: this.aliasName || realPkg.name,
        path: getPkgInstallSourcePath(realPkg)
    };
};

/**
 * 查找非镜像包实例
 *
 * @inner
 * @param {Package} pkg 要查找的包实例
 * @return {Package}
 */
function findNotMirrorPkg(pkg) {
    if (pkg.mirror) {
        return findNotMirrorPkg(pkg.mirror);
    }
    return pkg;
}

/**
 * 查找真实非镜像的包实例
 *
 * @return {Package}
 */
Package.prototype.getRealPackage = function () {
    return findNotMirrorPkg(this);
};

/**
 * 获取包名称版本信息
 *
 * @return {string}
 */
Package.prototype.getNameVersionInfo = function () {
    var info = this.name;
    if (this.version) {
        info += ('@' + this.version);
    }
    return info || '';
};

/**
 * 转成字符串
 *
 * @override
 * @return {string}
 */
Package.prototype.toString = function () {
    var endPoint = this.endPoint;
    var value = '';

    if (endPoint) {
        value = endPoint.type + ':';
    }
    value += (this.name || this.aliasName || this.repos.pkgName);

    this.version && (value += '@' + this.version);
    return value;
};

/**
 * 解析版本信息
 *
 * @inner
 * @param {string} versionStr 包含版本信息字符串
 * @return {{name: string, version: string}}
 */
function parseVersionInfo(versionStr) {
    var lastAtIdx = versionStr.lastIndexOf('@');
    if (lastAtIdx !== -1) {
        return {
            name: versionStr.substring(0, lastAtIdx).trim(),
            version: versionStr.substr(lastAtIdx + 1).trim()
        };
    }

    return {name: versionStr};
}

/**
 * 解析包仓库源类型信息
 *
 * @inner
 * @param {string} pkgStr 包字符串
 * @param {string} endPointType 仓库源类型
 * @return {{endPoint: Object, name: string, version: string}}
 */
function parseEndPointInfo(pkgStr, endPointType) {
    var endPoint;
    if (endPointType === REPOS_TYPE.LOCAL || endPointType === REPOS_TYPE.URL) {
        var spaceIdx = pkgStr.indexOf(' ');
        endPoint = {
            type: endPointType,
            value: pkgStr.substring(0, spaceIdx)
        };
        pkgStr = pkgStr.substr(spaceIdx).trim();
    }
    else {
        var segments = pkgStr.split('/');
        var len = segments.length;

        if (len > 1) {
            if (endPointType
                && endPointType !== REPOS_TYPE.GITHUB
                && endPointType !== REPOS_TYPE.GITLAB
            ) {
                throw new Error(
                    util.format(
                        'parse endpoint %s value fail: %s, require github/gitlab',
                        endPointType, pkgStr
                    )
                );
            }
            endPoint = {
                type: endPointType || REPOS_TYPE.GITHUB,
                value: segments.shift().trim()
            };
            pkgStr = segments.join('/').trim();
        }
        else {
            endPointType && (endPoint = {type: endPointType});
        }
    }

    var versionInfo = parseVersionInfo(pkgStr);
    return {
        endPoint: endPoint,
        name: versionInfo.name,
        version: versionInfo.version
    };
}

/**
 * 提取包的信息
 *
 * @inner
 * @param {string} pkgStr 要提取信息的字符串
 * @return {{endPoint: Object, name: string, version: string}}
 */
function extractPkgInfo(pkgStr) {
    var segments = pkgStr.split(':');
    var len = segments.length;
    if (len === 1) {
        return parseEndPointInfo(pkgStr);
    }

    var endPointType = segments.shift().trim().toLowerCase();
    var pkgInfoStr = segments.join(':').trim();
    return parseEndPointInfo(pkgInfoStr, endPointType);
}

/**
 * 解析包的信息
 *
 * @inner
 * @param {string} pkgStr 要解析的字符串
 * @param {boolean=} supportAliasName 是否支持别名机制，可选，默认 false
 * @return {?Object}
 */
function parsePkgStr(pkgStr, supportAliasName) {
    pkgStr = pkgStr.trim();

    if (/^[\.\/\\]+/.test(pkgStr)) {
        // load from local file
        return {
            endPoint: {
                type: REPOS_TYPE.LOCAL,
                value: path.resolve(process.cwd(), pkgStr)
            }
        };
    }
    else if (/^http(s)?:\/\//.test(pkgStr)) {
        // load from url
        return {
            endPoint: {
                type: REPOS_TYPE.URL,
                value: pkgStr
            }
        };
    }

    var aliasName;
    if (supportAliasName && !/^[a-z][a-z0-9\+\-\.]+:/i.test(pkgStr)) {
        var lastAt = pkgStr.lastIndexOf('@');
        var segmentsStr = pkgStr;
        if (lastAt > 0) {
            segmentsStr = pkgStr.substring(0, lastAt);
        }
        var segments = segmentsStr.split('=');
        if (segments.length > 1) {
            aliasName = segments.shift().trim();
            pkgStr = segments.join('=').trim();
        }
    }

    var options = extractPkgInfo(pkgStr);
    options && (options.aliasName = aliasName);

    return options;
}

/**
 * 解析包的信息
 *
 * @param {string} pkgStr 要解析的字符串
 * @param {boolean=} supportAliasName 是否支持别名机制，可选，默认 false
 * @return {?Object}
 */
Package.parse = parsePkgStr;

/**
 * 将要安装的包转成 `Package` 结构
 *
 * @param {string} pkgStr 要安装的包，可能格式如下
 *        <name>[@version]
 *        <name>[@version range]
 *        <name>[@tag]
 *        <localfile> 要求 `.` 或者 `..` 开头，可以是文件夹或者压缩包
 *        <url> 压缩包 url
 *        <github username>/<github project>[@version]
 *        <endpoint>:<component path>[@version]
 *        <aliasName>=<component>
 * @return {Package}
 */
Package.toPackage = function (pkgStr) {
    return new Package(parsePkgStr(pkgStr, true));
};

/**
 * 将给定的依赖 map 转成依赖包数组
 *
 * @param {Object} depMap 依赖包 map
 * @return {Array<Package>}
 */
Package.toPackageArr = function (depMap) {
    var Package = require('./Package');
    var depPkgs = [];
    Object.keys(depMap).forEach(function (name, index) {
        var value = depMap[name];
        if (semver.validRange(value)) {
            value = name + '@' + value;
        }
        var option = parsePkgStr(value, false);
        option.aliasName = name;
        depPkgs[index] = new Package(option);
    });
    return depPkgs;
};

/**
 * 查找给定的包集合里满足给定包名的包，注意只返回第一个满足的包
 *
 * @param {string} pkgName 要查找的包名
 * @param {Array.<Package>} pkgs 要查找的包的集合
 * @param {boolean=} returnIndex 是否返回查找到的索引，可选，默认 false，返回查找到的数据项
 * @return {?Package|number}
 */
Package.find = function (pkgName, pkgs, returnIndex) {
    var findPkgByName = function (findName, ignoreCase) {
        var found;
        if (ignoreCase) {
            findName = findName.toLowerCase();
        }
        pkgs.some(function (pkg, index) {
            pkg = pkg.getRealPackage();
            var name = pkg.name;
            ignoreCase && (name = name.toLowerCase());
            if (name === findName) {
                found = returnIndex ? index : pkg;
                return true;
            }
        });

        return found;
    };

    var result = findPkgByName(pkgName);

    if (result == null) {
        // 如果没找到尝试，把名称全转成小写匹配，考虑到 windows 不区分大小写
        result = findPkgByName(pkgName, true);

        if (result) {
            require('colors');
            var findPkg = returnIndex ? pkgs[result].getRealPackage() : result;
            fis.log.warn(
                'exist different case installed package name with %s: %s',
                pkgName.red, findPkg.root.red
            );
        }
    }

    if (result == null && returnIndex) {
        result = -1;
    }

    return result;
};

/**
 * 移除给定包集合里指定的包名的包，返回移除的项
 *
 * @param {string} pkgName 要移除的包的名称
 * @param {Array.<Package>} pkgs 包的集合
 * @return {Array.<Package>}
 */
Package.remove = function (pkgName, pkgs) {
    var removeItems = [];
    for (var i = pkgs.length - 1; i >= 0; i--) {
        var item = pkgs[i].getRealPackage();
        if (item.name === pkgName) {
            removeItems.push(item);
            pkgs.splice(i, 1);
        }
    }
    return removeItems;
};

/**
 * 获取包的 key 来区分其它包
 *
 * @param {Package} pkg 包实例
 * @param {boolean=} supportAlias 是否考虑支持别名，可选，默认不考虑
 * @return {string}
 */
Package.getKey = function (pkg, supportAlias) {
    var key = pkg.name || '';

    if (supportAlias) {
        key += (pkg.aliasName || '');
    }

    key += (pkg.version || '');

    var endPoint = pkg.endPoint || {};
    key += (endPoint.type || '');
    key += (endPoint.value || '');

    return key;
};

/**
 * 移除重复的包
 *
 * @param {Array.<Package>} pkgs 要去重的集合
 * @return {Array.<Package>}
 */
Package.removeDuplicate = function (pkgs) {
    var existedMap = {};
    var newPkgs = [];
    pkgs.forEach(function (item) {
        var key = Package.getKey(item, true);
        if (!existedMap[key]) {
            existedMap[key] = 1;
            newPkgs.push(item);
        }
    });
    return newPkgs;
};

module.exports = exports = Package;
