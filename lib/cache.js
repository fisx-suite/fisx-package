/**
 * @file 安装过程的包的缓存信息
 * @author sparklewhy@gmail.com
 */

var reposCache = require('./repos/cache');

var pkgMap = {};

function initPkgExpectVersionInfo(pkgName, version) {
    var pkgInfo = pkgMap[pkgName];
    if (!pkgInfo) {
        pkgInfo = {};
    }
    pkgInfo.expectVersion = version;
    pkgMap[pkgName] = pkgInfo;
}

var COMPONENT_TYPE = 'component';
var SCAFFOLD_TYPE = 'scaffold';

/**
 * 初始化安装指定的包的版本信息
 *
 * @param {Array.<Package>} pkgs 要初始化的包
 */
exports.initExpectInstallPkgVersion = function (pkgs) {
    pkgs.forEach(function (item) {
        initPkgExpectVersionInfo(item.name, item.version);
    });
};

/**
 * 获取期待安装的版本信息
 *
 * @param {string} pkgName 包的名称
 * @return {?string}
 */
exports.getInstallExpectVersion = function (pkgName) {
    var pkgInfo = pkgMap[pkgName];
    return pkgInfo ? pkgInfo.expectVersion : null;
};

/**
 * 保存包下载过程的缓存信息
 */
exports.saveReposCacheInfo = function () {
    reposCache.saveReposCacheInfo();
};

/**
 * 获取缓存的根目录
 *
 * @param {string=} type 要查看的缓存的类型: scaffold, component，可选，默认返回缓存的根目录
 * @return {string}
 */
exports.getCacheDir = function (type) {
    return reposCache.getReposCacheDir(
      (type == null) ? undefined : type === COMPONENT_TYPE
    );
};

/**
 * 清理缓存
 *
 * @param {?string} type 要清理缓存的类型: scaffold, component 或者 全部
 * @param {Array.<string>} components 要清理的缓存组件：['npm:jquery', 'etpl']
 */
exports.clearCache = function (type, components) {
    var opts = {};
    type && (type = type.toLowerCase());

    var Package = require('./package');
    components = components && components.map(
        function (item) {
            var pkg = Package.toPackage(item);
            return reposCache.getDownloadURI(pkg.repos);
        }
    );

    opts.components = {
        uris: components,
        isComponent: (type == null) ? undefined : type === COMPONENT_TYPE
    };

    if (!components.length) {
        (type === COMPONENT_TYPE) && (opts[COMPONENT_TYPE] = true);
        (type === SCAFFOLD_TYPE) && (opts[SCAFFOLD_TYPE] = true);
        (type == null) && (opts.all = true);
    }

    reposCache.clearReposCache(opts);
};

