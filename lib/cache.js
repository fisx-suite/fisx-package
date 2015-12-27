/**
 * @file 安装过程的包的缓存信息
 * @author sparklewhy@gmail.com
 */

var pkgMap = {};

function initPkgExpectVersionInfo(pkgName, version) {
    var pkgInfo = pkgMap[pkgName];
    if (!pkgInfo) {
        pkgInfo = {};
    }
    pkgInfo.expectVersion = version;
    pkgMap[pkgName] = pkgInfo;
}

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



