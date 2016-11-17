/**
 * @file 组件包类
 * @author sparklewhy@gmail.com
 */

var EventEmitter = require('events');
var _ = require('lodash');
var util = require('util');
var helper = require('./helper');
var config = require('./config');
var semver = require('./repos/semver');
var scheme = require('./scheme');
var reposManage = require('./reposManage');
var logger = config.log;

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
 * @param {Object=} options.endPoint 包的安装源
 * @param {string} options.endPoint.type 安装源类型
 * @param {string=} options.endPoint.value 安装源类型值
 * @param {string=} options.aliasName 包的别名，可选
 * @param {string=} options.resolvedUrl 下载安装的 url
 */
function Package(options) {
    EventEmitter.call(this);

    // debug('create package: %s', JSON.stringify(options));

    _.extend(this, options);

    this.initRepository(options.endPoint, this.resolvedUrl);
}

util.inherits(Package, EventEmitter);

/**
 * 初始化包下载仓库
 *
 * @param {?Object} endPoint 仓库源类型信息
 * @param {string=} resolvedUrl 已经解析过的下载 url
 */
Package.prototype.initRepository = function (endPoint, resolvedUrl) {
    if (this.repos) {
        this.repos.removeAllListeners();
    }

    endPoint || (endPoint = config.defaultEndPoint);
    this.endPoint = endPoint;

    var Repos = reposManage.repos[endPoint.type];
    if (!Repos) {
        throw new Error('unknown endpoint ' + endPoint.type);
    }
    this.reposOpts = {
        source: endPoint.value,
        reposDomain: endPoint.domain,
        token: endPoint.token,
        name: this.name,
        version: this.version,
        resolvedUrl: resolvedUrl
    };
    this.repos = new Repos(this.reposOpts);
    helper.proxyEvents(this.repos, this, ['end', 'progress']);
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
 * 是否包下载安装路径信息已经确定了
 *
 * @return {boolean}
 */
Package.prototype.isResolved = function () {
    return !!this.getResolvedUrl();
};

/**
 * 获取已经解析过的下载 url
 *
 * @return {string}
 */
Package.prototype.getResolvedUrl = function () {
    return this.repos.getResolvedUrl();
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
 * @param {boolean} info.installed 是否之前已经安装过的
 * @param {boolean} info.newInstalled 是否是这次安装过程中新安装的包
 * @param {boolean} info.cache 是否使用缓存安装
 * @param {string} info.tempDir 安装的临时目录
 * @param {string} info.root 包安装的根目录
 * @param {string=} options.resolvedUrl 下载安装的 url
 */
Package.prototype.initInstallInfo = function (info) {
    this.installVersion = info.version;
    this.name = info.name;
    this.main = info.main;

    if (info.endPoint) {
        this.initRepository(info.endPoint, info.resolvedUrl);
    }

    this.dep = info.dep;
    this.alreadyInstalled = info.installed;
    this.newInstalled = info.newInstalled;
    this.useCache = info.cache;
    this.tempDir = info.dir;
    this.root = info.root;
    this.conflict = info.conflict;
};

/**
 * 初始化包安装的 resolve 信息
 *
 * @param {{from: string, endpoint: string, version: string, resolved: string}} info resolved 信息
 */
Package.prototype.initResolvedInfo = function (info) {
    var name = this.name;
    var value = info.from;

    if (value && !scheme.isURIScheme(value)) {
        value = name + '@' + value;
    }

    var option = scheme.parsePkgStr(value, false);
    var endPoint = option.endPoint || {};
    if (info.endpoint) {
        endPoint.type = info.endpoint;
    }

    var oldReposOpts = this.reposOpts;
    if (!value && oldReposOpts) {
        endPoint.value = oldReposOpts.source;
        endPoint.domain = oldReposOpts.reposDomain;
        endPoint.token =  oldReposOpts.token;
    }

    this.initRepository(endPoint, info.resolved);
    this.installVersion = info.version;
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
 * 获取包的安装源信息
 *
 * @inner
 * @param {Package} pkg 包实例
 * @return {Object}
 */
function getPkgInstallSourceInfo(pkg) {
    var versionRange;
    var allowVersion = pkg.version || '';
    var installVersion = pkg.installVersion;
    if (allowVersion && !/^(latest|stable|\*)$/.test(allowVersion)) {
        if (semver.valid(allowVersion)) {
            versionRange = '^' + allowVersion;
        }
        else {
            versionRange = allowVersion;
        }
    }
    else {
        installVersion && (versionRange = '^' + pkg.installVersion);
    }

    var repos = pkg.repos;
    var installSource = repos.getInstallSource();

    return {
        type: installSource.type,
        installVersion: installVersion,
        expectVersion: versionRange || '',
        path: installSource.path || '',
        sourceUrl: repos.getResolvedUrl()
    };
}

/**
 * 获取安装信息
 *
 * @return {Object}
 */
Package.prototype.getInstallInfo = function () {
    var realPkg = this.getRealPackage();
    var installInfo = getPkgInstallSourceInfo(realPkg);
    return {
        endpoint: installInfo.type,
        name: realPkg.name,
        path: installInfo.path || installInfo.expectVersion,
        version: installInfo.installVersion,
        expectVersion: installInfo.expectVersion,
        resolved: installInfo.sourceUrl
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
 * 解析包的信息
 *
 * @param {string} pkgStr 要解析的字符串
 * @param {boolean=} supportAliasName 是否支持别名机制，可选，默认 false
 * @return {?Object}
 */
Package.parse = scheme.parsePkgStr;

/**
 * 将要安装的包转成 `Package` 结构
 *
 * @param {string} pkgStr 要安装的包，可能格式如下
 *        <name>[@version]
 *        <name>[@version range]
 *        <name>[@tag]
 *        <localfile> 要求 `./` | `../` | `~/` | `/` 开头，可以是文件夹或者压缩包
 *        <url> 压缩包 url
 *        <github username>/<github project>[@version]
 *        <endpoint>:<component path>[@version]
 *        <aliasName>=<component>
 * @return {Package}
 */
Package.toPackage = function (pkgStr) {
    return new Package(scheme.parsePkgStr(pkgStr, true));
};

/**
 * 将给定的依赖 map 转成依赖包数组
 *
 * @param {Object} depMap 依赖包 map
 * @param {Object=} lockConfig 锁定的版本信息
 * @param {Object=} defaultEndPoint 默认的 endpoint 类型信息
 * @return {Array<Package>}
 */
Package.toPackageArr = function (depMap, lockConfig, defaultEndPoint) {
    var Package = require('./Package');
    var depPkgs = [];
    lockConfig || (lockConfig = {});

    Object.keys(depMap || {}).forEach(function (name, index) {
        var value = depMap[name];
        var lockInfo = lockConfig[name];

        if (!scheme.isURIScheme(value)) {
            value = name + '@' + value;
        }

        var option = scheme.parsePkgStr(value, false);
        if (lockInfo && lockInfo.aliasName) {
            option.aliasName = lockInfo.aliasName;
        }

        if (lockInfo && lockInfo.endpoint) {
            option.endPoint || (option.endPoint = {});
            option.endPoint.type = lockInfo.endpoint;
        }
        else if (!lockInfo && defaultEndPoint) {
            option.endPoint = defaultEndPoint;
        }

        if (lockInfo && lockInfo.version) {
            option.installVersion = lockInfo.version;
        }

        if (lockInfo && lockInfo.resolved) {
            option.resolvedUrl = lockInfo.resolved;
        }

        if (lockInfo && lockInfo.dependencies) {
            option.dep = Package.toDepMap(lockInfo.dependencies);
        }
        option.name = name;
        depPkgs[index] = new Package(option);
    });
    return depPkgs;
};

/**
 * 转成依赖 map
 *
 * @param {Array.<{name: string, from: string}>} deps 依赖包列表
 * @return {Object}
 */
Package.toDepMap = function (deps) {
    var depMap = {};
    deps.forEach(function (item) {
        depMap[item.name] = item.from;
    });
    return depMap;
};

/**
 * 转成依赖数组
 *
 * @param {Object} depMap
 * @param {Array.<Package>=} updatePkgs 更新的包，如果要转换的依赖包有更新则用更新的包
 * @return {Array.<{name: string, from: string}>}
 */
Package.toDepArr = function (depMap, updatePkgs) {
    var deps = [];
    updatePkgs || (updatePkgs = []);

    Object.keys(depMap).forEach(function (name) {
        var existed = Package.find(name, updatePkgs);
        if (existed) {
            deps.push({
                name: name,
                from: existed.getInstallInfo().path
            });
        }
        else {
            deps.push({
                name: name,
                from: depMap[name]
            });
        }
    });

    return deps;
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
            logger.warn(
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
