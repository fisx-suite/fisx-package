/**
 * @file 项目相关的包管理方法
 * @author sparklewhy@gmail.com
 */

var path = require('path');
var fs = require('fs');
var helper = require('./helper');
var config = require('./config');
var Package = require('./package');
var debug = require('debug')('project');
var logger = config.log;

/**
 * 从项目清单文件里读取项目的依赖信息，返回结构如下：
 * {
 *    deps: Object,
 *    devDeps: Object,
 *    saveKey: ?string // 保存的依赖信息的 key
 *    rawData: Object, // 原始的清单信息
 *    file: string // 清单文件路径
 * }
 *
 * @inner
 * @return {Object}
 */
function readDepInfoFromManifest() {
    var manifestFile = exports.manifestFile;
    var data;
    try {
        data = require(manifestFile);
        if (!data) {
            data = {};
        }
    }
    catch (ex) {
        data = {};
    }

    var key = config.saveTargetKey;
    var depInfo = data;
    if (key) {
        depInfo = data[key] || {};
    }

    return {
        name: data.name,
        version: data.version,
        deps: depInfo.dependencies || {},
        devDeps: depInfo.devDependencies || {},
        ignoreDeps: depInfo.ignoreDependencies || [],
        saveKey: key,
        rawData: data,
        moduleConfig: depInfo[config.moduleConfigKey] || {},
        lockConfig: depInfo[config.lockConfigKey] || {},
        file: manifestFile
    };
}

/**
 * 读取项目清单文件信息
 *
 * @inner
 * @param {string=} root 项目根目录
 * @return {Object}
 */
function readProjectManifest() {
    var installManifestInfo = readDepInfoFromManifest();

    installManifestInfo.deps = Package.removeDuplicate(
        Package.toPackageArr(
            installManifestInfo.deps,
            installManifestInfo.lockConfig
        )
    );

    installManifestInfo.devDeps = Package.removeDuplicate(
        Package.toPackageArr(
            installManifestInfo.devDeps,
            installManifestInfo.lockConfig
        )
    );

    return installManifestInfo;
}

/**
 * 查找包可用的别名
 *
 * @inner
 * @param {Object} depMap 依赖信息 map
 * @param {string} name 包别名
 * @param {number} counter 用来作为后缀的计数器
 * @return {string}
 */
function findPkgAvailableName(depMap, name, counter) {
    counter++;
    var newName = name + counter;
    if (depMap[newName]) {
        return findPkgAvailableName(depMap, name, counter);
    }
    return newName;
}

/**
 * 转成清单文件依赖 map 数据结构
 *
 * @inner
 * @param {Array.<Package>} pkgArr 依赖包数组
 * @return {Object}
 */
function toDepMap(pkgArr) {
    var depMap = {};
    pkgArr.forEach(function (pkg) {
        var info = pkg.getInstallInfo();
        var name = info.name;
        if (depMap[name]) {
            logger.warn(
                'the alias name %s is duplicate: %s with %s',
                name, info.path, depMap[name]
            );
            name = findPkgAvailableName(depMap, name, 0);
            pkg.aliasName = name;
            logger.info('use the new name: %s to resolve the conflict', name);
        }
        depMap[name] = info.path;
    });
    return depMap;
}

/**
 * 初始化要锁定的模块信息
 *
 * @param {Package} pkg 包信息
 * @param {Object} lockInfo 锁定的模块信息
 * @param {Array.<Package>} allUpdatePkgs 所有更新的包
 */
function initLockModuleInfo(pkg, lockInfo, allUpdatePkgs) {
    var pkgName = pkg.name;

    var pkgInfo = {};
    lockInfo[pkgName] = pkgInfo;
    var aliasName = pkg.aliasName;
    if (aliasName && aliasName !== pkgName) {
        pkgInfo.aliasName = aliasName;
    }

    var installInfo = pkg.getInstallInfo();
    pkgInfo.endpoint = installInfo.endpoint;
    pkgInfo.version = installInfo.version;
    pkgInfo.from = installInfo.path;
    pkgInfo.resolved = installInfo.resolved;
    if (!installInfo.resolved) {
        logger.warn('missing installed package resolved info: %s, '
            + 'please uninstall this pkg and reinstall', pkg);
    }

    var deps = pkg.getDependencies();
    if (deps && deps.length) {
        var depInfos = [];
        deps.forEach(function (pkg, index) {
            depInfos[index] = {
                name: pkg.name,
                from: pkg.getInstallInfo().path
            };
        });
        pkgInfo.dependencies = depInfos;
    }
    else if (pkg.dep) {
        pkgInfo.dependencies = Package.toDepArr(pkg.dep, allUpdatePkgs);
    }

    if (pkgInfo.dependencies && !pkgInfo.dependencies.length) {
        delete pkgInfo.dependencies;
    }
}

/**
 * 根据包名查找包的配置信息所在索引，找不到返回 -1
 *
 * @param {Array.<Object>} rawPkgConf 当前包配置信息
 * @param {string} pkgName 要查找的包名
 * @param {string=} basePath 要计算的基础路径，可选
 * @return {number}
 */
function findPkgModuleConf(rawPkgConf, pkgName, basePath) {
    var len = rawPkgConf.length;
    for (var i = len - 1; i >= 0; i--) {
        var pkg = rawPkgConf[i];

        if (!basePath) {
            if (pkg.name === pkgName) {
                return i;
            }
            continue;
        }

        var loc = pkg.location;
        if (loc && helper.isLocalPath(loc)) {
            var parts = path.relative(
                exports.root, path.resolve(basePath, loc)
            ).replace(/\\+/g, '/').replace(/^\/+/, '').split('/');
            if (parts[1] === pkgName) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * 将安装的包的信息转成 `require.config` packages 的配置信息，供项目开发读取使用
 *
 * @param {Array.<Object>} rawPkgConf 当前包配置信息
 * @param {Array.<Package>} allPkgArr 依赖包数组
 * @param {Array.<string>} removePkgNames 移除的包名
 * @param {Array.<Package>} updatePkgs 更新的包
 * @param {string} basePath 要计算的基础路径
 * @return {Array.<Object>}
 */
function updateModulePackageConfig(rawPkgConf, allPkgArr, removePkgNames, updatePkgs, basePath) {
    removePkgNames.forEach(function (pkgName) {
        var index = findPkgModuleConf(rawPkgConf, pkgName, basePath);
        if (index !== -1) {
            rawPkgConf.splice(index, 1);
        }
    });

    var assign = require('object-assign');
    var pkgMainSrcRegExp = /^(\.\/)?src\//;
    allPkgArr.forEach(function (pkg) {
        var rawPkg = pkg;
        pkg = exports.findInstalledPkg(pkg.getRealPackage().name);
        if (!pkg) {
            return;
        }

        var confPkgName = rawPkg.aliasName || pkg.name;
        // 如果已经存在且没有更新则跳过
        var existedIndex = findPkgModuleConf(rawPkgConf, confPkgName);
        if (existedIndex !== -1 && !Package.find(pkg.name, updatePkgs)) {
            return;
        }

        var location = path.relative(basePath, pkg.root).replace(/\\/g, '/');
        var main = pkg.main;
        if (helper.isPathExists(path.join(pkg.root, 'src'))) {
            if (!main
                || pkgMainSrcRegExp.test(main)
                || !helper.isPathExists(path.join(pkg.root, main))
            ) {
                location += '/src';
                main && (main = main.replace(pkgMainSrcRegExp, ''));
            }
        }
        main && (main = main.replace(/(^\.\/|\.js$)/, ''));

        var pkgConf = {
            name: confPkgName,
            location: location,
            main: main
        };

        if (existedIndex === -1) {
            rawPkgConf.push(pkgConf);
        }
        else {
            // 包配置以 `package.json` 定义为主
            rawPkgConf.splice(
                existedIndex, 1,
                assign(pkgConf, rawPkgConf[existedIndex])
            );
        }
    }, this);

    return rawPkgConf;
}

/**
 * 获取移除的包名
 *
 * @param {Object} rawDepMap 原始的依赖 map
 * @param {Object} rawDevDepMap 原始的开发依赖 map
 * @param {Object} depMap 新的依赖 map
 * @param {Object} devDepMap 新的开发依赖 map
 * @return {Array.<string>}
 */
function getRemovePkgs(rawDepMap, rawDevDepMap, depMap, devDepMap) {
    var removePkgs = [];
    var rawDeps = Object.keys(rawDepMap || {});
    depMap && rawDeps.forEach(function (name) {
        if (!depMap[name]) {
            removePkgs.push(name);
        }
    });

    var rawDevDeps = Object.keys(rawDevDepMap || {});
    devDepMap && rawDevDeps.forEach(function (name) {
        if (!devDepMap[name]) {
            removePkgs.push(name);
        }
    });

    return removePkgs;
}

/**
 * 初始化包的信息
 *
 * @inner
 * @param {Object} metaData 包的元数据信息
 * @param {?Object} pkgInfo 要更新的包信息
 * @return {Object}
 */
function initPkgInfo(metaData, pkgInfo) {
    var deps = metaData.dependencies;
    if (Array.isArray(deps)) {
        // component.json 配置的依赖可能是一个数组
        var depMap = {};
        deps.forEach(function (item) {
            var parts = item.split('@');
            var name = parts.shift().trim();
            depMap[name] = parts.join('@').trim();
        });
        deps = depMap;
    }

    if (pkgInfo) {
        pkgInfo.dep = deps;
    }
    else {
        var main = metaData.main;
        if (Array.isArray(main)) {
            // 查找入口为 js 的文件
            var found;
            main.some(function (item) {
                if (/\.(js|coffee|ts|dart)$/i.test(item)) {
                    found = item;
                    return true;
                }
            });
            main = found;
        }
        pkgInfo = {
            root: metaData.root,
            name: metaData.name,
            version: metaData.version,
            main: main,
            dep: deps
        };
    }

    pkgInfo.metaData = metaData;
    return pkgInfo;
}

/**
 * 读取元素信息
 *
 * @inner
 * @param {string} root 元数据文件所在的根目录路径
 * @param {string} metaFile 元数据文件
 * @return {?Object}
 */
function readMetaData(root, metaFile) {
    try {
        var data = require(path.join(root, metaFile));
        data && (data.root = root);
        return data;
    }
    catch (ex) {
        // do nothing
    }
}

/**
 * 查找给定 json 数据的二级依赖信息
 *
 * @inner
 * @param {Object} data 要查找的数据对象
 * @return {?string}
 */
function findSecondaryDepInfoKey(data) {
    var depKey = null;
    Object.keys(data || {}).some(function (key) {
        var info = data[key] || {};
        if (info.hasOwnProperty('dependencies')) {
            depKey = key;
            return true;
        }
    });

    return depKey;
}

/**
 * 读取包的信息
 *
 * @param {string} pkgDir 包目录
 * @param {?string} pkgRoot 包的根目录
 * @param {boolean} findupBottom 是否向下递归查找，如果找不到包信息
 * @return {?Object}
 */
function readPkgInfo(pkgDir, pkgRoot, findupBottom) {
    pkgRoot || (pkgRoot = pkgDir);
    if (!exports.isPkgExisted(pkgRoot)) {
        return;
    }

    var pkgInfo;
    var manifestInfo = readMetaData(pkgRoot, 'package.json');
    var depKey = findSecondaryDepInfoKey(manifestInfo);
    if (depKey) {
        // 如果有二级依赖信息，则直接采用
        manifestInfo.dependencies = manifestInfo[depKey].dependencies;
        pkgInfo = initPkgInfo(manifestInfo);
        return pkgInfo;
    }

    // 缓存一级依赖信息
    var possibleDeps;
    if (manifestInfo) {
        possibleDeps = manifestInfo.dependencies;
        manifestInfo.dependencies = null;
        pkgInfo = initPkgInfo(manifestInfo);
    }

    manifestInfo = readMetaData(pkgRoot, 'bower.json');
    var bowerDeps = manifestInfo && manifestInfo.dependencies;
    if (bowerDeps || (!pkgInfo && manifestInfo)) {
        // 如果 bower 有依赖信息则直接采用 或者 无 pacakge.json 文件，则才用 bowerjson
        return initPkgInfo(manifestInfo, pkgInfo);
    }

    if (possibleDeps) {
        pkgInfo.dep = possibleDeps;
    }
    else {
        manifestInfo = readMetaData(pkgRoot, 'component.json');
        var componentDeps = manifestInfo && manifestInfo.dependencies;
        if (componentDeps || (!pkgInfo && manifestInfo)) {
            // 如果 component.json 有依赖信息则直接采用
            return initPkgInfo(manifestInfo, pkgInfo);
        }
    }

    if (!pkgInfo && findupBottom) {
        var newPkgRoot;
        fs.readdirSync(pkgRoot).some(
            function (file) {
                var fullPath = path.join(pkgRoot, file);
                var stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    newPkgRoot = fullPath;
                    return true;
                }
            }
        );

        if (newPkgRoot) {
            return readPkgInfo(pkgDir, newPkgRoot, findupBottom);
        }
    }

    pkgInfo || logger.warn('find %s manifest file fail', pkgDir);

    return pkgInfo || {name: path.basename(pkgDir), root: pkgRoot};
}

/**
 * 是否是 scope 模块的目录
 *
 * @param {string} name 目录名
 * @return {boolean}
 */
function isScopeDir(name) {
    return /^@/.test(name);
}

/**
 * 初始化安装过的包
 *
 * @inner
 * @param {Array.<Package>} installedPkgs 要初始化的安装的包列表
 * @param {string} installDir 安装目录
 */
function initInstalledPkgs(installedPkgs, installDir) {
    var files;
    try {
        files = fs.readdirSync(installDir);
    }
    catch (ex) {
        logger.warn(ex);
        return;
    }

    files.forEach(function (fileName) {
        var pkgDir = path.resolve(installDir, fileName);
        var stat = fs.statSync(pkgDir);

        if (stat.isDirectory()) {

            if (isScopeDir(fileName)) {
                initInstalledPkgs(installedPkgs, pkgDir);
                return;
            }

            var pkgInfo = exports.readPackageManifest(pkgDir, null, true);
            pkgInfo.installed = true;
            pkgInfo.installVersion = pkgInfo.version;

            var definedPkg = exports.findPkgFromManifest(pkgInfo.name);
            if (definedPkg) {
                pkgInfo.aliasName = definedPkg.aliasName;
                pkgInfo.version = definedPkg.version;
                pkgInfo.endPoint = definedPkg.endPoint;
            }

            var pkg = new Package(pkgInfo);
            pkg.setDependencies(Package.toPackageArr(
                pkg.dep, exports.getLockInfo(),
                pkg.repos.getDepEndPoint()
            ));
            installedPkgs.push(pkg);
        }
    });
}

/**
 * 读取已经安装的包
 *
 * @inner
 * @return {Array.<Package>}
 */
function readInstalledPkgs() {
    var installedPkgs = [];
    initInstalledPkgs(installedPkgs, exports.getPkgInstallDir());

    return installedPkgs;
}

/**
 * 初始化项目，调用其它方法之前，必须先执行该方法
 *
 * @param {string=} root 指定的项目根目录，可选
 */
exports.initProject = function (root) {
    if (root && !helper.isDirectoryExists(root)) {
        throw new Error('Project root ' + root + ' is not existed.');
    }

    if (!root) {
        var workingDir = process.cwd();
        var findup = require('findup');

        try {
            root = findup.sync(workingDir, config.manifestFile);
        }
        catch (ex) {
            // do nothing
        }

        root || (root = workingDir);
    }

    debug('init project root: %s', root);

    this.root = root;
    this.manifestFile = path.join(root, config.manifestFile);
    this.manifest = readProjectManifest();
    this.installedPkgs = readInstalledPkgs();
};

/**
 * 添加安装成功的包
 *
 * @param {Package} pkg 安装成功的包
 * @param {string} tempPkgDir 临时安装的目录
 */
exports.addInstalledPkg = function (pkg, tempPkgDir) {
    pkg = pkg.getRealPackage();
    var targetDir = this.getPkgInstallPath(pkg.name);
    debug('move temp dir %s to %s', tempPkgDir, targetDir);

    // 移动包到要安装的目录下
    helper.copyDirectory(tempPkgDir, targetDir);

    pkg.newInstalled = true;
    pkg.root = targetDir;
    this.installedPkgs.push(pkg);
};

/**
 * 判断给定的包是否被忽略
 *
 * @param {string} pkgName 要判断的包名
 * @return {boolean}
 */
exports.isIngorePkg = function (pkgName) {
    var ignoreDeps = this.manifest.ignoreDeps;
    return ignoreDeps.indexOf(pkgName) !== -1;
};

/**
 * 移除安装的包
 *
 * @param {Package} pkg 要移除的包
 */
exports.removeInstalledPkg = function (pkg) {
    var result = Package.remove(pkg.name, this.installedPkgs);
    if (result.length) {
        helper.rmDirSync(pkg.root);

        if (isScopeDir(pkg.name)) {
            var parentDir = path.dirname(pkg.root);
            var filter = function (fileName) {
                return fileName && !/^\./.test(fileName);
            };
            if (helper.isEmptyDirSync(parentDir, filter)) {
                helper.rmDirSync(parentDir);
            }
        }
    }
};

/**
 * 保存项目清单信息
 *
 * @param {?Array.<Package>} deps 要更新的依赖信息，可能不存在，如果不存在表示保留原有信息
 * @param {?Array.<Package>} devDeps 要更新的开发依赖信息，可能不存在，如果不存在表示保留原有信息
 */
exports.saveManifestInfo = function (deps, devDeps) {
    debug('save manifest info: deps = %s, devDeps = %s', deps, devDeps);
    var manifest = this.manifest;
    var data = manifest.rawData;
    var info = data;
    var saveKey = manifest.saveKey;
    if (saveKey) {
        info = data[saveKey] || {};
        data[saveKey] = info;
    }

    var rawDepMap = info.dependencies;
    var rawDevDepMap = info.devDependencies;
    deps && (info.dependencies = toDepMap(deps));
    devDeps && (info.devDependencies = toDepMap(devDeps));

    var removePkgs = getRemovePkgs(
        rawDepMap, rawDevDepMap,
        deps && info.dependencies,
        devDeps && info.devDependencies
    );
    debug('remove pkgs: %s', removePkgs.join(','));
    var allUpdatePkgs = [].concat(deps || [], devDeps || []);

    // 更新 require.config 配置信息
    if (deps) {
        var moduleConf = info[config.moduleConfigKey] || {};
        info[config.moduleConfigKey] = moduleConf;

        var baseUrl = manifest.moduleConfig.baseUrl;
        if (!baseUrl) {
            baseUrl = moduleConf.baseUrl = 'src';
        }
        moduleConf.packages = updateModulePackageConfig(
            moduleConf.packages || [], deps,
            removePkgs, allUpdatePkgs,
            path.resolve(this.root, baseUrl)
        );
    }

    // 更新 lock 信息
    var lockInfo = info[config.lockConfigKey] || {};
    removePkgs.forEach(function (name) {
        delete lockInfo[name];
    });
    deps && deps.forEach(function (pkg) {
        initLockModuleInfo(pkg, lockInfo, allUpdatePkgs);
    });
    devDeps && devDeps.forEach(function (pkg) {
        initLockModuleInfo(pkg, lockInfo, allUpdatePkgs);
    });
    info[config.lockConfigKey] = lockInfo;

    // 持久化
    fs.writeFileSync(
        manifest.file, JSON.stringify(data, null, 2), 'UTF-8'
    );
    debug('Save install info done');
};

/**
 * 查找 manifest 上定义的包
 *
 * @param {string} pkgName 要查找的包名
 * @return {?Package}
 */
exports.findPkgFromManifest = function (pkgName) {
    return this.findDepPkgFromManifest(pkgName)
        || this.findDevDepPkgFromManifest(pkgName);
};

/**
 * 查找 manifest 上定义的依赖包
 *
 * @param {string} pkgName 要查找的包名
 * @return {?Package}
 */
exports.findDepPkgFromManifest = function (pkgName) {
    return Package.find(pkgName, this.manifest.deps);
};

/**
 * 查找 manifest 上定义的开发依赖包
 *
 * @param {string} pkgName 要查找的包名
 * @return {?Package}
 */
exports.findDevDepPkgFromManifest = function (pkgName) {
    return Package.find(pkgName, this.manifest.devDeps);
};

/**
 * 查询包安装的锁定信息
 *
 * @param {string} pkgName 要查找的包名
 * @return {?Object}
 */
exports.findPkgLockInfo = function (pkgName) {
    return this.manifest.lockConfig[pkgName];
};

/**
 * 获取包安装锁定信息
 *
 * @return {{Object}}
 */
exports.getLockInfo = function () {
    return this.manifest.lockConfig;
};

/**
 * 读取包的信息，返回包信息结构如下：
 * {
 *   root: string, // 包安装根目录
 *   name: string // 包的名称
 *   version: string // 包的版本
 *   main: string // 包的入口文件
 *   dep: Object // 包的依赖信息 map
 * }
 *
 * @param {string} pkgDir 包所在的目录路径信息
 * @param {string=} pkgRoot 包的根目录，如果未指定，则默认就是 `pkgDir`
 * @param {boolean=} findupBottom 是否需要递归往下查找包的根目录，可选，默认 不需要
 * @return {?Object}
 */
exports.readPackageManifest = readPkgInfo;

/**
 * 获取包的安装路径
 *
 * @param {string} pkgName 包名称
 * @return {string}
 */
exports.getPkgInstallPath = function (pkgName) {
    return path.join(this.getPkgInstallDir(), pkgName);
};

/**
 * 获取包安装目录
 *
 * @return {string}
 */
exports.getPkgInstallDir = function () {
    return path.join(this.root, config.installDir);
};

/**
 * 获取项目包
 *
 * @return {Package}
 */
exports.getProjectPackage = function () {
    var manifest = this.manifest;
    return new Package({
        name: manifest.name,
        version: manifest.version,
        root: this.root,
        installed: true,
        isRoot: true
    });
};

/**
 * 判断给定的包路径是否存在
 *
 * @param {string} pkgPath 包的路径
 * @return {boolean}
 */
exports.isPkgExisted = function (pkgPath) {
    var found = true;
    try {
        var stat = fs.statSync(pkgPath);
        if (!stat.isDirectory()) {
            found = false;
        }
    }
    catch (ex) {
        found = false;
    }

    return found;
};

/**
 * 判断给定的包是否已经安装过
 *
 * @param {string} pkgName 包的名称
 * @return {boolean}
 */
exports.isPkgInstalled = function (pkgName) {
    return !!Package.find(pkgName, this.installedPkgs);
};

/**
 * 查找安装过的包
 *
 * @param {string} pkgName 包的名称
 * @return {?Package}
 */
exports.findInstalledPkg = function (pkgName) {
    return Package.find(pkgName, this.installedPkgs);
};
